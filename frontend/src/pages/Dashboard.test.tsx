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
  it("renders summary cards with counts", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get("filter");
        if (filter === "owned") return HttpResponse.json([{ id: 1, name: "My List", owner_id: 1, owner_name: "Me" }]);
        if (filter === "shared") return HttpResponse.json([]);
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => {
        return HttpResponse.json([]);
      }),
      http.get("https://boone-gifts-api.localhost/collections", () => {
        return HttpResponse.json([{ id: 1, name: "Holidays" }, { id: 2, name: "Birthdays" }]);
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument(); // My Lists
    });
    expect(screen.getByText("2")).toBeInTheDocument(); // Collections
    expect(screen.getByText("0")).toBeInTheDocument(); // Connection Requests
  });

  it("renders connection requests with accept/decline", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", () => HttpResponse.json([])),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => {
        return HttpResponse.json([
          { id: 5, status: "pending", user: { id: 2, name: "Jane Doe", email: "jane@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ]);
      }),
      http.get("https://boone-gifts-api.localhost/collections", () => HttpResponse.json([])),
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
      http.get("https://boone-gifts-api.localhost/collections", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Birthday Wishes")).toBeInTheDocument();
    });
    expect(screen.getByText("from Alice")).toBeInTheDocument();
  });

  it("hides sections when empty", async () => {
    server.use(
      http.get("https://boone-gifts-api.localhost/lists", () => HttpResponse.json([])),
      http.get("https://boone-gifts-api.localhost/connections/requests", () => HttpResponse.json([])),
      http.get("https://boone-gifts-api.localhost/collections", () => HttpResponse.json([])),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText("0")).toHaveLength(3);
    });
    expect(screen.queryByText("Pending Connection Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared with Me")).not.toBeInTheDocument();
  });
});
