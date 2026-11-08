import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import toast, { Toaster } from "react-hot-toast";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { ListSharingModal } from "./ListSharingModal";
import { SharingModal, type PersonRow, type SharingSelection } from "./SharingModal";

const API = "https://boone-gifts-api.localhost";

const ownerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const connections = [
  {
    id: 5,
    status: "accepted",
    user: { id: 2, name: "Alice", email: "alice@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
  {
    id: 6,
    status: "accepted",
    user: { id: 3, name: "Bob", email: "bob@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
];

/**
 * One family of each shape the control has to render (project spec §5.2).
 *
 * Every family holds the owner and nobody else, so no connection is covered
 * here: coverage is what disables a People row, and a test that cares about it
 * says so by serving its own targets.
 */
const shareTargets = [
  {
    id: 7,
    name: "The Boones",
    member_ids: [1],
    occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
  },
  {
    id: 8,
    name: "The Smiths",
    member_ids: [1],
    occasions: [{ id: 20, name: "Easter 2026", is_archived: false, shared: false }],
  },
  {
    id: 9,
    name: "The Joneses",
    member_ids: [1],
    occasions: [
      { id: 31, name: "Jones Christmas", is_archived: false, shared: false },
      { id: 32, name: "Jones Birthdays", is_archived: false, shared: false },
    ],
  },
  { id: 11, name: "Work Friends", member_ids: [1], occasions: [] },
];

/** Everything the panel reads, so a test only overrides what it cares about. */
function serveSharingState({
  shares = [] as { id: number; list_id: number; user_id: number; created_at: string }[],
  targets = shareTargets,
} = {}) {
  server.use(
    http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    http.get(`${API}/lists/1/shares`, () => HttpResponse.json(shares)),
    http.get(`${API}/lists/1/families`, () => HttpResponse.json(targets)),
  );
}

/**
 * The whole live suite runs through `ListSharingModal`, the container that
 * holds the queries and the mutations — the dialog's behaviour is unchanged by
 * NEU-1307's controlled refactor, and these assertions are the guard that says
 * so. The controlled seam itself is exercised at the bottom of the file,
 * against the shell alone.
 */
function renderModal(onClose = vi.fn()) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: ownerToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <ListSharingModal listId={1} queryClient={queryClient} onClose={onClose} />
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

describe("SharingModal — one dialog for people and families", () => {
  it("puts both groups in a single dialog over the page, families first", async () => {
    // The order is deliberate, not incidental: families is the broader stroke,
    // and it decides what the People rows can even offer (NEU-1284).
    serveSharingState();

    renderModal();

    const panel = await screen.findByRole("dialog", { name: "Who can see this list" });
    expect(panel).toHaveAttribute("aria-modal", "true");
    const headings = within(panel)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Families", "People"]);

    expect(await within(panel).findByRole("checkbox", { name: /share with alice/i })).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /share with the boones/i })).toBeInTheDocument();
  });

  it("closes on Done", async () => {
    serveSharingState();

    const { onClose } = renderModal();

    await userEvent.click(await screen.findByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape, the same way Done does", async () => {
    serveSharingState();

    const { onClose } = renderModal();

    await screen.findByRole("dialog", { name: "Who can see this list" });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens with the filter box focused", async () => {
    // It falls out of `Modal`'s "first tabbable element" rule rather than
    // needing an autoFocus prop: the filter is first in the markup.
    serveSharingState();

    renderModal();

    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: /filter people and families/i })).toHaveFocus(),
    );
  });
});

