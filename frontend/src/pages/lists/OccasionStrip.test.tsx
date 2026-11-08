import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import toast from "react-hot-toast";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { NavigationDepthProvider } from "../../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../../test/arrived-from";
import { OccasionStrip } from "./OccasionStrip";

const API = "https://boone-gifts-api.localhost";

/** One row of `GET /occasions?archived=false`, as the index returns it. */
function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    family_id: 10,
    name: "Christmas 2026",
    is_archived: false,
    created_by_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    family_name: "Boone Family",
    list_count: 3,
    my_claimed_count: 0,
    my_bought_count: 0,
    // Never null: the server floors it at created_at.
    last_activity_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function occasions(rows: ReturnType<typeof summary>[]) {
  server.use(http.get(`${API}/occasions`, () => HttpResponse.json(rows)));
}

/** The strip alone, at whichever URL the test needs. No AuthProvider: the strip
 *  reads no identity, only the one query. */
function renderStrip(path = "/lists") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <OccasionStrip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Five occasions, so the "See all" control is in play. */
function five() {
  return [
    summary({ id: 1, name: "Christmas 2026" }),
    summary({ id: 2, name: "Diwali 2026" }),
    summary({ id: 3, name: "Mum's Birthday" }),
    summary({ id: 4, name: "Anniversary" }),
    summary({ id: 5, name: "Eid 2026" }),
  ];
}

