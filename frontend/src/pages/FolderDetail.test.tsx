import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../test/arrived-from";
import { NumericId } from "../components/NumericId";
import { FolderDetail } from "./FolderDetail";

const API = "https://boone-gifts-api.localhost";

const sampleFolder = {
  id: 1,
  name: "Christmas 2026",
  description: "Holiday gifts",
  owner_id: 1,
  lists: [
    // An owned row: empty routes, which is what the API now sends in place of
    // the old null (NEU-1290).
    { id: 10, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Me", shared_via: [], created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

/** A list, in the shape `GET /lists` sends: routes always an array, never null. */
function list(fields: Record<string, unknown>) {
  return {
    description: null,
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 0,
    claimed_count: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    shared_via: [],
    ...fields,
  };
}

/** The viewer's own, for nobody in particular: no second line at all. */
const OWN_BIRTHDAY = list({ id: 20, name: "Birthday List", owner_id: 1, owner_name: "Tom Boone" });

/** The viewer's own, kept for someone with no account: "for Beth" and nothing
 *  about where it came from — it came from them. */
const OWN_FOR_BETH = list({
  id: 21, name: "Beth's Birthday", owner_id: 1, owner_name: "Tom Boone", recipient_name: "Beth",
});

/** Reached the viewer through a family's occasion and no other way — the case
 *  the ticket was written about, and the one that would have failed before
 *  NEU-1290 widened the unfiltered scope to include the occasion term. */
const VIA_OCCASION = list({
  id: 30, name: "Gran's List", owner_id: 2, owner_name: "Gran Boone",
  shared_via: [
    { kind: "occasion", occasion: { id: 3, name: "Christmas 2026" }, family: { id: 1, name: "Boone Family" } },
  ],
});

/** Shared straight at the viewer by its owner. */
const VIA_DIRECT = list({
  id: 31, name: "Carol's Wishlist", owner_id: 4, owner_name: "Carol Boone",
  shared_via: [{ kind: "direct", person: { id: 4, name: "Carol Boone" } }],
});

/** `GET /lists` answering the picker's two queries apart. A handler that ignored
 *  `filter` would let a page that asked only one question still look right. */
function serveLists({ owned = [], shared = [] }: { owned?: unknown[]; shared?: unknown[] } = {}) {
  return http.get(`${API}/lists`, ({ request }) => {
    const filter = new URL(request.url).searchParams.get("filter");
    return HttpResponse.json(filter === "shared" ? shared : owned);
  });
}

/** The picker's own subtree. Both sections draw rows of the same shape over
 *  overlapping names, so every picker assertion is scoped to this rather than to
 *  the page. */
async function picker() {
  return within(await screen.findByRole("region", { name: "Add a List" }));
}

/** The address the tab is held in, plus a Back button. */
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

/** Supplied directly rather than through `AuthProvider`, so the session costs no
 *  `/auth/refresh`. The depth counter reads it to reset on a change of viewer. */
const AUTHENTICATED: AuthContextType = {
  user: { id: 1, email: "user@test.com", name: "Tom Boone", role: "member" },
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  changePassword: async () => {},
  updateProfile: async () => {},
};

/** `arriveFrom` starts the session on another page and pushes into the folder
 *  from it, so the back control is at depth > 0. A deeper `entries` would not
 *  do: that is still an entry location, and still depth 0 (NEU-1302). */
function renderFolderDetail(
  id = "1",
  { entries = [`/folders/${id}`], arriveFrom }: { entries?: string[]; arriveFrom?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={AUTHENTICATED}>
        <MemoryRouter
          initialEntries={arriveFrom ? [arriveFrom] : entries}
          initialIndex={arriveFrom ? 0 : entries.length - 1}
        >
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/folders/:id"
                element={
                  <NumericId back="/lists">
                    <FolderDetail />
                  </NumericId>
                }
              />
              <Route path="/lists" element={<div>Lists</div>} />
              <Route path="/lists/:id" element={<ArrivedFrom to={`/folders/${id}`} />} />
            </Routes>
          </NavigationDepthProvider>
          <Address />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("FolderDetail", () => {
  it("renders folder header and lists", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
  });

  it("edits folder name and description", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/folders/1`, () =>
        HttpResponse.json({ ...sampleFolder, name: "Updated", description: "New desc" })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Edit"));

    const nameInput = screen.getByDisplayValue("Christmas 2026");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated");
    await userEvent.click(screen.getByText("Save"));
  });

  // Archiving is reversible from the "View archived folders" toggle on /folders
  // and nobody else can tell, so it asks nothing (`CONTEXT.md` rule 11,
  // NEU-1319).
  it("archives the folder in one click, with no dialog at any point", async () => {
    let archived: unknown = null;
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/folders/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json({ ...sampleFolder, is_archived: true });
      }),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archived).toBe(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Unchanged behaviour, but it is the same code path as Archive now rather
  // than the other arm of a branch.
  it("unarchives the folder in one click, with no dialog at any point", async () => {
    let archived: unknown = null;
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json({ ...sampleFolder, is_archived: true })),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/folders/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json(sampleFolder);
      }),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Unarchive" }));

    await waitFor(() => expect(archived).toBe(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deleting the folder still confirms", async () => {
    let deleted = false;
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.delete(`${API}/folders/1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Delete this folder?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("removes a list from folder", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.delete(`${API}/folders/1/items/10`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });

    // Queried by its accessible name, which names the list it takes out of the
    // folder (`CONTEXT.md` rule 12).
    await userEvent.click(screen.getByRole("button", { name: "Remove My Wishlist" }));
  });

  it("adds a list to folder", async () => {
    const emptyFolder = { ...sampleFolder, lists: [] };
    let added: unknown = null;

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(emptyFolder)),
      serveLists({ owned: [OWN_BIRTHDAY] }),
      http.post(`${API}/folders/1/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderFolderDetail();

    await userEvent.click(await screen.findByRole("button", { name: "Add Birthday List" }));

    await waitFor(() => expect(added).toEqual({ list_id: 20 }));
  });

  it("shows empty state for lists", async () => {
    const emptyFolder = { ...sampleFolder, lists: [] };

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(emptyFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("No lists in this folder.")).toBeInTheDocument();
    });
  });

  it("carries the same two tabs the occasion page does, Lists first", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Lists", "My shopping"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  // The tab's own behaviour is `components/MyShopping.test.tsx`; what belongs
  // here is that the folder page scopes it to *this folder*, which is the whole
  // difference between the two pages that mount it.
  it("scopes My shopping to this folder's own claims", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping`, () =>
        HttpResponse.json({
          budget: {
            amount: null,
            spent: "0.00",
            remaining: null,
            bought_count: 0,
            total_count: 1,
            unpriced_count: 0,
          },
          items: [
            {
              claim_id: 100,
              gift_id: 1,
              name: "Lego Set",
              description: null,
              url: null,
              price: "49.99",
              list_id: 10,
              list_name: "My Wishlist",
              purchased_at: null,
              amount_paid: null,
            },
          ],
        })
      ),
    );

    renderFolderDetail();

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Lego Set")).toBeInTheDocument();
    expect(screen.getByText("listed at $49.99")).toBeInTheDocument();
    // The budget line is on this page too, not the occasion page alone
    // (project spec §9.3); its own behaviour is `BudgetLine.test.tsx`.
    expect(screen.getByText("$0.00 spent · no budget set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
  });

  // Folders have no index page, so back cannot mean one.
  it("heads back to the lists rather than a folder index", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    expect(await screen.findByRole("link", { name: "\u2190 Back to Lists" })).toHaveAttribute(
      "href",
      "/lists",
    );
  });

  // Arrived from a list rather than from the dashboard: Back is the list.
  it("returns to the page it was opened from, and says only Back", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail("1", { arriveFrom: "/lists/9" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    await userEvent.click(await screen.findByRole("button", { name: "\u2190 Back" }));

    expect(screen.getByRole("button", { name: "arrive" })).toBeInTheDocument();
  });

  it("attributes folder lists the same way every other list view does", async () => {
    // This changes the wording from "by X" to "from X"/"for X", accepted for
    // consistency with the rest of the app.
    server.use(
      http.get(`${API}/folders/1`, () =>
        HttpResponse.json({
          ...sampleFolder,
          lists: [
            { id: 30, name: "Beth's List", description: null, owner_id: 3, owner_name: "Tom",
              recipient_name: "Beth",
              created_at: "2026-01-01", updated_at: "2026-01-01" },
            { id: 31, name: "Plain List", description: null, owner_id: 4, owner_name: "Alice",
              recipient_name: null,
              created_at: "2026-01-01", updated_at: "2026-01-01" },
          ],
        })
      ),
      serveLists(),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("for Beth · kept by Tom")).toBeInTheDocument();
    });
    expect(screen.getByText("from Alice")).toBeInTheDocument();
  });
});

/**
 * The picker had no coverage at all, over a population that already included
 * shared lists: `FolderDetail` has called `getLists()` unfiltered since
 * NEU-1259, and M1's NEU-1290 widened that scope to the occasion term. Two of
 * this story's three acceptance criteria passed on nothing but a backend test
 * two milestones away that names neither folders nor pickers. These name it.
 */
describe("FolderDetail — the Add a List picker", () => {
  const emptyFolder = { ...sampleFolder, lists: [] };

  function serveFolder(folder: object, lists: ReturnType<typeof serveLists>) {
    server.use(http.get(`${API}/folders/1`, () => HttpResponse.json(folder)), lists);
  }

  it("offers a list shared with the viewer through an occasion only", async () => {
    serveFolder(emptyFolder, serveLists({ shared: [VIA_OCCASION] }));

    renderFolderDetail();

    expect(await (await picker()).findByText("Gran's List")).toBeInTheDocument();
  });

  it("offers a list shared with the viewer directly", async () => {
    serveFolder(emptyFolder, serveLists({ shared: [VIA_DIRECT] }));

    renderFolderDetail();

    expect(await (await picker()).findByText("Carol's Wishlist")).toBeInTheDocument();
  });

  // `sampleFolder` already holds list 10, which is also in the owned scope.
  it("does not offer a list the folder already holds", async () => {
    serveFolder(sampleFolder, serveLists({
      owned: [list({ id: 10, name: "My Wishlist", owner_id: 1, owner_name: "Tom Boone" }), OWN_BIRTHDAY],
    }));

    renderFolderDetail();

    const offered = await picker();
    expect(await offered.findByText("Birthday List")).toBeInTheDocument();
    expect(offered.queryByText("My Wishlist")).not.toBeInTheDocument();
    // Still on the page, though — it is in the folder, which is the whole reason
    // it is not on offer.
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
  });

  it("adds the shared list whose own Add was pressed", async () => {
    let added: unknown = null;
    serveFolder(emptyFolder, serveLists({ owned: [OWN_BIRTHDAY], shared: [VIA_OCCASION] }));
    server.use(
      http.post(`${API}/folders/1/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderFolderDetail();

    await userEvent.click(await (await picker()).findByRole("button", { name: "Add Gran's List" }));

    await waitFor(() => expect(added).toEqual({ list_id: 30 }));
  });

  /**
   * `attributionFor` falls through to the owner's name on a list carrying no
   * route, so `ListAttributionLine` on a row the viewer owns would read "from
   * Tom Boone" to Tom. Ownership here is which of the two queries the row
   * arrived in, and the pairing is `/lists`' own.
   */
  it("attributes a row someone else owns, and says only 'for' on the viewer's own", async () => {
    serveFolder(emptyFolder, serveLists({
      owned: [OWN_BIRTHDAY, OWN_FOR_BETH],
      shared: [VIA_OCCASION],
    }));

    renderFolderDetail();

    const rows = await picker();
    // Someone else's: the family behind the occasion it came through.
    expect(await rows.findByText("Boone Family")).toBeInTheDocument();
    // The viewer's own, kept for someone: "for Beth", never "from Tom Boone".
    expect(rows.getByText("for Beth")).toBeInTheDocument();
    expect(rows.queryByText("from Tom Boone")).not.toBeInTheDocument();
    // And the viewer's own for nobody carries no second line at all.
    const own = rows.getByText("Birthday List").parentElement as HTMLElement;
    expect(own.querySelectorAll("p")).toHaveLength(1);
  });

  /**
   * The sharp version of the old `allLists.data ?? []`: a failed *shared* query
   * beside a healthy owned one would offer owned lists only — this ticket's
   * exact defect, produced by a network error instead of a query param.
   */
  it("renders a failure and no rows when only the shared half fails", async () => {
    serveFolder(emptyFolder, http.get(`${API}/lists`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get("filter");
      if (filter === "shared") return new HttpResponse(null, { status: 500 });
      return HttpResponse.json([OWN_BIRTHDAY]);
    }));

    renderFolderDetail();

    const failed = await picker();
    expect(await failed.findByText("Failed to load your lists.")).toBeInTheDocument();
    expect(failed.queryByText("Birthday List")).not.toBeInTheDocument();
    expect(failed.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
  });

  // Two different absences. `if (length === 0) return null` said both by
  // deleting the heading and the control together.
  it("offers a way to make a list when the viewer can see none", async () => {
    serveFolder(emptyFolder, serveLists());

    renderFolderDetail();

    const empty = await picker();
    expect(await empty.findByText(/You can't see any lists yet\./)).toBeInTheDocument();
    expect(empty.getByRole("link", { name: "Create a list" })).toHaveAttribute("href", "/lists/new");
  });

  it("says so when every list the viewer can see is already here", async () => {
    serveFolder(sampleFolder, serveLists({
      owned: [list({ id: 10, name: "My Wishlist", owner_id: 1, owner_name: "Tom Boone" })],
    }));

    renderFolderDetail();

    const complete = await picker();
    expect(
      await complete.findByText("Every list you can see is already in this folder."),
    ).toBeInTheDocument();
    expect(complete.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
  });
});

/**
 * The folder's own rows take the same pairing, for the same reason: left alone,
 * this page would ship rows and a picker that disagree about one list — the
 * defect class NEU-1286 was opened on, one section apart on one page.
 */
describe("FolderDetail — the folder's own rows", () => {
  it("does not attribute a list the viewer owns to the viewer", async () => {
    server.use(
      http.get(`${API}/folders/1`, () =>
        HttpResponse.json({
          ...sampleFolder,
          lists: [list({ id: 10, name: "My Wishlist", owner_id: 1, owner_name: "Tom Boone" })],
        }),
      ),
      serveLists(),
    );

    renderFolderDetail();

    expect(await screen.findByText("My Wishlist")).toBeInTheDocument();
    expect(screen.queryByText("from Tom Boone")).not.toBeInTheDocument();
  });
});

describe("FolderDetail — the tab is a place", () => {
  function serveFolder() {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping`, () =>
        HttpResponse.json({
          budget: { amount: null, spent: "0.00", remaining: null, bought_count: 0, total_count: 0, unpriced_count: 0 },
          items: [],
        })
      ),
    );
  }

  it("renders My shopping on load at ?tab=shopping", async () => {
    serveFolder();

    renderFolderDetail("1", { entries: ["/folders/1?tab=shopping"] });

    expect(await screen.findByRole("tab", { name: "My shopping", selected: true })).toBeInTheDocument();
  });

  // Criterion 5, the push half. A tab is a *place*, so it pushes (CONTEXT.md
  // rule 8) — which means one press of the control closes the tab rather than
  // leaving the page, and the control has to stop naming /lists while that is
  // true. The surprising direction of the two, so it is asserted rather than
  // inferred from the counter's own suite.
  it("becomes a plain Back once a tab has been pushed, and closes the tab", async () => {
    serveFolder();

    renderFolderDetail();
    expect(await screen.findByRole("link", { name: "\u2190 Back to Lists" })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));
    expect(await screen.findByText("address: /folders/1?tab=shopping")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Back to Lists/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "\u2190 Back" }));

    expect(await screen.findByRole("tab", { name: "Lists", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "\u2190 Back to Lists" })).toBeInTheDocument();
  });

  it("pushes on a tab change — Back returns to the Lists tab", async () => {
    serveFolder();

    renderFolderDetail();

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));
    expect(await screen.findByText("address: /folders/1?tab=shopping")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByRole("tab", { name: "Lists", selected: true })).toBeInTheDocument();
  });

  it("navigates nowhere when the already-active tab is clicked", async () => {
    serveFolder();

    renderFolderDetail("1", { entries: ["/lists", "/folders/1?tab=shopping"] });

    const active = await screen.findByRole("tab", { name: "My shopping" });
    await userEvent.click(active);
    await userEvent.click(active);

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /lists")).toBeInTheDocument();
  });

  it("scrubs an unrecognised ?tab= without stranding the viewer", async () => {
    serveFolder();

    renderFolderDetail("1", { entries: ["/lists", "/folders/1?tab=bogus"] });

    expect(await screen.findByRole("tab", { name: "Lists", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("address: /folders/1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /lists")).toBeInTheDocument();
  });
});
