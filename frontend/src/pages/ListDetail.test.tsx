import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
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

describe("ListDetail Sharing Section", () => {
  it("renders sharing controls for owner in Shared with tab", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    // Wait for the page to load, then click the Shared with tab
    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Shared with"));

    await waitFor(() => {
      expect(screen.getByText("Share")).toBeInTheDocument();
    });
  });

  it("does not render sharing controls for viewer in Shared with tab", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares/users`, () => HttpResponse.json([])),
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Shared with"));

    await waitFor(() => {
      expect(screen.getByText("Owner hasn't shared this list with anyone else.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("adds a share from connections dropdown", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.post(`${API}/lists/1/shares`, () =>
        HttpResponse.json({ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }, { status: 201 })
      ),
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Shared with"));

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "2");
    await userEvent.click(screen.getByText("Share"));
  });

  it("removes a share", async () => {
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
      http.delete(`${API}/lists/1/shares/2`, () =>
        new HttpResponse(null, { status: 204 })
      ),
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Shared with"));

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // The "Remove" button in the sharing section
    const removeButtons = screen.getAllByText("Remove");
    await userEvent.click(removeButtons[removeButtons.length - 1]);
  });

  it("hides add share when all connections already shared", async () => {
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Shared with"));

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // The share dropdown should not be present since Alice is already shared
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
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
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.get(`${API}/collections/for-list/1`, () => HttpResponse.json([])),
    );

    renderListDetail(viewerToken);

    const prices = await screen.findAllByText("$15.00");
    expect(prices.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ListDetail — simple mode tab visibility", () => {
  it("hides the Shared with tab when user is in simple mode", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([]))
    );

    renderListDetail(simpleModeOwnerToken);

    await screen.findByText("My Wishlist");
    expect(screen.queryByRole("button", { name: /shared with/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gifts/i })).toBeInTheDocument();
  });

  it("shows the Shared with tab when user is in full mode", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([]))
    );

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    expect(screen.getByRole("button", { name: /shared with/i })).toBeInTheDocument();
  });

  it("keeps the Families tab visible in simple mode", async () => {
    // Unlike "Shared with": a simple-mode user can own a list created in full
    // mode and left unshared, so they need to see its real state.
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([]))
    );

    renderListDetail(simpleModeOwnerToken);

    await screen.findByText("My Wishlist");
    expect(screen.getByRole("button", { name: /^families$/i })).toBeInTheDocument();
  });

  it("hides the Families tab from a non-owner viewer", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([]))
    );

    renderListDetail(viewerToken);

    await screen.findByText("My Wishlist");
    expect(screen.queryByRole("button", { name: /^families$/i })).not.toBeInTheDocument();
  });

  it("renders the Families tab content when selected", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([{ id: 7, name: "The Boones", shared: true }])
      ),
    );

    renderListDetail(ownerToken);

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: /^families$/i }));

    expect(
      await screen.findByRole("checkbox", { name: /share with the boones/i })
    ).toBeChecked();
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

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

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

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
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

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
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
    expect(link).toHaveAttribute("href", "/connections/55");
  });

  it("links the recipient's name on a shared-account list — same owner profile", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, "Jane", true));
    renderListDetail(viewerToken);

    // Jane is the name showing, but the account behind the list is still the owner's.
    const link = await screen.findByRole("link", { name: "Jane" });
    expect(link).toHaveAttribute("href", "/connections/55");
  });

  it("puts the link on the keeper, leaving the absent recipient plain text", async () => {
    serveListConnectedToOwner(withRecipient(viewerListDetail, "Beth", false));
    renderListDetail(viewerToken);

    const link = await screen.findByRole("link", { name: "Owner" });
    expect(link).toHaveAttribute("href", "/connections/55");
    // Linking "Beth" to the keeper's profile would simply be wrong.
    expect(screen.queryByRole("link", { name: "Beth" })).not.toBeInTheDocument();
  });

  it("cannot save with the disclosure open and the name left blank", async () => {
    serveList(withRecipient(ownerListDetail, null, null));
    renderListDetail(ownerToken);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "This list is for someone else" }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "They use this app" }));

    // Submitting here would silently save a plain self-list.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
