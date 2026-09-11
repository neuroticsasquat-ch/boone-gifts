import { render, screen, waitFor } from "@testing-library/react";
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

    await userEvent.click(screen.getByText("Remove"));
  });

  it("adds a list to folder", async () => {
    const emptyFolder = { ...sampleFolder, lists: [] };

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(emptyFolder)),
      http.get(`${API}/lists`, () =>
        HttpResponse.json([
          { id: 20, name: "Birthday List", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.post(`${API}/folders/1/items`, () =>
        new HttpResponse(null, { status: 201 })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "20");
    await userEvent.click(screen.getByText("Add"));
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
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("for Beth · kept by Tom")).toBeInTheDocument();
    });
    expect(screen.getByText("from Alice")).toBeInTheDocument();
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
