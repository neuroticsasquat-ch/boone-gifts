import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NumericId } from "../components/NumericId";
import { ListDetail } from "./ListDetail";

const API = "https://boone-gifts-api.localhost";

// JWT with payload: {"sub":"1","email":"owner@test.com","role":"member","exp":9999999999}
const ownerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

// JWT with payload: {"sub":"2","email":"viewer@test.com","role":"member","exp":9999999999}
const viewerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "viewer@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const ownerListDetail = {
  id: 1,
  name: "My Wishlist",
  description: "Things I want",
  owner_id: 1,
  owner_name: "Owner",
  is_archived: false,
  gifts: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

// A viewer's payload always carries both claim sets; the default is a list
// shared directly, which is the 0-candidate case — nothing to ask about.
const viewerListDetail = {
  id: 1,
  name: "My Wishlist",
  description: "Things I want",
  owner_id: 1,
  owner_name: "Owner",
  is_archived: false,
  gifts: [],
  claim_candidates: [],
  claim_options: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderListDetail(token: string) {
  // Mock the silent refresh to return the token, which sets up the auth user
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/lists/1"]}>
          <Routes>
            <Route
              path="/lists/:id"
              element={
                <NumericId back="/lists">
                  <ListDetail />
                </NumericId>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("ListDetail sharing panel", () => {
  // The tab bar is gone: sharing is reached from the header's Change control,
  // and that is the only way in.
  async function openSharingPanel() {
    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(await screen.findByRole("button", { name: "Change" }));
    return screen.getByRole("region", { name: "Who can see this list" });
  }

  it("puts people and families in one panel for the owner", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
          {
            id: 7,
            name: "The Boones",
            member_ids: [1],
            occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
          },
        ])
      ),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);
    const panel = await openSharingPanel();

    expect(
      await within(panel).findByRole("checkbox", { name: /share with alice/i })
    ).not.toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
  });

  it("gives a viewer no way into sharing", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Who can see this list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("AddGiftForm URL Auto-Populate", () => {
  async function openAddGiftForm() {
    await waitFor(() => {
      expect(screen.getByText("Add a gift")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Add a gift"));
  }

  it("populates fields from URL metadata", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () =>
        HttpResponse.json({
          title: "Cool Gadget",
          description: "A very cool gadget",
          price: "29.99",
          image: null,
        })
      ),
    );

    renderListDetail(ownerToken);
    await openAddGiftForm();

    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/product");

    // Wait for debounce (500ms) + fetch to populate fields
    await waitFor(() => {
      expect(screen.getByLabelText("Name *")).toHaveValue("Cool Gadget");
    }, { timeout: 3000 });
    expect(screen.getByLabelText("Description")).toHaveValue("A very cool gadget");
    expect(screen.getByLabelText("Price")).toHaveValue("29.99");
  });

  it("does not overwrite user-entered values", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () =>
        HttpResponse.json({
          title: "From Meta",
          description: "Meta description",
          price: "9.99",
          image: null,
        })
      ),
    );

    renderListDetail(ownerToken);
    await openAddGiftForm();

    // User types a name first
    await userEvent.type(screen.getByLabelText("Name *"), "My Custom Name");

    // Then enters a URL
    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/product");

    // Wait for debounce + fetch
    await waitFor(() => {
      expect(screen.getByLabelText("Description")).toHaveValue("Meta description");
    }, { timeout: 3000 });

    // Name should NOT be overwritten
    expect(screen.getByLabelText("Name *")).toHaveValue("My Custom Name");
  });

  it("handles fetch failure gracefully", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () => HttpResponse.error()),
    );

    renderListDetail(ownerToken);
    await openAddGiftForm();

    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/broken");

    // Wait for the fetch to complete (indicator disappears)
    await waitFor(() => {
      expect(screen.queryByText("Fetching details…")).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Fields should remain empty — no error shown
    expect(screen.getByLabelText("Name *")).toHaveValue("");
  });
});

