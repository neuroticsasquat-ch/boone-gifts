import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
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

// JWT with payload: { sub: "1", email: "owner@test.com", role: "member", simple_mode: true, exp: 9999999999 }
const simpleModeOwnerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
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

const viewerListDetail = {
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
            <Route path="/lists/:id" element={<ListDetail />} />
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
        HttpResponse.json([{ id: 7, name: "The Boones", shared: true }])
      ),
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    const prices = await screen.findAllByText("$15.00");
    expect(prices.length).toBeGreaterThanOrEqual(1);
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
    for (const tab of [/^gifts$/i, /^occasions$/i, /^shared with$/i, /^families$/i]) {
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
          { id: 7, name: "The Boones", shared: true },
          { id: 8, name: "The Smiths", shared: false },
        ])
      ),
    );

    renderListDetail(ownerToken);

    expect(await screen.findByText("Shared with Alice, The Boones")).toBeInTheDocument();
  });

  it("says so when a list is shared with nobody", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([{ id: 7, name: "The Boones", shared: false }])
      ),
    );

    renderListDetail(ownerToken);

    expect(await screen.findByText("Not shared with anyone yet")).toBeInTheDocument();
  });

  it("shows simple mode a read-only summary with no Change control", async () => {
    // The backend auto-grants a simple-mode user's lists to their families, so
    // there is nothing here for them to change.
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );

    renderListDetail(simpleModeOwnerToken);

    expect(await screen.findByText("Shared with your families")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });

  it("opens the family controls from Change", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([{ id: 7, name: "The Boones", shared: true }])
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

  it("gives a viewer the menu, holding the occasion action alone", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));

    expect(screen.getByRole("button", { name: "Add to an occasion…" })).toBeInTheDocument();
    for (const owned of ["Edit", "Archive", "Delete"]) {
      expect(screen.queryByRole("button", { name: owned })).not.toBeInTheDocument();
    }
  });
});

describe("ListDetail — add to an occasion", () => {
  const occasions = [
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

  function serveOccasions() {
    server.use(
      http.get(`${API}/occasions`, () => HttpResponse.json(occasions)),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
    );
  }

  async function openFromMenu() {
    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to an occasion…" }));
    return screen.getByRole("region", { name: "Add to an occasion" });
  }

  it("opens the picker from the owner's menu", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
    serveOccasions();

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
    serveOccasions();

    renderListDetail(viewerToken);

    const panel = await openFromMenu();
    expect(await within(panel).findByRole("checkbox", { name: /christmas 2026/i })).toBeInTheDocument();
  });

  // Simple mode has no occasion filter on /lists, so it cannot read an occasion
  // back — offering to file a list into one would strand the membership.
  it("hides the action in simple mode, leaving the rest of the menu", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
    );
    serveOccasions();

    renderListDetail(simpleModeOwnerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "List actions" }));

    expect(screen.queryByRole("button", { name: "Add to an occasion…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows the sharing panel and the picker one at a time", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    );
    serveOccasions();

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(screen.getByRole("region", { name: "Who can see this list" })).toBeInTheDocument();

    await openFromMenu();
    expect(screen.queryByRole("region", { name: "Who can see this list" })).not.toBeInTheDocument();
  });
});