describe("SharingModal — one filter across both sections", () => {
  /** A family with no active occasion, a person a live occasion share already
   *  reaches, and a family and a person that share no word with either. */
  const boonesCoveringGran = {
    id: 7,
    name: "The Boones",
    member_ids: [1, 3],
    occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
  };
  const dead = [
    boonesCoveringGran,
    { id: 11, name: "Boone Cousins", member_ids: [1], occasions: [] },
    {
      id: 12,
      name: "Work Friends",
      member_ids: [1],
      occasions: [{ id: 20, name: "Easter 2026", is_archived: false, shared: false }],
    },
  ];

  function serveGran() {
    server.use(
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          connections[0],
          {
            id: 6,
            status: "accepted",
            user: { id: 3, name: "Gran Boone", email: "gran@test.com" },
            created_at: "2026-01-01",
            accepted_at: "2026-01-02",
          },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(dead)),
    );
  }

  async function filterFor(query: string) {
    const box = await screen.findByRole("searchbox", { name: /filter people and families/i });
    await userEvent.type(box, query);
  }

  it("narrows both sections from one box", async () => {
    // Someone typing "boone" does not know or care whether Boone is a family or
    // a surname, and one box answers both.
    serveGran();

    renderModal();
    await filterFor("boone");

    expect(screen.getByRole("checkbox", { name: /share with the boones/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /share with gran boone/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /share with work friends/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /share with alice/i })).not.toBeInTheDocument();
  });

  // The assertion the ticket asks for by name. A filter that dropped these rows
  // would recreate the "why can't I share with Gran?" question CONTEXT.md
  // rule 6 exists to answer.
  it("keeps a matching row that is disabled, greyed, with its reason", async () => {
    serveGran();

    renderModal();
    await filterFor("boone");

    const family = screen.getByRole("checkbox", { name: /share with boone cousins/i });
    expect(family).toBeDisabled();
    expect(screen.getByText(/no active occasion/i)).toBeInTheDocument();

    const person = screen.getByRole("checkbox", { name: /share with gran boone/i });
    expect(person).toBeDisabled();
    expect(screen.getByText("Already sees this through The Boones")).toBeInTheDocument();
  });

  it("matches a person on their email", async () => {
    // The email is on the row, so a viewer typing what they can see should find
    // it — and it is what separates two people called Chris.
    serveGran();

    renderModal();
    await filterFor("gran@test");

    expect(screen.getByRole("checkbox", { name: /share with gran boone/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /share with alice/i })).not.toBeInTheDocument();
  });

  it("matches a synthesised row on its name, the one it has", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 42, created_at: "2026-01-01" }])
      ),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
    );

    renderModal();
    await filterFor("user 42");

    expect(screen.getByRole("checkbox", { name: /share with user 42/i })).toBeInTheDocument();
  });

  it("does not match a family on an occasion name the select keeps collapsed", async () => {
    // An occasion is not the row's identity, and a row matching on text inside
    // a control the viewer cannot see is worse than one that does not appear.
    serveGran();

    renderModal();
    await filterFor("christmas");

    expect(
      screen.queryByRole("checkbox", { name: /share with the boones/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No families match "christmas"')).toBeInTheDocument();
  });

  it("words no-match apart from no-data, per section, keeping both headings", async () => {
    // Showing "add a connection" to someone with forty of them would be a lie,
    // and both headings stay so the viewer can see which population came up
    // empty rather than guessing.
    serveGran();

    renderModal();
    await filterFor("cousins");

    expect(screen.getByText('No people match "cousins"')).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /share with boone cousins/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/don't have any connections/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Families", "People"]);
  });

  it("renders the filter box even with nothing to filter", async () => {
    // A control that appears once you cross some row count is one nobody learns.
    serveSharingState({ targets: [] });
    server.use(http.get(`${API}/connections`, () => HttpResponse.json([])));

    renderModal();

    expect(
      await screen.findByRole("searchbox", { name: /filter people and families/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/don't belong to any families/i)).toBeInTheDocument();
    expect(screen.getByText(/don't have any connections/i)).toBeInTheDocument();
  });
});

describe("SharingModal — the shared-with line", () => {
  /** A family whose occasion is shared, or not. */
  const family = (id: number, name: string, shared: boolean) => ({
    id,
    name,
    member_ids: [1],
    occasions: [{ id: id * 10, name: `${name} Christmas`, is_archived: false, shared }],
  });
  const share = (userId: number) => ({
    id: userId,
    list_id: 1,
    user_id: userId,
    created_at: "2026-01-01",
  });

  it("reuses the header's sentence when nothing is ticked", async () => {
    serveSharingState({ targets: [family(7, "The Boones", false)] });

    renderModal();

    expect(await screen.findByText("This list isn't shared with anyone.")).toBeInTheDocument();
  });

  it.each([
    ["1 family", [family(7, "The Boones", true)], []],
    ["2 families", [family(7, "The Boones", true), family(8, "The Smiths", true)], []],
    ["1 person", [family(7, "The Boones", false)], [share(2)]],
    ["3 people", [family(7, "The Boones", false)], [share(2), share(3), share(4)]],
    [
      "2 families and 1 person",
      [family(7, "The Boones", true), family(8, "The Smiths", true)],
      [share(2)],
    ],
  ])("counts the ticked boxes as %s", async (expected, targets, shares) => {
    serveSharingState({ shares, targets });

    renderModal();

    expect(await screen.findByText(`Shared with ${expected}`)).toBeInTheDocument();
  });

  it("does not claim a list is unshared when the read failed", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json(connections)),
      http.get(`${API}/lists/1/shares`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
    );

    renderModal();

    expect(
      await screen.findByText("Couldn't load who this list is shared with."),
    ).toBeInTheDocument();
    expect(screen.queryByText("This list isn't shared with anyone.")).not.toBeInTheDocument();
  });
});

describe("SharingModal — people", () => {
  it("checks the connections the list is already shared with", async () => {
    serveSharingState({ shares: [{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }] });

    renderModal();

    expect(await screen.findByRole("checkbox", { name: /share with alice/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with bob/i })).not.toBeChecked();
  });

  it("checking a person POSTs the share", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.post(`${API}/lists/1/shares`, async ({ request }) => {
        shared(await request.json());
        return HttpResponse.json(
          { id: 1, list_id: 1, user_id: 3, created_at: "2026-01-01" },
          { status: 201 },
        );
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with bob/i }));
    await waitFor(() => expect(shared).toHaveBeenCalledWith({ user_id: 3 }));
  });

  it("unchecking a person DELETEs the share", async () => {
    const revoked = vi.fn();
    serveSharingState({ shares: [{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }] });
    server.use(
      http.delete(`${API}/lists/1/shares/2`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with alice/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("keeps a revokable row for a share held by someone no longer connected", async () => {
    // The header summary still reads "Shared with User 42", and this panel is
    // the only place to switch that off — so it has to offer the row.
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 42, created_at: "2026-01-01" }])
      ),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
      http.delete(`${API}/lists/1/shares/42`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    const row = await screen.findByRole("checkbox", { name: /share with user 42/i });
    expect(row).toBeChecked();

    await userEvent.click(row);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("says so when there are no connections, and points at People", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
    );

    renderModal();

    expect(await screen.findByText(/don't have any connections/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a connection/i })).toHaveAttribute("href", "/people");
  });
});

describe("SharingModal — people an occasion share already reaches", () => {
  /** The Boones, reaching Bob (user 3) through a live occasion. */
  const boonesCoveringBob = {
    id: 7,
    name: "The Boones",
    member_ids: [1, 3],
    occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
  };

  it("disables an unshared connection the family already reaches, and names the family", async () => {
    serveSharingState({ targets: [boonesCoveringBob] });

    renderModal();

    const box = await screen.findByRole("checkbox", { name: /share with bob/i });
    expect(box).toBeDisabled();
    expect(screen.getByText("Already sees this through The Boones")).toBeInTheDocument();
    // The reason replaces the email: it is why the control is dead, and the
    // email was only decoration.
    expect(screen.queryByText("bob@test.com")).not.toBeInTheDocument();

    // A connection no family reaches is untouched.
    expect(screen.getByRole("checkbox", { name: /share with alice/i })).toBeEnabled();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });

  it("names every family that covers a person", async () => {
    // Naming only the first would send the owner to untick a family that leaves
    // the row disabled anyway.
    serveSharingState({
      targets: [
        boonesCoveringBob,
        {
          id: 8,
          name: "The Smiths",
          member_ids: [1, 3],
          occasions: [{ id: 20, name: "Easter 2026", is_archived: false, shared: true }],
        },
      ],
    });

    renderModal();

    expect(
      await screen.findByText("Already sees this through The Boones and The Smiths"),
    ).toBeInTheDocument();
  });

  it("leaves a connection reached only by an archived share operable, and unannotated", async () => {
    // An archived share still grants sight, but that route is winding down, so
    // the direct share is the useful thing to offer — and the row says nothing
    // about a state most owners never reach.
    serveSharingState({
      targets: [
        {
          id: 7,
          name: "The Boones",
          member_ids: [1, 3],
          occasions: [{ id: 10, name: "Christmas 2025", is_archived: true, shared: true }],
        },
      ],
    });

    renderModal();

    expect(await screen.findByRole("checkbox", { name: /share with bob/i })).toBeEnabled();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();
  });

  it("keeps a direct share operable and revokable while a family covers the same person", async () => {
    // You can always remove a grant; you just cannot add a redundant one. This
    // panel is the only revoke surface there is.
    const revoked = vi.fn();
    serveSharingState({
      shares: [{ id: 1, list_id: 1, user_id: 3, created_at: "2026-01-01" }],
      targets: [boonesCoveringBob],
    });
    server.use(
      http.delete(`${API}/lists/1/shares/3`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    const box = await screen.findByRole("checkbox", { name: /share with bob/i });
    expect(box).toBeChecked();
    expect(box).toBeEnabled();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();

    await userEvent.click(box);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("re-enables the row when the covering family is unticked, with no reload", async () => {
    // Both halves read the same share-targets query, so the untick's
    // invalidation repaints the People row on its own.
    let shared = true;
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json(connections)),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
          { ...boonesCoveringBob, occasions: [{ ...boonesCoveringBob.occasions[0], shared }] },
        ])
      ),
      http.delete(`${API}/lists/1/occasions/10`, () => {
        shared = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    expect(await screen.findByRole("checkbox", { name: /share with bob/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the boones/i }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /share with bob/i })).toBeEnabled()
    );
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });
});

describe("SharingModal — families", () => {
  // react-hot-toast keeps its queue at module level, so a toast raised by one
  // test outlives `cleanup()` and shows up in the next one.
  beforeEach(() => toast.remove());

  it("names the occasion a family with one is reached through, and shares to it", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/20`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    // One occasion is displayed, not offered: no select, and one click shares.
    expect(await screen.findByText("Easter 2026")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /occasion for the smiths/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the smiths/i }));
    await waitFor(() => expect(shared).toHaveBeenCalled());
  });

  it("checks the family whose occasion already holds the share, and names it", async () => {
    serveSharingState();

    renderModal();

    expect(await screen.findByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
    expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /share with the smiths/i })).not.toBeChecked();
  });

  it("disables a family with no active occasion and says why", async () => {
    serveSharingState();

    renderModal();

    const box = await screen.findByRole("checkbox", { name: /share with work friends/i });
    expect(box).toBeDisabled();
    expect(screen.getByText(/no active occasion/i)).toBeInTheDocument();
  });

  it("refuses a tick on a family with several occasions until one is chosen", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/:occasionId`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the joneses/i }));

    expect(await screen.findByText(/choose an occasion to share with the joneses/i)).toBeInTheDocument();
    expect(shared).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /share with the joneses/i })).not.toBeChecked();
  });

  it("shares to the occasion chosen in the select", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/:occasionId`, ({ params }) => {
        shared(params.occasionId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    const select = await screen.findByRole("combobox", { name: /occasion for the joneses/i });
    await userEvent.selectOptions(select, "32");
    await userEvent.click(screen.getByRole("checkbox", { name: /share with the joneses/i }));

    await waitFor(() => expect(shared).toHaveBeenCalledWith("32"));
  });

  it("keeps the select on a shared family, disabled and naming the occasion", async () => {
    // The wireframe draws a ticked row still carrying its select (project spec
    // §5.2): the row keeps one shape as the box is ticked. Disabled, because
    // re-pointing a share is untick-then-tick — the only order in which the
    // claims question can be asked.
    serveSharingState({
      targets: [
        {
          id: 9,
          name: "The Joneses",
          member_ids: [1],
          occasions: [
            { id: 31, name: "Jones Christmas", is_archived: false, shared: true },
            { id: 32, name: "Jones Birthdays", is_archived: false, shared: false },
          ],
        },
      ],
    });

    renderModal();

    const select = await screen.findByRole("combobox", { name: /occasion for the joneses/i });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("31");
    expect(screen.getByRole("checkbox", { name: /share with the joneses/i })).toBeChecked();
    // Nothing to choose while shared, so no placeholder offering one.
    expect(screen.queryByRole("option", { name: /choose an occasion/i })).not.toBeInTheDocument();
  });

  it("says an occasion archived out from under the owner cannot be shared to", async () => {
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/20`, () =>
        HttpResponse.json(
          { detail: "This occasion is archived and can no longer be shared to." },
          { status: 409 },
        )
      ),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the smiths/i }));

    // A 409 here is the one thing the owner can act on, so it must not arrive as
    // the generic failure toast.
    expect(await screen.findByText(/has been archived/i)).toBeInTheDocument();
  });

  it("toggling a family off DELETEs its occasion's share with no claims param", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith(null));
    expect(
      screen.queryByRole("dialog", { name: "Some gifts are claimed" }),
    ).not.toBeInTheDocument();
  });

  it("can still unshare from an occasion archived after the share was made", async () => {
    // Archiving is not unsharing, so the row stays operable — and it is the only
    // way the owner has of switching that grant off.
    const revoked = vi.fn();
    serveSharingState({
      targets: [
        {
          id: 7,
          name: "The Boones",
          member_ids: [1],
          occasions: [{ id: 10, name: "Christmas 2025", is_archived: true, shared: true }],
        },
      ],
    });
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    const box = await screen.findByRole("checkbox", { name: /share with the boones/i });
    expect(box).toBeEnabled();
    expect(screen.getByText(/christmas 2025 — archived/i)).toBeInTheDocument();

    await userEvent.click(box);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("shows the release/keep dialog on a 409, with no counts or names", async () => {
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, () =>
        HttpResponse.json(
          { detail: "Some gifts on this list are claimed by members of this family." },
          { status: 409 },
        )
      ),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));

    const dialog = await screen.findByRole("dialog", { name: "Some gifts are claimed" });
    expect(screen.getByRole("button", { name: /release those claims/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep them claimed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    // The owner is blind to claim state: no count, no gift name, no claimer name.
    expect(dialog).not.toHaveTextContent(/\d/);
  });

  it.each(["release", "keep"] as const)("re-issues the request with claims=%s", async (choice) => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: choice === "release" ? /release those claims/i : /keep them claimed/i,
      }),
    );

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith(choice));
  });

  it("cancelling the dialog leaves the grant in place", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Some gifts are claimed" }),
      ).not.toBeInTheDocument(),
    );
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
  });

  it("says so when the owner belongs to no families", async () => {
    serveSharingState({ targets: [] });

    renderModal();

    expect(await screen.findByText(/don't belong to any families/i)).toBeInTheDocument();
  });
});