describe("Gift list item responsive layout", () => {
  const ownerListWithGift = {
    ...ownerListDetail,
    gifts: [
      { id: 10, name: "Test Gift", description: "A long description that should wrap", url: "https://example.com", price: "29.99" },
    ],
  };

  const viewerListWithGift = {
    ...viewerListDetail,
    gifts: [
      { id: 10, name: "Viewer Gift", description: "Viewer description", url: null, price: "15.00", claimed_by_id: null },
    ],
  };

  it("renders gift name without truncate class", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    const link = await screen.findByText("Test Gift");
    expect(link.className).not.toContain("truncate");
    expect(link.className).toContain("break-words");
  });

  it("renders gift name without URL using break-words", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    const name = await screen.findByText("Viewer Gift");
    expect(name.tagName).toBe("P");
    expect(name.className).toContain("break-words");
  });

  it("renders gift description without truncate class", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    const desc = await screen.findByText("A long description that should wrap");
    expect(desc.className).not.toContain("truncate");
    expect(desc.className).toContain("break-words");
  });

  it("renders duplicate price in owner gift row for mobile", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    // Price appears twice (once in GiftInfo for desktop, once in row for mobile)
    const prices = await screen.findAllByText("$29.99");
    expect(prices.length).toBe(2);
  });

  it("renders price in viewer gift row", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    const prices = await screen.findAllByText("$15.00");
    expect(prices.length).toBeGreaterThanOrEqual(1);
  });

  it("pads a price that arrives with fewer than two decimals", async () => {
    // The fixtures above all carry two decimals already, so they pass with or
    // without the shared formatter. This one does not: `19.5` reaching a row
    // that hardcodes a `$` reads `$19.5`, which is the whole reason
    // `formatMoney` exists (NEU-1272, project spec §14 open question 1).
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({
          ...viewerListDetail,
          gifts: [{ id: 10, name: "Short Price Gift", description: null, url: null, price: "19.5", claimed_by_id: null }],
        }),
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    // The positive assertion is the whole guard: without the formatter the row
    // renders "$19.5", which does not match this exact-text query.
    expect(await screen.findAllByText("$19.50")).not.toHaveLength(0);
  });
});

describe("ListDetail — no tab bar", () => {
  it("renders the gifts as the page body, with no tabs", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    expect(screen.getByText("Add a gift")).toBeInTheDocument();
    for (const tab of [/^gifts$/i, /^folders$/i, /^shared with$/i, /^families$/i]) {
      expect(screen.queryByRole("button", { name: tab })).not.toBeInTheDocument();
    }
  });

  it("summarises people and families on one line", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }])
      ),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
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
        ])
      ),
    );

    renderListDetail(ownerToken);

    expect(
      await screen.findByText("Shared with The Boones · Christmas 2026, Alice"),
    ).toBeInTheDocument();
  });

  it("says so when a list is shared with nobody", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
          {
            id: 7,
            name: "The Boones",
            member_ids: [1],
            occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: false }],
          },
        ])
      ),
    );

    renderListDetail(ownerToken);

    // The whole mitigation for a list now being able to reach nobody, so the
    // wording is fixed and it says nothing about claims.
    expect(
      await screen.findByText("This list isn't shared with anyone."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("does not claim a list is unshared when the sharing state failed to load", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API}/lists/1/families`, () => new HttpResponse(null, { status: 500 })),
    );

    renderListDetail(ownerToken);

    // An empty answer and no answer at all are different things, and only one of
    // them is the state this notice exists to report.
    expect(await screen.findByText(/couldn't load who this list/i)).toBeInTheDocument();
    expect(
      screen.queryByText("This list isn't shared with anyone."),
    ).not.toBeInTheDocument();
  });

  it("keeps the unshared notice off a viewer's copy of the list", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    await screen.findByText("My Wishlist");
    expect(
      screen.queryByText("This list isn't shared with anyone."),
    ).not.toBeInTheDocument();
  });

  it("opens the family controls from Change", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
          {
            id: 7,
            name: "The Boones",
            member_ids: [1],
            occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
          },
        ])
      ),
    );

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(await screen.findByRole("button", { name: "Change" }));

    expect(
      await screen.findByRole("checkbox", { name: /share with the boones/i })
    ).toBeChecked();
  });
});

describe("ListDetail — header actions menu", () => {
  afterEach(() => vi.restoreAllMocks());

  function serveOwnerList() {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
  }

  it("keeps edit, archive and delete behind the menu", async () => {
    serveOwnerList();
    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "List actions" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("archives from the menu once confirmed", async () => {
    serveOwnerList();
    let archived: unknown = null;
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json({ ...ownerListDetail, is_archived: true });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archived).toBe(true));
  });

  it("deletes from the menu once confirmed", async () => {
    serveOwnerList();
    let deleted = false;
    server.use(
      http.delete(`${API}/lists/1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("gives a viewer the menu, holding the folder action alone", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));

    expect(screen.getByRole("button", { name: "Add to a folder…" })).toBeInTheDocument();
    for (const owned of ["Edit", "Archive", "Delete"]) {
      expect(screen.queryByRole("button", { name: owned })).not.toBeInTheDocument();
    }
  });
});

