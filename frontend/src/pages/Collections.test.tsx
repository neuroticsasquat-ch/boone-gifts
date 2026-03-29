import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Collections } from "./Collections";

const API = "https://boone-gifts-api.localhost";

function renderCollections() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Collections />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Collections", () => {
  it("renders collections list with links", async () => {
    server.use(
      http.get(`${API}/collections`, () =>
        HttpResponse.json([
          { id: 1, name: "Christmas 2026", description: "Holiday gifts", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { id: 2, name: "Birthdays", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("Birthdays")).toBeInTheDocument();
  });

  it("creates a collection and clears form", async () => {
    server.use(
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.post(`${API}/collections`, () =>
        HttpResponse.json(
          { id: 3, name: "New Collection", description: "", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { status: 201 }
        )
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Collection name")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Collection name"), "New Collection");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Collection name")).toHaveValue("");
    });
  });

  it("deletes a collection", async () => {
    server.use(
      http.get(`${API}/collections`, () =>
        HttpResponse.json([
          { id: 1, name: "To Delete", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.delete(`${API}/collections/1`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete"));
  });

  it("shows empty state", async () => {
    server.use(
      http.get(`${API}/collections`, () => HttpResponse.json([])),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("No collections yet.")).toBeInTheDocument();
    });
  });
});
