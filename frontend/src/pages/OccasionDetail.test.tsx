import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { Toaster } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../test/arrived-from";
import { NumericId } from "../components/NumericId";
import { OccasionDetail } from "./OccasionDetail";

const API = "https://boone-gifts-api.localhost";

function tokenFor(userId: number) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(
      JSON.stringify({
        sub: String(userId),
        email: `user${userId}@test.com`,
        role: "member",
        exp: 9999999999,
      })
    ),
    "fake-signature",
  ].join(".");
}

// User 1 is the family's organizer; user 2 is a plain member.
const family = {
  id: 7,
  name: "Boone Family",
  created_by_id: 1,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "member" },
  ],
};

/** `OccasionRead` — what `PUT /occasions/{id}` answers, and deliberately no
 *  more. Kept separate from the detail payload below so a mocked `PUT` cannot
 *  be wider than the real one: if these handlers returned `family_name`, a
 *  future `setQueryData(["occasion", id], response)` would blank the heading's
 *  qualifier in production and leave every test here green (NEU-1321
 *  decision 5). */
const occasionRead = {
  id: 3,
  family_id: 7,
  name: "Christmas 2026",
  is_archived: false,
  created_by_id: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

/** `OccasionDetailRead` — what `GET /occasions/{id}` answers. The family name
 *  rides on the occasion rather than being read off the page's family query,
 *  which does not fire until this one has resolved (NEU-1321). */
const occasion = { ...occasionRead, family_name: "Boone Family" };

function list(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    name: "Jane's Wishlist",
    description: null,
    owner_id: 2,
    owner_name: "Jane",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 2,
    claimed_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    // How the row reached the viewer, as every list surface reports it since
    // NEU-1290: the array of routes, never a scalar and never null. A list on
    // this page arrived through this occasion by definition, and this one also
    // came straight from Jane — so direct wins and the row names her, which is
    // what this page wants ("rather than repeating the family overhead").
    shared_via: [
      {
        kind: "occasion",
        occasion: { id: 3, name: "Christmas 2026" },
        family: { id: 1, name: "Boone Family" },
      },
      { kind: "direct", person: { id: 2, name: "Jane" } },
    ],
    ...overrides,
  };
}

/** No budget set, and counts that say nothing — these tests are about the tab,
 *  not the budget line, which has its own file. */
const noBudget = {
  amount: null,
  spent: "0.00",
  remaining: null,
  bought_count: 0,
  total_count: 0,
  unpriced_count: 0,
};

/** The address the tab is held in, plus a Back button — a tab is a place, and
 *  neither its link nor Back is visible through the page's own markup. */
function Address() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <p>{`address: ${location.pathname}${location.search}`}</p>
      <button onClick={() => navigate(-1)}>go back</button>
    </>
  );
}