describe("ListDetail — add to a folder", () => {
  const folders = [
    {
      id: 3,
      name: "Christmas 2026",
      description: null,
      owner_id: 2,
      is_archived: false,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    },
  ];

  function serveFolders() {
    server.use(
      http.get(`${API}/folders`, () => HttpResponse.json(folders)),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );
  }

  async function openFromMenu() {
    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to a folder…" }));
    return screen.getByRole("region", { name: "Add to a folder" });
  }

  it("opens the picker from the owner's menu", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
    serveFolders();

    renderListDetail(ownerToken);

    const panel = await openFromMenu();
    expect(await within(panel).findByRole("checkbox", { name: /christmas 2026/i })).toBeInTheDocument();
  });

  // The whole point of moving this into the header: a viewer has no other way
  // in, so it has to work identically for them.
  it("opens the picker from a viewer's menu too", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );
    serveFolders();

    renderListDetail(viewerToken);

    const panel = await openFromMenu();
    expect(await within(panel).findByRole("checkbox", { name: /christmas 2026/i })).toBeInTheDocument();
  });

  it("shows the sharing panel and the picker one at a time", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
    serveFolders();

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(screen.getByRole("region", { name: "Who can see this list" })).toBeInTheDocument();

    await openFromMenu();
    expect(screen.queryByRole("region", { name: "Who can see this list" })).not.toBeInTheDocument();
  });
});

