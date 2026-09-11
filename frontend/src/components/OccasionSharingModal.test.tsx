import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Toaster } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { OccasionSharingModal } from "./OccasionSharingModal";

const API = "https://boone-gifts-api.localhost";

/** One list, as `GET /lists?filter=owned` returns it. `shared_via` is empty on
 *  every list the caller owns, which is exactly why the ticked set has to come
 *  from the occasion's own lists instead. */
function list(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "Mum's wishlist",
    description: null,
    owner_id: 1,
    owner_name: "Alice",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 3,
    claimed_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    shared_via: [],
    ...overrides,
  };
}

function renderModal({
  owned = [list()],
  here = [] as ReturnType<typeof list>[],
  ownedStatus = 200,
  hereStatus = 200,
  onClose = vi.fn(),
}: {
  owned?: ReturnType<typeof list>[];
  here?: ReturnType<typeof list>[];
  ownedStatus?: number;
  hereStatus?: number;
  onClose?: () => void;
} = {}) {
  server.use(
    http.get(`${API}/lists`, () =>
      ownedStatus === 200 ? HttpResponse.json(owned) : new HttpResponse(null, { status: ownedStatus }),
    ),
    http.get(`${API}/occasions/7/lists`, () =>
      hereStatus === 200 ? HttpResponse.json(here) : new HttpResponse(null, { status: hereStatus }),
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OccasionSharingModal occasionId={7} occasionName="Christmas 2026" onClose={onClose} />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose, queryClient };
}

/** The `PUT /lists/{id}/occasions/7` calls, in order. */
function captureShares(status = 204) {
  const calls: number[] = [];
  server.use(
    http.put(`${API}/lists/:listId/occasions/7`, ({ params }) => {
      calls.push(Number(params.listId));
      return status === 204
        ? new HttpResponse(null, { status: 204 })
        : new HttpResponse(null, { status });
    }),
  );
  return calls;
}

function row(name: string) {
  return screen.getByRole("checkbox", { name: `Share ${name}` });
}

describe("OccasionSharingModal", () => {
  it("names the occasion it is sharing into", async () => {
    renderModal();

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
  });

  it("shares a list on the tick — one PUT, no Save step, and the row goes dead", async () => {
    const user = userEvent.setup();
    const shared = list({ id: 10, name: "Mum's wishlist" });
    const calls: number[] = [];
    // The refetch after the write reports the list as shared here, which is what
    // ticks the row: the selection is server state, never anything held locally.
    let done = false;
    server.use(
      http.get(`${API}/lists`, () => HttpResponse.json([shared])),
      http.get(`${API}/occasions/7/lists`, () => HttpResponse.json(done ? [shared] : [])),
      http.put(`${API}/lists/10/occasions/7`, () => {
        done = true;
        calls.push(10);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OccasionSharingModal occasionId={7} occasionName="Christmas 2026" onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("checkbox", { name: "Share Mum's wishlist" }));

    await waitFor(() => expect(calls).toEqual([10]));
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();

    const shareRow = await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
    await waitFor(() => expect(shareRow).toBeChecked());
    expect(shareRow).toBeDisabled();
    expect(screen.getByText(/Already shared here/)).toBeInTheDocument();
  });

  // Rule 6's third arm: in occasion mode the *tick* is the dead one, because
  // the write is add-only and revoking has a home — the list's own modal.
  it("renders an already-shared list ticked, dead, and says where to change it", async () => {
    const user = userEvent.setup();
    const calls = captureShares();
    const shared = list({ id: 10, name: "Mum's wishlist" });
    renderModal({ owned: [shared, list({ id: 11, name: "Dad's birthday" })], here: [shared] });

    const already = await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
    expect(already).toBeChecked();
    expect(already).toBeDisabled();
    expect(screen.getByText(/Already shared here/)).toBeInTheDocument();
    expect(screen.getByText(/change this from the list/)).toBeInTheDocument();

    await user.click(already);
    expect(calls).toEqual([]);

    // The other row is live, so the section is not simply dead.
    expect(screen.getByRole("checkbox", { name: "Share Dad's birthday" })).toBeEnabled();
  });

  // The population is `?filter=owned&archived=false`, so both exclusions are the
  // server's. What is asserted is that nothing here puts them back.
  it("offers only the viewer's own live lists", async () => {
    // Someone else's list shared to this occasion is in `here` and not in
    // `owned`: it must not become a row off the back of the intersection.
    const theirs = list({ id: 31, name: "Gran's list", owner_id: 9, owner_name: "Gran" });
    renderModal({ owned: [list({ id: 10, name: "Mum's wishlist" })], here: [theirs] });

    expect(await screen.findByRole("checkbox", { name: "Share Mum's wishlist" })).toBeInTheDocument();
    expect(screen.queryByText("Gran's list")).not.toBeInTheDocument();
  });

  // The population is `?filter=owned&archived=false`, so the server does the
  // excluding — but a fixture that leaked one through must not become a row
  // either: an archived list is one the owner has put away, and offering it as
  // something to share into a live occasion is the opposite of what that meant.
  it("does not offer an archived list of the viewer's own", async () => {
    renderModal({
      owned: [
        list({ id: 10, name: "Mum's wishlist" }),
        list({ id: 11, name: "Last year's list", is_archived: true }),
      ],
    });

    await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
    expect(screen.queryByText("Last year's list")).not.toBeInTheDocument();
  });

  it("asks the server for owned, unarchived lists only", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json([list()]);
      }),
      http.get(`${API}/occasions/7/lists`, () => HttpResponse.json([])),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OccasionSharingModal occasionId={7} occasionName="Christmas 2026" onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
    expect(seen[0]).toContain("filter=owned");
    expect(seen[0]).toContain("archived=false");
  });

  describe("the summary sentence", () => {
    it("says so when none of the viewer's lists are here", async () => {
      renderModal({ owned: [list()], here: [] });

      expect(await screen.findByText("None of your lists are shared here yet.")).toBeInTheDocument();
    });

    it("counts one", async () => {
      const shared = list({ id: 10 });
      renderModal({ owned: [shared], here: [shared] });

      expect(await screen.findByText("1 of your lists is shared here.")).toBeInTheDocument();
    });

    // The viewer's own lists, never the occasion's total: `here` carries a third
    // list owned by someone else, and the sentence does not count it.
    it("counts several, and only the viewer's own", async () => {
      const mine = [list({ id: 10, name: "A" }), list({ id: 11, name: "B" })];
      renderModal({
        owned: [...mine, list({ id: 12, name: "C" })],
        here: [...mine, list({ id: 31, name: "Gran's", owner_id: 9 })],
      });

      expect(await screen.findByText("2 of your lists are shared here.")).toBeInTheDocument();
    });
  });

  it("tells a viewer who owns nothing, and offers a way to make one", async () => {
    renderModal({ owned: [] });

    expect(await screen.findByText(/You don't have any lists yet\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a list" })).toHaveAttribute(
      "href",
      "/lists/new",
    );
    // Said apart from a query that matched nothing.
    expect(screen.queryByText(/No lists match/)).not.toBeInTheDocument();
  });

  describe("the filter", () => {
    it("matches list names", async () => {
      const user = userEvent.setup();
      renderModal({
        owned: [list({ id: 10, name: "Mum's wishlist" }), list({ id: 11, name: "Dad's birthday" })],
      });

      await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
      await user.type(screen.getByRole("searchbox", { name: "Filter your lists" }), "dad");

      expect(screen.getByText("Dad's birthday")).toBeInTheDocument();
      expect(screen.queryByText("Mum's wishlist")).not.toBeInTheDocument();
    });

    it("says a query matched nothing, in the words the other dialog uses", async () => {
      const user = userEvent.setup();
      renderModal({ owned: [list({ name: "Mum's wishlist" })] });

      await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
      await user.type(screen.getByRole("searchbox", { name: "Filter your lists" }), "zzz");

      expect(screen.getByText('No lists match "zzz"')).toBeInTheDocument();
      expect(screen.queryByText(/You don't have any lists yet/)).not.toBeInTheDocument();
    });

    // CONTEXT.md rule 6, in this mode: a filter that drops disabled rows
    // recreates the "why isn't my list here?" question the rule exists to
    // answer.
    it("does not hide a disabled already-shared row that matches", async () => {
      const user = userEvent.setup();
      const shared = list({ id: 10, name: "Mum's wishlist" });
      renderModal({ owned: [shared, list({ id: 11, name: "Dad's birthday" })], here: [shared] });

      await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
      await user.type(screen.getByRole("searchbox", { name: "Filter your lists" }), "mum");

      const survivor = screen.getByRole("checkbox", { name: "Share Mum's wishlist" });
      expect(survivor).toBeDisabled();
      expect(screen.getByText(/Already shared here/)).toBeInTheDocument();
    });
  });

  it("invalidates the occasion's lists, the index, the lists and the list itself", async () => {
    const user = userEvent.setup();
    captureShares();
    const { queryClient } = renderModal({ owned: [list({ id: 10 })] });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("checkbox", { name: "Share Mum's wishlist" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["occasion-lists", 7]));
    expect(keys).toContain(JSON.stringify(["occasions"]));
    expect(keys).toContain(JSON.stringify(["lists"]));
    expect(keys).toContain(JSON.stringify(["list", 10]));
  });

  describe("when the share fails", () => {
    it("names the list and the occasion, and leaves the row unticked", async () => {
      const user = userEvent.setup();
      captureShares(500);
      renderModal({ owned: [list({ id: 10, name: "Mum's wishlist" })] });

      await user.click(await screen.findByRole("checkbox", { name: "Share Mum's wishlist" }));

      expect(
        await screen.findByText(`Couldn't share "Mum's wishlist" with Christmas 2026.`),
      ).toBeInTheDocument();
      expect(row("Mum's wishlist")).not.toBeChecked();
    });

    it("says the occasion has been archived on a 409", async () => {
      const user = userEvent.setup();
      captureShares(409);
      renderModal({ owned: [list({ id: 10, name: "Mum's wishlist" })] });

      await user.click(await screen.findByRole("checkbox", { name: "Share Mum's wishlist" }));

      // The same sentence the disabled control says, plus the way out — one
      // fact, one wording (the drift decision 1 exists to end).
      expect(
        await screen.findByText(
          "This occasion is archived, so lists can't be shared to it. Ask an organizer to unarchive it.",
        ),
      ).toBeInTheDocument();
    });
  });

  // A failed read leaves the count at zero, and "none of your lists are shared
  // here" is far too load-bearing a sentence to say on the strength of a request
  // that never answered.
  it("does not claim an empty state on a failed read", async () => {
    renderModal({ hereStatus: 500 });

    expect(await screen.findByText("Couldn't load what's shared here.")).toBeInTheDocument();
    expect(screen.queryByText(/None of your lists are shared here/)).not.toBeInTheDocument();
    expect(screen.getByText("Failed to load your lists.")).toBeInTheDocument();
  });

  it("closes on Done without writing anything", async () => {
    const user = userEvent.setup();
    const calls = captureShares();
    const { onClose } = renderModal();

    await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });

  it("groups the rows under one heading", async () => {
    renderModal({ owned: [list({ id: 10, name: "Mum's wishlist" })] });

    await screen.findByRole("checkbox", { name: "Share Mum's wishlist" });

    expect(screen.getByRole("heading", { name: "Your lists" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