describe("OccasionStrip", () => {
  // The contract is the same as ActionableBanner's: absent entirely, not empty.
  it("renders nothing at all when the viewer has no occasions", async () => {
    occasions([]);
    const { container } = renderStrip();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("heading", { name: /occasions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Occasions" })).not.toBeInTheDocument();
  });

  it("renders a card per occasion with its name, family and list count", async () => {
    occasions([summary({ id: 7, name: "Christmas 2026", family_name: "Boone Family", list_count: 3 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    expect(within(card).getByText("Christmas 2026")).toBeInTheDocument();
    // Not decoration: two families routinely both call an occasion "Christmas 2026".
    expect(within(card).getByText("Boone Family")).toBeInTheDocument();
    expect(within(card).getByText("3 lists")).toBeInTheDocument();
  });

  it("renders the cards in the order the server returned them", async () => {
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    // The server orders by last_activity_at DESC, id DESC and the client never
    // re-sorts — the definition of that clock lives server-side.
    const names = screen.getAllByRole("listitem").map((card) => card.querySelector("p")?.textContent);
    expect(names).toEqual(["Christmas 2026", "Diwali 2026", "Mum's Birthday", "Anniversary"]);
  });

  it("suppresses the bought line entirely when the viewer has claimed nothing", async () => {
    occasions([summary({ my_claimed_count: 0, my_bought_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // An untouched occasion reads as empty, not as "0 of 0 bought".
    expect(within(card).queryByText(/bought/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/0 of 0/)).not.toBeInTheDocument();
  });

  it("renders the bought line at zero bought, which is a real state", async () => {
    occasions([summary({ my_claimed_count: 3, my_bought_count: 0 })]);
    renderStrip();

    expect(await screen.findByText("0 of 3 bought")).toBeInTheDocument();
  });

  it("shows no monetary amount anywhere", async () => {
    occasions([
      summary({ id: 1, my_claimed_count: 4, my_bought_count: 2 }),
      summary({ id: 2, name: "Diwali 2026", my_claimed_count: 1, my_bought_count: 1 }),
    ]);
    const { container } = renderStrip();

    await screen.findByText("2 of 4 bought");
    // /lists is the first screen the app shows; a budget figure here puts the
    // viewer's spend in front of whoever is standing behind them. Fails loudly
    // if a later ticket imports BudgetLine.
    expect(container.textContent).not.toMatch(/[$£€]/);
  });

  it("shows four cards and a See all control when there are more", async () => {
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    // N is the total, not the remainder.
    expect(screen.getByRole("button", { name: "See all 5" })).toBeInTheDocument();
  });

  it("expands in place and collapses again from the same control", async () => {
    const user = userEvent.setup();
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    await user.click(screen.getByRole("button", { name: "See all 5" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Eid 2026")).toBeInTheDocument();

    // An expansion the viewer can set and cannot unset is a trap.
    const collapse = screen.getByRole("button", { name: "Show fewer" });
    await user.click(collapse);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "See all 5" })).toBeInTheDocument();
  });

  it("writes ?occasions=all without stacking a history entry", async () => {
    const user = userEvent.setup();
    occasions(five());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function At() {
      return <p>at: {useLocation().pathname + useLocation().search}</p>;
    }
    function Back() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>back</button>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/people", "/lists"]} initialIndex={1}>
          <At />
          <OccasionStrip />
          <Back />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Christmas 2026");
    await user.click(screen.getByRole("button", { name: "See all 5" }));
    expect(screen.getByText("at: /lists?occasions=all")).toBeInTheDocument();

    // The expansion is a preference about a page the viewer is already on, not
    // a place: Back leaves /lists rather than collapsing the strip.
    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /people")).toBeInTheDocument();
  });

  it("says nothing about a list count on an occasion with no lists", async () => {
    occasions([summary({ list_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // The control, and nothing more — not "0 lists" over it.
    expect(within(card).getByRole("button", { name: "Share a list" })).toBeInTheDocument();
    expect(within(card).queryByText(/0 lists/)).not.toBeInTheDocument();
  });

  it("offers no control when there are four or fewer", async () => {
    occasions(five().slice(0, 4));
    renderStrip();

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /See all/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show fewer" })).not.toBeInTheDocument();
  });

  it("renders expanded on first paint at /lists?occasions=all", async () => {
    occasions(five());
    renderStrip("/lists?occasions=all");

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("states the condition on an occasion with no lists, and still links to it", async () => {
    occasions([summary({ id: 9, list_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // NEU-1308 replaced the "No lists yet" sentence with the control that ends
    // the condition — the CTA is what the body slot was shaped for.
    expect(within(card).getByRole("button", { name: "Share a list" })).toBeInTheDocument();
    expect(within(card).queryByText("No lists yet")).not.toBeInTheDocument();
    // Every occasion keeps its route — that page holds the budget and the
    // shopping tab, which is the whole argument of ADR 0007.
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/occasions/9");
  });

  it("shows both the empty-body control and the bought line on an unshared occasion", async () => {
    // A claim filed under an occasion survives its list being unshared, so 0
    // lists and a non-zero bought line is a legitimate pair (NEU-1292).
    occasions([summary({ id: 9, list_count: 0, my_claimed_count: 2, my_bought_count: 1 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    expect(within(card).getByRole("button", { name: "Share a list" })).toBeInTheDocument();
    expect(within(card).getByText("1 of 2 bought")).toBeInTheDocument();
  });

  it("renders nothing while the query is pending", () => {
    server.use(http.get(`${API}/occasions`, () => new Promise(() => {})));
    const { container } = renderStrip();

    // No skeleton: a placeholder that collapses to nothing for a viewer with no
    // occasions is its own flash.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and says so when the load fails", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    server.use(http.get(`${API}/occasions`, () => new HttpResponse(null, { status: 500 })));

    const { container } = renderStrip();

    // A viewer who has occasions and sees no strip otherwise cannot tell a
    // failure from having none.
    await waitFor(() => expect(error).toHaveBeenCalledWith("Couldn't load your occasions."));
    expect(container).toBeEmptyDOMElement();
    error.mockRestore();
  });
});

/** One list the viewer owns, as `GET /lists?filter=owned` returns it — the
 *  population the dialog the strip mounts offers. */
function ownedList(overrides: Record<string, unknown> = {}) {
  return {
    id: 20,
    name: "My wishlist",
    description: null,
    owner_id: 1,
    owner_name: "Alice",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 1,
    claimed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    shared_via: [],
    ...overrides,
  };
}

/** The strip, its address, and a Back button — `?share` is a place, and neither
 *  it nor Back is visible through the strip's own markup. */
function renderSharing({
  rows = [summary({ id: 7, name: "Christmas 2026", list_count: 0 })],
  owned = [ownedList()],
  here = [] as ReturnType<typeof ownedList>[],
  entries = ["/lists"],
  arrive = false,
}: {
  rows?: ReturnType<typeof summary>[];
  owned?: ReturnType<typeof ownedList>[];
  here?: ReturnType<typeof ownedList>[];
  entries?: string[];
  /** Push into `/lists` rather than entering on it, so the close path is at
   *  depth > 0 — a deeper `initialEntries` would not do, because that is still
   *  an entry location and still depth 0 (NEU-1302). */
  arrive?: boolean;
} = {}) {
  occasions(rows);
  server.use(
    http.get(`${API}/lists`, () => HttpResponse.json(owned)),
    http.get(`${API}/occasions/:id/lists`, () => HttpResponse.json(here)),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function At() {
    const location = useLocation();
    return <p>{`at: ${location.pathname}${location.search}`}</p>;
  }
  function Back() {
    const navigate = useNavigate();
    return <button onClick={() => navigate(-1)}>back</button>;
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
          <NavigationDepthProvider>
            <At />
            {arrive && <ArrivedFrom to="/lists" />}
            <OccasionStrip />
            <Back />
          </NavigationDepthProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/**
 * The empty card's way out (NEU-1308).
 *
 * The card **opens** the dialog and the strip **mounts** it, because a
 * successful share is exactly what makes the card's body slot stop rendering.
 */
describe("OccasionStrip — sharing a list into an occasion", () => {
  it("opens the dialog for the card's own occasion, naming it in the address", async () => {
    const user = userEvent.setup();
    renderSharing();

    await user.click(await screen.findByRole("button", { name: "Share a list" }));

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
    // `open` would not say which of four cards this is.
    expect(screen.getByText("at: /lists?share=7")).toBeInTheDocument();
  });

  it("names the card that opened it, not the first one", async () => {
    const user = userEvent.setup();
    renderSharing({
      rows: [
        summary({ id: 7, name: "Christmas 2026", list_count: 3 }),
        summary({ id: 8, name: "Diwali 2026", list_count: 0 }),
      ],
    });

    await user.click(await screen.findByRole("button", { name: "Share a list" }));

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Diwali 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("at: /lists?share=8")).toBeInTheDocument();
  });

  it("mounts the dialog on a deep link to ?share=<id>", async () => {
    renderSharing({ entries: ["/lists?share=7"] });

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
  });

  // The heal waits for the index: scrubbing on the first render would strip a
  // perfectly good id before the query that could recognise it has answered.
  it("strips an id that is not among the viewer's occasions, once the index resolves", async () => {
    renderSharing({ entries: ["/lists?share=999"] });

    await screen.findByText("Christmas 2026");
    await waitFor(() => expect(screen.getByText("at: /lists")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("strips a value that is not an id at all", async () => {
    renderSharing({ entries: ["/lists?share=banana"] });

    await screen.findByText("Christmas 2026");
    await waitFor(() => expect(screen.getByText("at: /lists")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Rule 8: the app pushed the open entry, so Back closes the dialog, and a
  // second Back leaves the page rather than reopening it.
  it("closes on Back, and does not reopen on the next Back press", async () => {
    const user = userEvent.setup();
    renderSharing({ entries: ["/people"], arrive: true });

    await user.click(await screen.findByRole("button", { name: "arrive" }));
    await user.click(await screen.findByRole("button", { name: "Share a list" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("at: /lists")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /people")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Done and leaves one entry behind, not two", async () => {
    const user = userEvent.setup();
    renderSharing({ entries: ["/people"], arrive: true });

    await user.click(await screen.findByRole("button", { name: "arrive" }));
    await user.click(await screen.findByRole("button", { name: "Share a list" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByText("at: /lists")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /people")).toBeInTheDocument();
  });

  // Decision 6's regression: a successful share takes list_count from 0 to 1,
  // which unmounts the card's body slot. A dialog owned by the card would go
  // with it, mid-session, with the filter typed.
  it("keeps the dialog mounted when the card that opened it loses its body", async () => {
    const user = userEvent.setup();
    let shared = false;
    occasions([summary({ id: 7, name: "Christmas 2026", list_count: 0 })]);
    server.use(
      // The refetch after the share reports the occasion as populated, so the
      // card's button goes away under the open dialog.
      http.get(`${API}/occasions`, () =>
        HttpResponse.json([
          summary({ id: 7, name: "Christmas 2026", list_count: shared ? 1 : 0 }),
        ]),
      ),
      http.get(`${API}/lists`, () => HttpResponse.json([ownedList()])),
      http.get(`${API}/occasions/7/lists`, () =>
        HttpResponse.json(shared ? [ownedList()] : []),
      ),
      http.put(`${API}/lists/20/occasions/7`, () => {
        shared = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/lists"]}>
          <OccasionStrip />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Share a list" }));
    await user.click(await screen.findByRole("checkbox", { name: "Share My wishlist" }));

    // The card's body slot is gone…
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Share a list" })).not.toBeInTheDocument(),
    );
    // …and the dialog the viewer is standing in is not.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("1 of your lists is shared here.")).toBeInTheDocument();
  });
});