describe("ListDetail — list recipients", () => {
  const withRecipient = (base: object, name: string | null) => ({
    ...base,
    recipient_name: name,
  });

  function serveList(list: object) {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(list)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
  }

  /** Same, but with an accepted connection to the owner, so a profile link renders. */
  function serveListConnectedToOwner(list: object) {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(list)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 55, status: "accepted", user: { id: 1, name: "Owner", email: "owner@test.com" },
            created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
    );
  }

  // --- viewer attribution ---

  it("shows the owner on a list with no recipient", async () => {
    serveList(withRecipient(viewerListDetail, null));
    renderListDetail(viewerToken);
    expect(await screen.findByText("from Owner")).toBeInTheDocument();
  });

  it("names the keeper on any list with a recipient", async () => {
    // A recipient is now always a person with no account (NEU-1241), so this is
    // the only form a named recipient takes.
    serveList(withRecipient(viewerListDetail, "Beth"));
    renderListDetail(viewerToken);
    expect(await screen.findByText(/for Beth · kept by Owner/)).toBeInTheDocument();
  });

  it("never shows the keeper's warning to a viewer", async () => {
    serveList(withRecipient(viewerListDetail, "Beth"));
    renderListDetail(viewerToken);
    await screen.findByText(/for Beth · kept by Owner/);
    expect(screen.queryByText(/Leave off anything you're buying/)).not.toBeInTheDocument();
  });

  // --- owner header ---

  it("labels the owner's own recipient list", async () => {
    serveList(withRecipient(ownerListDetail, "Beth"));
    renderListDetail(ownerToken);
    expect(await screen.findByText("for Beth")).toBeInTheDocument();
  });

  it("shows the keeper's warning to the owner of a recipient list", async () => {
    serveList(withRecipient(ownerListDetail, "Beth"));
    renderListDetail(ownerToken);
    expect(
      await screen.findByText(/You can't see or make claims on Beth's list/),
    ).toBeInTheDocument();
  });

  it("shows nothing extra on the owner's list with no recipient", async () => {
    serveList(withRecipient(ownerListDetail, null));
    renderListDetail(ownerToken);
    await screen.findByText("My Wishlist");
    expect(screen.queryByText(/^for /)).not.toBeInTheDocument();
    expect(screen.queryByText(/can't see or make claims/)).not.toBeInTheDocument();
  });

  // --- edit ---

  it("seeds the edit control from the list and can clear the recipient", async () => {
    const put = vi.fn();
    serveList(withRecipient(ownerListDetail, "Beth"));
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        put(await request.json());
        return HttpResponse.json(withRecipient(ownerListDetail, null));
      }),
    );

    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const disclosure = screen.getByRole("checkbox", {
      name: "This list is for someone else",
    });
    expect(disclosure).toBeChecked();
    expect(screen.getByRole("textbox", { name: /who is this list for/i }))
      .toHaveValue("Beth");
    // Nothing left to answer beside the name (NEU-1241).
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(disclosure);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({ recipient_name: null });
  });

  it("can switch a self-list to a recipient list", async () => {
    const put = vi.fn();
    serveList(withRecipient(ownerListDetail, null));
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        put(await request.json());
        return HttpResponse.json(withRecipient(ownerListDetail, "Jane"));
      }),
    );

    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "This list is for someone else" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Jane",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({ recipient_name: "Jane" });
  });

  it("cannot save while the disclosure is open and the name is blank", async () => {
    serveList(withRecipient(ownerListDetail, null));
    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "This list is for someone else" }),
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // --- link placement (§2.5) ---

  it("links the owner's name on a list with no recipient", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, null));
    renderListDetail(viewerToken);

    const link = await screen.findByRole("link", { name: "Owner" });
    expect(link).toHaveAttribute("href", "/people/55");
  });

  it("puts the link on the keeper, leaving the absent recipient plain text", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, "Beth"));
    renderListDetail(viewerToken);

    const link = await screen.findByRole("link", { name: "Owner" });
    expect(link).toHaveAttribute("href", "/people/55");
    // Linking "Beth" to the keeper's profile would simply be wrong.
    expect(screen.queryByRole("link", { name: "Beth" })).not.toBeInTheDocument();
  });

});

