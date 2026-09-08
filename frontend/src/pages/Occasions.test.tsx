import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Occasions } from "./Occasions";

const API = "https://boone-gifts-api.localhost";

function renderOccasions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Occasions />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Occasions", () => {
  it("renders occasions list with links", async () => {
    server.use(
      http.get(`${API}/occasions`, () =>
        HttpResponse.json([
          { id: 1, name: "Christmas 2026", description: "Holiday gifts", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { id: 2, name: "Birthdays", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
    );

    renderOccasions();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("Birthdays")).toBeInTheDocument();
  });

  it("creates an occasion and clears form", async () => {
    server.use(
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
      http.post(`${API}/occasions`, () =>
        HttpResponse.json(
          { id: 3, name: "New Occasion", description: "", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { status: 201 }
        )
      ),
    );

    renderOccasions();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Occasion name")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Occasion name"), "New Occasion");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Occasion name")).toHaveValue("");
    });
  });

  it("deletes an occasion", async () => {
    server.use(
      http.get(`${API}/occasions`, () =>
        HttpResponse.json([
          { id: 1, name: "To Delete", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.delete(`${API}/occasions/1`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderOccasions();

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete"));
  });

  it("shows empty state", async () => {
    server.use(
      http.get(`${API}/occasions`, () => HttpResponse.json([])),
    );

    renderOccasions();

    await waitFor(() => {
      expect(screen.getByText("No occasions yet.")).toBeInTheDocument();
    });
  });
});
