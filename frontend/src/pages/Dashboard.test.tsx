import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Dashboard } from "./Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard", () => {
  it("renders owned lists as clickable items", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "owned")
          return HttpResponse.json([{ id: 1, name: "My Wishlist", owner_id: 1, owner_name: "Me" }]);
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
  });

  it("renders connection requests with accept/decline", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", () => HttpResponse.json([])),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => {
        return HttpResponse.json([
          { id: 5, status: "pending", user: { id: 2, name: "Jane Doe", email: "jane@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ]);
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
    expect(screen.getByText("jane@test.com")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("renders shared lists section", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "shared") {
          return HttpResponse.json([
            { id: 10, name: "Birthday Wishes", owner_id: 3, owner_name: "Alice" },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Birthday Wishes")).toBeInTheDocument();
    });
    expect(screen.getByText("from Alice")).toBeInTheDocument();
  });

  it("shows empty states when no data", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", () => HttpResponse.json([])),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/You haven't created any lists yet/)).toBeInTheDocument();
    });
    expect(screen.queryByText("Pending Connection Requests")).not.toBeInTheDocument();
    expect(screen.getByText("Shared with Me")).toBeInTheDocument();
    expect(screen.getByText(/No one has shared a list with you yet/)).toBeInTheDocument();
  });

  it("labels the owner's own rows with the recipient (and only those with one)", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "owned") {
          return HttpResponse.json([
            { id: 1, name: "My Wishlist", owner_id: 1, owner_name: "Me",
              recipient_name: null, recipient_has_account: null },
            { id: 2, name: "Christmas Ideas", owner_id: 1, owner_name: "Me",
              recipient_name: "Beth", recipient_has_account: false },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Christmas Ideas")).toBeInTheDocument();
    });
    // Without this the keeper's two lists are told apart only by their names.
    expect(screen.getByText("for Beth")).toBeInTheDocument();
    expect(screen.queryByText("for Me")).not.toBeInTheDocument();
  });

  it("attributes a shared list to its recipient's keeper", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("filter") === "shared") {
          return HttpResponse.json([
            { id: 10, name: "Beth's List", owner_id: 3, owner_name: "Tom",
              recipient_name: "Beth", recipient_has_account: false },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("for Beth · kept by Tom")).toBeInTheDocument();
    });
  });
});