describe("ListDetail — list recipients", () => {
  const withRecipient = (base: object, name: string | null, hasAccount: boolean | null) => ({
    ...base,
    recipient_name: name,
    recipient_has_account: hasAccount,
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
    serveList(withRecipient(viewerListDetail, null, null));
    renderListDetail(viewerToken);
    expect(await screen.findByText("from Owner")).toBeInTheDocument();
  });

  it("shows the recipient alone when they have an account", async () => {
    serveList(withRecipient(viewerListDetail, "Jane", true));
    renderListDetail(viewerToken);
    expect(await screen.findByText("from Jane")).toBeInTheDocument();
    expect(screen.queryByText(/kept by/)).not.toBeInTheDocument();
  });

  it("names the keeper when the recipient has no account", async () => {
    serveList(withRecipient(viewerListDetail, "Beth", false));
    renderListDetail(viewerToken);
    expect(await screen.findByText(/for Beth · kept by Owner/)).toBeInTheDocument();
  });

  it("never shows the keeper's warning to a viewer", async () => {
    serveList(withRecipient(viewerListDetail, "Beth", false));
    renderListDetail(viewerToken);
    await screen.findByText(/for Beth · kept by Owner/);
    expect(screen.queryByText(/Leave off anything you're buying/)).not.toBeInTheDocument();
  });

  // --- owner header ---

  it("labels the owner's own recipient list", async () => {
    serveList(withRecipient(ownerListDetail, "Beth", false));
    renderListDetail(ownerToken);
    expect(await screen.findByText("for Beth")).toBeInTheDocument();
  });

  it("shows the keeper's warning to the owner of an absent-recipient list", async () => {
    serveList(withRecipient(ownerListDetail, "Beth", false));
    renderListDetail(ownerToken);
    expect(
      await screen.findByText(/You can't see or make claims on Beth's list/),
    ).toBeInTheDocument();
  });

  it("shows no warning when the recipient has an account", async () => {
    serveList(withRecipient(ownerListDetail, "Jane", true));
    renderListDetail(ownerToken);
    expect(await screen.findByText("for Jane")).toBeInTheDocument();
    expect(screen.queryByText(/can't see or make claims/)).not.toBeInTheDocument();
  });

  it("shows nothing extra on the owner's list with no recipient", async () => {
    serveList(withRecipient(ownerListDetail, null, null));
    renderListDetail(ownerToken);
    await screen.findByText("My Wishlist");
    expect(screen.queryByText(/^for /)).not.toBeInTheDocument();
    expect(screen.queryByText(/can't see or make claims/)).not.toBeInTheDocument();
  });

  // --- edit ---

  it("seeds the edit control from the list and can clear the recipient", async () => {
    const put = vi.fn();
    serveList(withRecipient(ownerListDetail, "Beth", false));
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        put(await request.json());
        return HttpResponse.json(withRecipient(ownerListDetail, null, null));
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
    expect(screen.getByRole("radio", { name: "Beth doesn't use this app" }))
      .toBeChecked();

    await userEvent.click(disclosure);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({
      recipient_name: null,
      recipient_has_account: null,
    });
  });

  it("can switch a self-list to a recipient list", async () => {
    const put = vi.fn();
    serveList(withRecipient(ownerListDetail, null, null));
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        put(await request.json());
        return HttpResponse.json(withRecipient(ownerListDetail, "Jane", true));
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
    await userEvent.click(screen.getByRole("radio", { name: "Jane uses this app" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatchObject({
      recipient_name: "Jane",
      recipient_has_account: true,
    });
  });

  it("cannot save while the disclosure is open and no radio is chosen", async () => {
    serveList(withRecipient(ownerListDetail, null, null));
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
    serveListConnectedToOwner(withRecipient(viewerListDetail, null, null));
    renderListDetail(viewerToken);

    const link = await screen.findByRole("link", { name: "Owner" });
    expect(link).toHaveAttribute("href", "/people/55");
  });

  it("links the recipient's name on a shared-account list — same owner profile", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, "Jane", true));
    renderListDetail(viewerToken);

    // Jane is the name showing, but the account behind the list is still the owner's.
    const link = await screen.findByRole("link", { name: "Jane" });
    expect(link).toHaveAttribute("href", "/people/55");
  });

  it("puts the link on the keeper, leaving the absent recipient plain text", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, "Beth", false));
    renderListDetail(viewerToken);

    const link = await screen.findByRole("link", { name: "Owner" });
    expect(link).toHaveAttribute("href", "/people/55");
    // Linking "Beth" to the keeper's profile would simply be wrong.
    expect(screen.queryByRole("link", { name: "Beth" })).not.toBeInTheDocument();
  });

  it("cannot save with the disclosure open and the name left blank", async () => {
    serveList(withRecipient(ownerListDetail, null, null));
    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "List actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "This list is for someone else" }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "They use this app" }));

    // Submitting here would silently save a plain self-list.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
