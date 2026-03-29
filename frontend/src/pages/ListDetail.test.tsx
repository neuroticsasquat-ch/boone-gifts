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
