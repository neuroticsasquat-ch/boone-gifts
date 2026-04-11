import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
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

const ownerListDetail = {
  id: 1,
  name: "My Wishlist",
  description: "Things I want",
  owner_id: 1,
  owner_name: "Owner",
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
  it("renders sharing section for owner", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Sharing")).toBeInTheDocument();
    });
  });

  it("does not render sharing section for viewer", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
    );

    renderListDetail(viewerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sharing")).not.toBeInTheDocument();
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
    );

    renderListDetail(ownerToken);

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
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // The "Remove" button in the sharing section (may be multiple Remove buttons on page)
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
    );

    renderListDetail(ownerToken);

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
    );

    renderListDetail(ownerToken);

    const link = await screen.findByText("Test Gift");
    expect(link.className).not.toContain("truncate");
    expect(link.className).toContain("break-words");
  });

  it("renders gift name without URL using break-words", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
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
    );

    renderListDetail(ownerToken);

    // Price appears twice (once in GiftInfo for desktop, once in row for mobile)
    const prices = await screen.findAllByText("$29.99");
    expect(prices.length).toBe(2);
  });

  it("renders duplicate price in viewer gift row for mobile", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
    );

    renderListDetail(viewerToken);

    // Price appears twice (once in GiftInfo for desktop, once in row for mobile)
    const prices = await screen.findAllByText("$15.00");
    expect(prices.length).toBe(2);
  });
});