describe("ListDetail — who is this list for (shared account)", () => {
  const sharedAccount = {
    is_shared_account: true,
    people: [
      { id: 4, name: "Gran" },
      { id: 5, name: "Grandpa" },
    ],
  };

  /** An owner's list, optionally already marked for one of the account's people. */
  const markedFor = (personId: number | null, personName: string | null) => ({
    ...ownerListDetail,
    recipient_name: null,
    account_person_id: personId,
    account_person_name: personName,
  });

  function serveSharedAccount(list: object) {
    const put = vi.fn();
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(list)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/account`, () => HttpResponse.json(sharedAccount)),
      http.put(`${API}/lists/1`, async ({ request }) => {
        put(await request.json());
        return HttpResponse.json(list);
      }),
    );
    return put;
  }

  async function openEditor() {
    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The picker only replaces the disclosure once GET /account has answered.
    await screen.findByRole("radio", { name: "Gran" });
  }

  it("labels the header with the person the list is marked for", async () => {
    serveSharedAccount(markedFor(4, "Gran"));

    renderListDetail(ownerToken);

    expect(await screen.findByText("for Gran")).toBeInTheDocument();
  });

  it("seeds the picker from the list and can move it to the other person", async () => {
    const put = serveSharedAccount(markedFor(4, "Gran"));

    renderListDetail(ownerToken);
    await openEditor();

    expect(screen.getByRole("radio", { name: "Gran" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Grandpa" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Grandpa" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({
      account_person_id: 5,
      recipient_name: null,
    });
  });

  it("seeds a list marked for neither as the household answer", async () => {
    const put = serveSharedAccount(markedFor(null, null));

    renderListDetail(ownerToken);
    await openEditor();

    expect(screen.getByRole("radio", { name: "Both of us" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({
      account_person_id: null,
      recipient_name: null,
    });
  });

  it("clears the person when the list moves to someone else", async () => {
    const put = serveSharedAccount(markedFor(4, "Gran"));

    renderListDetail(ownerToken);
    await openEditor();

    await userEvent.click(screen.getByRole("radio", { name: "Someone else" }));
    await userEvent.type(screen.getByRole("textbox", { name: /their name/i }), "Beth");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({
      account_person_id: null,
      recipient_name: "Beth",
    });
  });
});

describe("ListDetail — the edit picker while the account is still loading", () => {
  // Until GET /account answers there is no honest way to draw a list already
  // marked for one of the account's people: the non-shared disclosure would read
  // "for no one", and one click on it would send exactly that.
  it("shows no recipient control at all, rather than an unchecked disclosure", async () => {
    let releaseAccount: (() => void) | undefined;
    const accountPending = new Promise<void>((resolve) => {
      releaseAccount = resolve;
    });

    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({
          ...ownerListDetail,
          recipient_name: null,
          account_person_id: 4,
          account_person_name: "Gran",
        }),
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/account`, async () => {
        await accountPending;
        return HttpResponse.json({
          is_shared_account: true,
          people: [{ id: 4, name: "Gran" }, { id: 5, name: "Grandpa" }],
        });
      }),
    );

    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "This list is for someone else" }),
    ).not.toBeInTheDocument();

    releaseAccount!();
    expect(await screen.findByRole("radio", { name: "Gran" })).toBeChecked();
  });
});