describe("SharingModal — the revoke confirmation stacks on top", () => {
  beforeEach(() => toast.remove());

  /** The 409 that means members of the family hold claims a revoke would
   *  orphan — the one path that puts two modals on screen at once. */
  function serveClaimedRevoke() {
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, () =>
        HttpResponse.json({ detail: "claimed" }, { status: 409 })
      ),
    );
  }

  async function openConfirm() {
    renderModal();
    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    return screen.findByRole("dialog", { name: "Some gifts are claimed" });
  }

  it("leaves the sharing modal standing behind it", async () => {
    serveClaimedRevoke();

    await openConfirm();

    expect(screen.getByRole("dialog", { name: "Who can see this list" })).toBeInTheDocument();
  });

  it("resolves only the confirm on Escape, and only once", async () => {
    // Both dialogs listen on the document, so without the topmost-only stack
    // one Escape would close the confirm *and* the modal underneath it.
    serveClaimedRevoke();

    const { onClose } = renderModal();
    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await screen.findByRole("dialog", { name: "Some gifts are claimed" });

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Some gifts are claimed" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Who can see this list" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cycles Tab inside the confirm rather than back into the modal beneath", async () => {
    // The outer trap's check is "is focus inside my panel?", and focus sitting
    // in the inner dialog fails it — so without the stack the sharing modal
    // would yank focus to its filter box on the first Tab.
    serveClaimedRevoke();

    await openConfirm();

    const release = screen.getByRole("button", { name: /release those claims/i });
    const keep = screen.getByRole("button", { name: /keep them claimed/i });
    const cancel = screen.getByRole("button", { name: /cancel/i });
    expect(release).toHaveFocus();

    await userEvent.tab();
    expect(keep).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(release).toHaveFocus();

    expect(
      screen.getByRole("searchbox", { name: /filter people and families/i }),
    ).not.toHaveFocus();
  });

  it("returns focus to the row that opened it", async () => {
    serveClaimedRevoke();

    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /share with the boones/i })).toHaveFocus(),
    );
  });
});

