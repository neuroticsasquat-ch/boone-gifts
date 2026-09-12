import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Folders } from "./Folders";

const API = "https://boone-gifts-api.localhost";

function renderFolders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Folders />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Folders", () => {
  it("renders folders list with links", async () => {
    server.use(
      http.get(`${API}/folders`, () =>
        HttpResponse.json([
          { id: 1, name: "Christmas 2026", description: "Holiday gifts", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { id: 2, name: "Birthdays", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
    );

    renderFolders();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("Birthdays")).toBeInTheDocument();
  });

  it("creates a folder and clears form", async () => {
    server.use(
      http.get(`${API}/folders`, () => HttpResponse.json([])),
      http.post(`${API}/folders`, () =>
        HttpResponse.json(
          { id: 3, name: "New Folder", description: "", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { status: 201 }
        )
      ),
    );

    renderFolders();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Folder name")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Folder name"), "New Folder");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Folder name")).toHaveValue("");
    });
  });

  it("deletes a folder", async () => {
    server.use(
      http.get(`${API}/folders`, () =>
        HttpResponse.json([
          { id: 1, name: "To Delete", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.delete(`${API}/folders/1`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderFolders();

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    // Queried by its accessible name, which names the folder: a row's action
    // says more than its visible text (`CONTEXT.md` rule 12).
    await userEvent.click(screen.getByRole("button", { name: "Delete To Delete" }));
  });

  it("shows empty state", async () => {
    server.use(
      http.get(`${API}/folders`, () => HttpResponse.json([])),
    );

    renderFolders();

    await waitFor(() => {
      expect(screen.getByText("No folders yet.")).toBeInTheDocument();
    });
  });
});