describe("ListDetail — recording what a purchase cost", () => {
  // The viewer (user 2) has claimed this gift; $39 is the *owner's* asking
  // price, which the prompt may hint at but must never fill in.
  const myClaim = {
    id: 10,
    name: "Cast iron skillet",
    description: null,
    url: null,
    price: "39.00",
    claimed_by_id: 2,
    claimed_at: "2026-01-02",
    purchased_at: null,
    amount_paid: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  function serveViewerList(gift: object) {
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({ ...viewerListDetail, gifts: [gift] })
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );
  }

  /** Captures the raw purchase body: "Skip" sends none at all, which is a
   * different request from one carrying an explicit null, and `request.json()`
   * cannot tell the two apart. */
  function capturePurchase(response: object = { ...myClaim, purchased_at: "2026-01-03" }) {
    const posted = vi.fn();
    server.use(
      http.post(`${API}/lists/1/gifts/10/purchase`, async ({ request }) => {
        posted(await request.text());
        return HttpResponse.json(response);
      }),
    );
    return posted;
  }

  async function tickBought() {
    await userEvent.click(await screen.findByRole("checkbox", { name: "Bought" }));
  }

  it("opens the amount prompt empty, with the asking price as a hint only", async () => {
    serveViewerList(myClaim);
    renderListDetail(viewerToken);

    await tickBought();

    const field = screen.getByRole("textbox", { name: "What did you pay?" });
    expect(field).toHaveValue("");
    // The asking price is beside the field, not in it.
    expect(screen.getByText("listed at $39.00")).toBeInTheDocument();
  });

  it("does not record the purchase until Save or Skip", async () => {
    const posted = capturePurchase();
    serveViewerList(myClaim);
    renderListDetail(viewerToken);

    await tickBought();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("records what was paid on Save", async () => {
    const posted = capturePurchase();
    serveViewerList(myClaim);
    renderListDetail(viewerToken);

    await tickBought();
    await userEvent.type(
      screen.getByRole("textbox", { name: "What did you pay?" }),
      "32.50"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(JSON.parse(posted.mock.calls[0][0])).toEqual({ amount_paid: "32.50" });
  });

  it("records the purchase with no amount on Skip", async () => {
    const posted = capturePurchase();
    serveViewerList(myClaim);
    renderListDetail(viewerToken);

    await tickBought();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    // No body at all: an omitted amount leaves any recorded one alone, which is
    // what makes unticking and re-ticking non-destructive.
    expect(posted.mock.calls[0][0]).toBe("");
  });

  it("shows what the claimer paid once it is recorded", async () => {
    serveViewerList({ ...myClaim, purchased_at: "2026-01-03", amount_paid: "32.50" });
    renderListDetail(viewerToken);

    expect(await screen.findByText("you paid $32.50")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Bought" })).toBeChecked();
  });

  it("says so when a purchase has no amount recorded", async () => {
    serveViewerList({ ...myClaim, purchased_at: "2026-01-03" });
    renderListDetail(viewerToken);

    expect(await screen.findByText("no amount recorded")).toBeInTheDocument();
  });

  it("abandons an unanswered prompt when the tick is taken back", async () => {
    const posted = capturePurchase();
    serveViewerList(myClaim);
    renderListDetail(viewerToken);

    await tickBought();
    await userEvent.type(
      screen.getByRole("textbox", { name: "What did you pay?" }),
      "32.50"
    );
    // Unticking abandons it: nothing was recorded by the tick, so nothing is
    // undone on the server either.
    await userEvent.click(screen.getByRole("checkbox", { name: "Bought" }));

    expect(
      screen.queryByRole("textbox", { name: "What did you pay?" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bought" })).not.toBeChecked();
    expect(posted).not.toHaveBeenCalled();
  });

  it("seeds the prompt from the claimer's own retained amount on re-ticking", async () => {
    // The server keeps `amount_paid` through an untick, so re-ticking should not
    // make the claimer retype what they paid.
    serveViewerList({ ...myClaim, amount_paid: "32.50" });
    renderListDetail(viewerToken);

    await tickBought();

    expect(screen.getByRole("textbox", { name: "What did you pay?" })).toHaveValue("32.50");
  });

  it("offers no in-place edit of a recorded amount", async () => {
    // Post-hoc correction is the shopping tab's job (project spec §6.2,
    // NEU-1274); a second POST here would re-stamp the purchase date.
    serveViewerList({ ...myClaim, purchased_at: "2026-01-03", amount_paid: "32.50" });
    renderListDetail(viewerToken);

    expect(await screen.findByText("you paid $32.50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add amount" })).not.toBeInTheDocument();
  });

  it("keeps the purchase record readable but read-only on an archived list", async () => {
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({
          ...viewerListDetail,
          is_archived: true,
          gifts: [{ ...myClaim, purchased_at: "2026-01-03", amount_paid: "32.50" }],
        })
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );
    renderListDetail(viewerToken);

    // Archiving takes the actions away, not the record.
    expect(await screen.findByText("you paid $32.50")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bought" })).toBeDisabled();
  });

  it("unticks a purchase without discarding the amount", async () => {
    const deleted = vi.fn();
    serveViewerList({ ...myClaim, purchased_at: "2026-01-03", amount_paid: "32.50" });
    server.use(
      http.delete(`${API}/lists/1/gifts/10/purchase`, () => {
        deleted();
        return HttpResponse.json({ ...myClaim, amount_paid: "32.50" });
      }),
    );
    renderListDetail(viewerToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Bought" }));

    await waitFor(() => expect(deleted).toHaveBeenCalled());
  });

  it("offers no purchase control on a gift somebody else claimed", async () => {
    serveViewerList({ ...myClaim, claimed_by_id: 3 });
    renderListDetail(viewerToken);

    expect(await screen.findByText("Taken")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bought" })).not.toBeInTheDocument();
  });

  it("keeps every trace of the purchase off the owner's copy of the list", async () => {
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({ ...ownerListDetail, gifts: [{ id: 10, name: "Cast iron skillet", description: null, url: null, price: "39.00", created_at: "2026-01-01", updated_at: "2026-01-01" }] })
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );
    renderListDetail(ownerToken);

    await screen.findByText("Cast iron skillet");
    expect(screen.queryByRole("checkbox", { name: "Bought" })).not.toBeInTheDocument();
    expect(screen.queryByText(/you paid/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no amount recorded/)).not.toBeInTheDocument();
  });
});

describe("ListDetail — filing a claim under an occasion", () => {
  // Unclaimed, so the viewer (user 2) can claim it.
  const unclaimed = {
    id: 10,
    name: "Cast iron skillet",
    description: null,
    url: null,
    price: "39.00",
    claimed_by_id: null,
    claimed_at: null,
    purchased_at: null,
    amount_paid: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  const booneChristmas = {
    id: 3,
    name: "Christmas 2026",
    is_archived: false,
    family: { id: 1, name: "Boone Family" },
  };
  // Deliberately the same *name* in another family: the picker that shows only
  // occasion names asks a question the user cannot answer.
  const smithChristmas = {
    id: 4,
    name: "Christmas 2026",
    is_archived: false,
    family: { id: 2, name: "Smith Family" },
  };
  const archivedChristmas = {
    id: 2,
    name: "Christmas 2025",
    is_archived: true,
    family: { id: 1, name: "Boone Family" },
  };

  function serveViewerList(candidates: object[], options: object[] = candidates) {
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({
          ...viewerListDetail,
          gifts: [unclaimed],
          claim_candidates: candidates,
          claim_options: options,
        })
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );
  }

  /** Captures the raw claim body: no occasion at all is a different request
   * from one naming null, and the server reads them differently. */
  function captureClaim() {
    const posted = vi.fn();
    server.use(
      http.post(`${API}/lists/1/gifts/10/claim`, async ({ request }) => {
        posted(await request.text());
        return HttpResponse.json({ ...unclaimed, claimed_by_id: 2, claimed_at: "2026-01-02" });
      }),
    );
    return posted;
  }

  async function clickClaim() {
    await userEvent.click(await screen.findByRole("button", { name: "I'll get this" }));
  }

  it("claims in one click and asks nothing when there is no occasion to choose", async () => {
    const posted = captureClaim();
    serveViewerList([]);
    renderListDetail(viewerToken);

    await clickClaim();

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toBe("");
    expect(screen.queryByLabelText("Which occasion is this for?")).not.toBeInTheDocument();
  });

  it("claims in one click and asks nothing when only one occasion is suggested", async () => {
    // The overwhelmingly common path. The server files it under the single
    // candidate itself, so the client sends nothing and stays one click.
    const posted = captureClaim();
    serveViewerList([booneChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toBe("");
    expect(screen.queryByLabelText("Which occasion is this for?")).not.toBeInTheDocument();
  });

  it("keys the prompt off the suggested set, not the wider option set", async () => {
    // The year-three case: two Christmases archived, one active. `claim_options`
    // holds all three, but only one is suggested, so this must stay a silent
    // one-click filing. A regression to counting `claim_options` would prompt
    // on every claim forever, with the answer obvious every time.
    const posted = captureClaim();
    serveViewerList(
      [booneChristmas],
      [booneChristmas, archivedChristmas, { ...archivedChristmas, id: 1, name: "Christmas 2024" }],
    );
    renderListDetail(viewerToken);

    await clickClaim();

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toBe("");
    expect(screen.queryByLabelText("Which occasion is this for?")).not.toBeInTheDocument();
  });

  it("asks before claiming when two occasions are suggested, and does not claim yet", async () => {
    const posted = captureClaim();
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();

    expect(await screen.findByLabelText("Which occasion is this for?")).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("names the family on every choice, because two can share an occasion name", async () => {
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();

    const picker = await screen.findByLabelText("Which occasion is this for?");
    expect(within(picker).getByRole("option", { name: "Boone Family · Christmas 2026" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Smith Family · Christmas 2026" })).toBeInTheDocument();
  });

  it("nothing is pre-selected, and saving is refused until an occasion is chosen", async () => {
    // Picking for the user would record a guess as a fact.
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();

    expect(await screen.findByLabelText("Which occasion is this for?")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("sends the chosen occasion with the claim", async () => {
    const posted = captureClaim();
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();
    await userEvent.selectOptions(
      await screen.findByLabelText("Which occasion is this for?"),
      "4",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(JSON.parse(posted.mock.calls[0][0])).toEqual({ occasion_id: 4 });
  });

  it("abandons the claim entirely on Cancel", async () => {
    const posted = captureClaim();
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Which occasion is this for?")).not.toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("marks an archived occasion as archived", async () => {
    // Every candidate is archived, so `suggested` falls back to all of
    // `allowed` — the late-January shopper, still choosing between two.
    serveViewerList([archivedChristmas, { ...smithChristmas, is_archived: true }]);
    renderListDetail(viewerToken);

    await clickClaim();

    const picker = await screen.findByLabelText("Which occasion is this for?");
    expect(within(picker).getByRole("option", { name: "Boone Family · Christmas 2025 — archived" })).toBeInTheDocument();
  });

  it("offers past occasions from the wider option set, and files under one", async () => {
    // Christmas 2025 is archived, so it is not suggested — but a January claim
    // for it must still be filable, which is the whole reason `claim_options`
    // is wider than `claim_candidates`.
    const posted = captureClaim();
    serveViewerList(
      [booneChristmas, smithChristmas],
      [booneChristmas, smithChristmas, archivedChristmas],
    );
    renderListDetail(viewerToken);

    await clickClaim();

    const picker = await screen.findByLabelText("Which occasion is this for?");
    expect(within(picker).queryByRole("option", { name: /Christmas 2025/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show past occasions" }));
    await userEvent.selectOptions(picker, "2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(JSON.parse(posted.mock.calls[0][0])).toEqual({ occasion_id: 2 });
  });

  it("offers no past occasions when the option set holds none", async () => {
    serveViewerList([booneChristmas, smithChristmas]);
    renderListDetail(viewerToken);

    await clickClaim();

    await screen.findByLabelText("Which occasion is this for?");
    expect(screen.queryByRole("button", { name: "Show past occasions" })).not.toBeInTheDocument();
  });

  it("refetches and explains when a share added meanwhile makes the claim ambiguous", async () => {
    // The client held one candidate and rightly sent no id; a share landed in
    // between and made it two. One refetch, one more click.
    let reads = 0;
    server.use(
      http.get(`${API}/lists/1`, () => {
        reads += 1;
        return HttpResponse.json({
          ...viewerListDetail,
          gifts: [unclaimed],
          claim_candidates: reads === 1 ? [booneChristmas] : [booneChristmas, smithChristmas],
          claim_options: reads === 1 ? [booneChristmas] : [booneChristmas, smithChristmas],
        });
      }),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
      http.post(`${API}/lists/1/gifts/10/claim`, () =>
        HttpResponse.json({ detail: "ambiguous_occasion" }, { status: 400 })
      ),
    );
    renderListDetail(viewerToken);

    await clickClaim();

    // The refetched candidates now make the row ask, which is the way through.
    await userEvent.click(await screen.findByRole("button", { name: "I'll get this" }));
    expect(await screen.findByLabelText("Which occasion is this for?")).toBeInTheDocument();
  });
});