describe("SharingModal — controlled by whatever container mounts it", () => {
  /** A family of each shape, as a draft sees them: nothing shared, nothing
   *  archived, and no members to report. */
  const draftFamilies = [
    {
      id: 7,
      name: "The Boones",
      member_ids: [],
      occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: false }],
    },
    {
      id: 9,
      name: "The Joneses",
      member_ids: [],
      occasions: [
        { id: 31, name: "Jones Christmas", is_archived: false, shared: false },
        { id: 32, name: "Jones Birthdays", is_archived: false, shared: false },
      ],
    },
  ];
  const draftPeople: PersonRow[] = [
    { userId: 2, name: "Alice", email: "alice@test.com" },
    { userId: 3, name: "Bob", email: "bob@test.com" },
  ];
  const nothing: SharingSelection = { familyOccasions: {}, userIds: [] };

  function renderShell({
    selection = nothing,
    families = draftFamilies,
    people = draftPeople,
    linkAway = false,
  }: {
    selection?: SharingSelection;
    families?: typeof draftFamilies;
    people?: PersonRow[];
    linkAway?: boolean;
  } = {}) {
    const onFamilyToggled = vi.fn();
    const onPersonToggled = vi.fn();
    render(
      <MemoryRouter>
        <SharingModal
          families={{ data: families, isLoading: false, isError: false, pending: false }}
          people={{ data: people, isLoading: false, isError: false, pending: false }}
          selection={{ data: selection, isLoading: false, isError: false }}
          onFamilyToggled={onFamilyToggled}
          onPersonToggled={onPersonToggled}
          linkAway={linkAway}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    return { onFamilyToggled, onPersonToggled };
  }

  it("ticks the boxes the selection names, and no others", async () => {
    // The same rows the live container drives off server state, driven off a
    // draft's local state instead — one implementation, two sources.
    renderShell({ selection: { familyOccasions: { 9: 32 }, userIds: [3] } });

    expect(screen.getByRole("checkbox", { name: /share with the joneses/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with bob/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with the boones/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with alice/i })).not.toBeChecked();
    expect(screen.getByText("Shared with 1 family and 1 person")).toBeInTheDocument();
  });

  it("reports the intended state rather than a delta", async () => {
    const { onFamilyToggled, onPersonToggled } = renderShell({
      selection: { familyOccasions: { 9: 32 }, userIds: [] },
    });

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the boones/i }));
    expect(onFamilyToggled).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 7 }),
      10,
    );

    // Unticking says `null` — the container looks up which occasion that was.
    await userEvent.click(screen.getByRole("checkbox", { name: /share with the joneses/i }));
    expect(onFamilyToggled).toHaveBeenLastCalledWith(expect.objectContaining({ id: 9 }), null);

    await userEvent.click(screen.getByRole("checkbox", { name: /share with alice/i }));
    expect(onPersonToggled).toHaveBeenLastCalledWith(2, true);
  });

  it("refuses a tick on a family with several occasions until one is chosen", async () => {
    // The refusal is the shell's, so both modes inherit it.
    const { onFamilyToggled } = renderShell();

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the joneses/i }));
    expect(screen.getByText(/choose an occasion to share with the joneses/i)).toBeInTheDocument();
    expect(onFamilyToggled).not.toHaveBeenCalled();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /occasion for the joneses/i }),
      "31",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /share with the joneses/i }));
    expect(onFamilyToggled).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), 31);
  });

  it("disables no person row when nothing covers them", async () => {
    // A draft tick is not a share: it reports no covering family, so every row
    // stays live however many families are ticked (NEU-1307, decision 5).
    renderShell({ selection: { familyOccasions: { 7: 10 }, userIds: [] } });

    expect(screen.getByRole("checkbox", { name: /share with alice/i })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /share with bob/i })).toBeEnabled();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();
  });

  it("keeps the empty sentences and drops their links when there is nowhere safe to go", async () => {
    // Nothing on a create form may silently discard a half-typed list, and the
    // fact the section is empty is what the row is there to say.
    renderShell({ families: [], people: [], linkAway: false });

    expect(screen.getByText(/don't belong to any families yet/i)).toBeInTheDocument();
    expect(screen.getByText(/don't have any connections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers those links where following one costs nothing", async () => {
    renderShell({ families: [], people: [], linkAway: true });

    expect(screen.getByRole("link", { name: /go to people/i })).toHaveAttribute("href", "/people");
    expect(screen.getByRole("link", { name: /add a connection/i })).toHaveAttribute(
      "href",
      "/people",
    );
  });
});