function renderOccasion({
  userId = 1,
  occasionResponse = HttpResponse.json(occasion),
  lists = [list()],
  ownedLists = [list({ id: 20, name: "My wishlist", owner_id: 1, owner_name: "Alice", shared_via: [] })],
  shopping = [],
  entries = ["/occasions/3"],
  arriveFrom,
}: {
  userId?: number;
  occasionResponse?: Response;
  lists?: ReturnType<typeof list>[];
  /** `GET /lists?filter=owned` — the population the sharing dialog offers. */
  ownedLists?: ReturnType<typeof list>[];
  shopping?: Record<string, unknown>[];
  entries?: string[];
  /** Start the session here and push into the page, so the back control is at
   *  depth > 0. A deeper `entries` would not do: that is still an entry
   *  location, and still depth 0 (NEU-1302). */
  arriveFrom?: string;
} = {}) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(userId), token_type: "bearer" })
    ),
    http.get(`${API}/occasions/3`, () => occasionResponse.clone()),
    http.get(`${API}/occasions/3/lists`, () => HttpResponse.json(lists)),
    http.get(`${API}/occasions/3/shopping`, () =>
      HttpResponse.json({ budget: noBudget, items: shopping })
    ),
    http.get(`${API}/families/7`, () => HttpResponse.json(family)),
    http.get(`${API}/lists`, () => HttpResponse.json(ownedLists))
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={arriveFrom ? [arriveFrom] : entries}
          initialIndex={arriveFrom ? 0 : entries.length - 1}
        >
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/occasions/:id"
                element={
                  <NumericId back="/people">
                    <OccasionDetail />
                  </NumericId>
                }
              />
              <Route path="/people/families/:id" element={<div>Family Page</div>} />
              <Route path="/lists/:id" element={<ArrivedFrom to="/occasions/3" />} />
            </Routes>
          </NavigationDepthProvider>
          <Toaster />
          <Address />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("OccasionDetail", () => {
  it("heads the page with the occasion, its family, and a link back to it", async () => {
    renderOccasion();

    expect(await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" })).toBeInTheDocument();
    const back = await screen.findByRole("link", { name: "\u2190 Boone Family" });
    expect(back).toHaveAttribute("href", "/people/families/7");
  });

  // Arrived from a list rather than from the family page: Back is the list.
  it("returns to the page it was opened from, and says only Back", async () => {
    renderOccasion({ arriveFrom: "/lists/1" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    expect(await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Boone Family/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "\u2190 Back" }));

    expect(screen.getByRole("button", { name: "arrive" })).toBeInTheDocument();
  });

  // The occasion itself did not load, so there is no family id to name — the
  // one arm in the table that falls back to People instead (Decision 7).
  it("the unreachable arm names People, having no family to name", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json({ detail: "Not found" }, { status: 404 }),
    });

    expect(
      await screen.findByText(/doesn't exist, or it belongs to a family you're not in/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "\u2190 Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  it("lists every list shared to the occasion, naming who each came from", async () => {
    renderOccasion({
      lists: [
        list(),
        // The viewer's own list: they own it, so no route brought it to them.
        list({ id: 11, name: "My Wishlist", owner_id: 1, owner_name: "Alice", shared_via: [] }),
      ],
    });

    const jane = await screen.findByRole("link", { name: /Jane's Wishlist/ });
    expect(jane).toHaveAttribute("href", "/lists/10");
    expect(jane).toHaveTextContent("from Jane");
    // The viewer's own list is not attributed back to the viewer.
    expect(await screen.findByRole("link", { name: /My Wishlist/ })).not.toHaveTextContent("from");
  });

  // Until NEU-1308 this read "No lists are shared to this occasion yet." and
  // offered nothing — a dead end on the one page whose purpose is collecting
  // lists. The empty state is now the control; the sharing block below covers
  // what it does.
  it("offers a way out of an occasion with no lists", async () => {
    renderOccasion({ lists: [] });

    expect(await screen.findByRole("button", { name: "Share a list" })).toBeInTheDocument();
  });

  it("ships the tab bar with Lists and My shopping, Lists first", async () => {
    renderOccasion();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Lists", "My shopping"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  // The tab's own behaviour is `components/MyShopping.test.tsx`; what belongs
  // here is that the occasion page scopes it to *this occasion*.
  it("scopes My shopping to the claims filed under this occasion", async () => {
    renderOccasion({
      shopping: [
        {
          claim_id: 100,
          gift_id: 20,
          name: "Running shoes",
          description: null,
          url: null,
          price: "85.00",
          list_id: 10,
          list_name: "Jane's Wishlist",
          purchased_at: "2026-09-01T00:00:00Z",
          amount_paid: "85.00",
        },
      ],
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Running shoes")).toBeInTheDocument();
    expect(screen.getByText("you paid $85.00")).toBeInTheDocument();
  });

  // Archiving takes an occasion out of the default views and does nothing else
  // — the claims filed under it are still the claimer's to finish shopping for.
  it("serves My shopping on an archived occasion too", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json({ ...occasion, is_archived: true }),
      shopping: [
        {
          claim_id: 101,
          gift_id: 21,
          name: "Puzzle",
          description: null,
          url: null,
          price: "18.00",
          list_id: 11,
          list_name: "Gran's List",
          purchased_at: null,
          amount_paid: null,
        },
      ],
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Puzzle")).toBeInTheDocument();
  });

  it("renames the occasion from the organizer's menu", async () => {
    const renamed = vi.fn();
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        renamed(await request.json());
        return HttpResponse.json({ ...occasionRead, name: "Christmas 2027" });
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("Occasion name");
    await userEvent.clear(field);
    await userEvent.type(field, "Christmas 2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(renamed).toHaveBeenCalledWith({ name: "Christmas 2027" }));
  });

  it("archives the occasion once the organizer confirms", async () => {
    const archived = vi.fn();
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        archived(await request.json());
        return HttpResponse.json({ ...occasionRead, is_archived: true });
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    // The menu item and the dialog's action share a label, so the confirming
    // click is scoped to the dialog.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Archive this occasion?");
    expect(within(dialog).getByText("Lists already shared to it stay shared.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archived).toHaveBeenCalledWith({ is_archived: true }));
  });

  it("does not archive when the organizer cancels the confirm", async () => {
    const archived = vi.fn();
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        archived(await request.json());
        return HttpResponse.json(occasionRead);
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(archived).not.toHaveBeenCalled();
  });

  it("gives a plain member no rename or archive menu", async () => {
    renderOccasion({ userId: 2 });

    expect(await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Occasion actions" })).not.toBeInTheDocument();
  });

  // The backend gates the two fields separately (NEU-1294 decision 4), and the
  // archive nudge routinely sends a member who created an occasion here.
  it("offers a non-organizer creator Archive and not Rename", async () => {
    renderOccasion({
      userId: 2,
      occasionResponse: HttpResponse.json({ ...occasion, created_by_id: 2 }),
    });

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));

    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("names the archive rule, not the rename rule, on a 403 from archiving", async () => {
    renderOccasion();
    server.use(http.put(`${API}/occasions/3`, () => new HttpResponse(null, { status: 403 })));

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(
      await screen.findByText(
        "Only an organizer or the person who created this occasion can archive it.",
      ),
    ).toBeInTheDocument();
  });

  it("names the rename rule, not the archive rule, on a 403 from renaming", async () => {
    renderOccasion();
    server.use(http.put(`${API}/occasions/3`, () => new HttpResponse(null, { status: 403 })));

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Only an organizer can rename an occasion."),
    ).toBeInTheDocument();
  });

  it("renders an archived occasion normally, offering Unarchive", async () => {
    renderOccasion({ occasionResponse: HttpResponse.json({ ...occasion, is_archived: true }) });

    expect(await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" })).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    // Its lists are still listed: archiving is not unsharing.
    expect(await screen.findByRole("link", { name: /Jane's Wishlist/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Occasion actions" }));
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeInTheDocument();
  });

  // The ticket itself: at depth > 0 the back control reads only "\u2190 Back", so
  // before this the family was named nowhere on the page.
  it("names the family in the heading at depth > 0, where nothing else does", async () => {
    renderOccasion({ arriveFrom: "/lists/1" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    const heading = await screen.findByRole(
      "heading",
      { name: "Boone Family \u00b7 Christmas 2026" },
    );
    // Unlinked, per CONTEXT.md rule 3: the family's destination on this page is
    // the back control, and a second link to it two lines apart is the
    // redundancy the rule avoids.
    expect(within(heading).queryByRole("link")).not.toBeInTheDocument();
  });

  it("titles the document with the family too", async () => {
    renderOccasion();

    await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" });
    expect(document.title).toContain("Boone Family \u00b7 Christmas 2026");
  });

  // The assertion that fails under a heading derived from the page's family
  // query: that query does not fire until the occasion has resolved, so a
  // heading built from it paints unqualified first and shifts a round trip
  // later. Here the family never arrives at all and the heading is still right.
  it("names the family before the family query resolves", async () => {
    renderOccasion();
    server.use(http.get(`${API}/families/7`, () => new Promise(() => {})));

    expect(
      await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2026" }),
    ).toBeInTheDocument();
    // Same field, same reason: the back control never shows the `Family`
    // placeholder on this page (Decision 7).
    expect(screen.getByRole("link", { name: "\u2190 Boone Family" })).toHaveAttribute(
      "href",
      "/people/families/7",
    );
    expect(screen.queryByRole("link", { name: "\u2190 Family" })).not.toBeInTheDocument();
  });

  // This ticket's own bug, re-created in a transient state: with the qualifier
  // in the <h1>, opening the form would take the family off the page again, and
  // at depth > 0 the back control above reads only "\u2190 Back".
  it("keeps the family on screen while the occasion is being renamed", async () => {
    renderOccasion();

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(screen.getByText("Boone Family \u00b7")).toBeInTheDocument();
    // The edit covers the occasion half and not the family half.
    expect(screen.getByLabelText("Occasion name")).toHaveValue("Christmas 2026");
  });

  it("keeps the qualifier through a rename, changing only the occasion half", async () => {
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, () =>
        HttpResponse.json({ ...occasionRead, name: "Christmas 2027" })
      ),
      http.get(`${API}/occasions/3`, () =>
        HttpResponse.json({ ...occasion, name: "Christmas 2027" })
      )
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("Occasion name");
    await userEvent.clear(field);
    await userEvent.type(field, "Christmas 2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("heading", { name: "Boone Family \u00b7 Christmas 2027" }),
    ).toBeInTheDocument();
  });

  it("does not offer a retry on an occasion the viewer can never reach", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
    });

    expect(
      await screen.findByText("This occasion doesn't exist, or it belongs to a family you're not in.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("OccasionDetail — the tab is a place", () => {
  // Criterion 4: "My shopping for Christmas 2026" has an address, and it works.
  it("renders My shopping on load at ?tab=shopping", async () => {
    renderOccasion({ entries: ["/occasions/3?tab=shopping"] });

    expect(await screen.findByRole("tab", { name: "My shopping", selected: true })).toBeInTheDocument();
  });

  // Criterion 3: a tab change grows history by one, and Back returns to it.
  it("pushes on a tab change — Back returns to the Lists tab", async () => {
    renderOccasion();

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));
    expect(await screen.findByText("address: /occasions/3?tab=shopping")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByRole("tab", { name: "Lists", selected: true })).toBeInTheDocument();
  });

  // Criterion 5: the bar fires onSelect on every click, the active tab included.
  // An entry per click would cost three Back presses to leave the page.
  it("navigates nowhere when the already-active tab is clicked", async () => {
    renderOccasion({ entries: ["/people", "/occasions/3?tab=shopping"] });

    const active = await screen.findByRole("tab", { name: "My shopping" });
    await userEvent.click(active);
    await userEvent.click(active);

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /people")).toBeInTheDocument();
  });

  // Criterion 6: a bogus tab heals by *replacing*, in push mode too. A pushed
  // heal would leave ?tab=bogus behind the viewer, where Back would reach it,
  // heal it, and push again — a page Back cannot leave.
  it("scrubs an unrecognised ?tab= without stranding the viewer", async () => {
    renderOccasion({ entries: ["/people", "/occasions/3?tab=bogus"] });

    expect(await screen.findByRole("tab", { name: "Lists", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /people")).toBeInTheDocument();
  });
});

/**
 * Sharing **into** the occasion — the reverse of every other flow in the app
 * (NEU-1308).
 *
 * The control is the same component in both states of the Lists tab, and the
 * page — not the tab — mounts the dialog, because a successful share is exactly
 * what replaces the empty state the control was standing in.
 */
describe("OccasionDetail — sharing a list into the occasion", () => {
  const archived = { ...occasion, is_archived: true };

  it("replaces the empty state with the control", async () => {
    renderOccasion({ lists: [] });

    expect(await screen.findByRole("button", { name: "Share a list" })).toBeInTheDocument();
    // The dead end it replaces, not something it sits under.
    expect(
      screen.queryByText("No lists are shared to this occasion yet."),
    ).not.toBeInTheDocument();
  });

  // Story NEU-1304's second criterion, which the ticket description omits — and
  // the third of the three entry points, so it opens the same dialog rather than
  // merely rendering the same button.
  it("offers the control above the rows when the occasion already has lists", async () => {
    renderOccasion({ lists: [list()] });

    const control = await screen.findByRole("button", { name: "Share a list" });
    expect(screen.getByText("Jane's Wishlist")).toBeInTheDocument();

    await userEvent.click(control);

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
  });

  // Not an organizer power: sharing your own list into an occasion never was.
  it("offers it to a plain member too", async () => {
    renderOccasion({ userId: 2, lists: [] });

    expect(await screen.findByRole("button", { name: "Share a list" })).toBeEnabled();
  });

  it("opens the dialog on ?share=open, naming the occasion", async () => {
    renderOccasion({ lists: [] });

    await userEvent.click(await screen.findByRole("button", { name: "Share a list" }));

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("address: /occasions/3?share=open")).toBeInTheDocument();
  });

  it("mounts the dialog on a deep link straight into it", async () => {
    renderOccasion({ lists: [], entries: ["/occasions/3?share=open"] });

    expect(
      await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" }),
    ).toBeInTheDocument();
  });

  // Rule 8: the app pushed the open entry, so Back closes the dialog — and a
  // second Back leaves the page rather than reopening it.
  it("closes on Back, and does not reopen on the next Back press", async () => {
    renderOccasion({ lists: [], arriveFrom: "/lists/3" });

    await userEvent.click(await screen.findByRole("button", { name: "arrive" }));
    await userEvent.click(await screen.findByRole("button", { name: "Share a list" }));
    await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" });

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /lists/3")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Done pops rather than writing the default: writing through the push-mode
  // setter would add a second entry, leaving Back to reopen what was just shut.
  it("closes on Done and leaves one entry behind, not two", async () => {
    renderOccasion({ lists: [], arriveFrom: "/lists/3" });

    await userEvent.click(await screen.findByRole("button", { name: "arrive" }));
    await userEvent.click(await screen.findByRole("button", { name: "Share a list" }));
    await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /lists/3")).toBeInTheDocument();
  });

  // A deep link has nothing of ours behind it, so closing replace-strips the
  // key instead of popping off the site.
  it("strips ?share on close at depth 0", async () => {
    renderOccasion({ lists: [], entries: ["/occasions/3?share=open"] });

    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();
  });

  // Rule 6's shape — listed, disabled, reason given — and unlike a placeholder,
  // a reason the viewer can act on.
  it("renders the control disabled with its reason on an archived occasion", async () => {
    renderOccasion({ occasionResponse: HttpResponse.json(archived), lists: [] });

    const control = await screen.findByRole("button", { name: "Share a list" });
    expect(control).toBeDisabled();
    expect(
      screen.getByText("This occasion is archived, so lists can't be shared to it."),
    ).toBeInTheDocument();

    await userEvent.click(control);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Decision 7 rejected "a live control and the 409 as the only feedback" — so a
  // pasted, bookmarked or Back-reached `?share=open` on an archived occasion must
  // not mount a live dialog either. The param is stripped so the address and the
  // page agree (rule 8).
  it("mounts nothing and strips ?share=open on an archived occasion", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json(archived),
      lists: [],
      entries: ["/occasions/3?share=open"],
    });

    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The control is still there, still dead, still saying why.
    expect(screen.getByRole("button", { name: "Share a list" })).toBeDisabled();
  });

  it("heals ?share=banana away and mounts nothing", async () => {
    renderOccasion({ lists: [], entries: ["/occasions/3?share=banana"] });

    expect(await screen.findByText("address: /occasions/3")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
