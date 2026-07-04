import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { FamilyLists } from "./FamilyLists";

const API = "https://boone-gifts-api.localhost";

function renderFamilyLists() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FamilyLists />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FamilyLists", () => {
  it("renders a loading indicator while query is pending", () => {
    server.use(
      http.get(`${API}/lists`, () => new Promise(() => {})),
    );

    renderFamilyLists();

    expect(screen.getByRole("heading", { name: /family lists/i })).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders error message when API returns 500", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "family") {
          return HttpResponse.json({}, { status: 500 });
        }
        return HttpResponse.error();
      }),
    );

    renderFamilyLists();

    await waitFor(() => {
      expect(screen.getByText(/failed to load family lists/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /family lists/i })).toBeInTheDocument();
  });

  it("renders empty message when API returns no lists", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "family") {
          return HttpResponse.json([]);
        }
        return HttpResponse.error();
      }),
    );

    renderFamilyLists();

    await waitFor(() => {
      expect(screen.getByText(/no family lists/i)).toBeInTheDocument();
    });
  });

  it("groups two lists under the same family heading", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "family") {
          return HttpResponse.json([
            {
              id: 1, name: "Alice Wishlist", owner_name: "Alice", gift_count: 5, claimed_count: 2,
              description: null, owner_id: 10, is_archived: false,
              created_at: "2026-01-01", updated_at: "2026-01-01",
              families: [{ id: 1, name: "Smith Family" }],
            },
            {
              id: 2, name: "Bob Wishlist", owner_name: "Bob", gift_count: 3, claimed_count: 1,
              description: null, owner_id: 11, is_archived: false,
              created_at: "2026-01-01", updated_at: "2026-01-01",
              families: [{ id: 1, name: "Smith Family" }],
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    renderFamilyLists();

    await waitFor(() => {
      expect(screen.getByText("Smith Family")).toBeInTheDocument();
    });
    expect(screen.getByText("Alice Wishlist")).toBeInTheDocument();
    expect(screen.getByText("from Alice")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 claimed")).toBeInTheDocument();
    expect(screen.getByText("Bob Wishlist")).toBeInTheDocument();
    expect(screen.getByText("from Bob")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 claimed")).toBeInTheDocument();
  });

  it("shows a multi-family list under both family headings", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "family") {
          return HttpResponse.json([
            {
              id: 3, name: "Shared List", owner_name: "Carol", gift_count: 4, claimed_count: 0,
              description: null, owner_id: 12, is_archived: false,
              created_at: "2026-01-01", updated_at: "2026-01-01",
              families: [
                { id: 1, name: "Smith Family" },
                { id: 2, name: "Jones Family" },
              ],
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    renderFamilyLists();

    await waitFor(() => {
      expect(screen.getByText("Smith Family")).toBeInTheDocument();
    });
    expect(screen.getByText("Jones Family")).toBeInTheDocument();
    expect(screen.getAllByText("Shared List")).toHaveLength(2);
  });

  it("renders row links pointing to /lists/:id", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "family") {
          return HttpResponse.json([
            {
              id: 7, name: "My Gift List", owner_name: "Dan", gift_count: 6, claimed_count: 3,
              description: null, owner_id: 13, is_archived: false,
              created_at: "2026-01-01", updated_at: "2026-01-01",
              families: [{ id: 1, name: "Smith Family" }],
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    renderFamilyLists();

    await waitFor(() => {
      expect(screen.getByText("My Gift List")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /my gift list/i });
    expect(link).toHaveAttribute("href", "/lists/7");
  });
});
