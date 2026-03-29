import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { CollectionDetail } from "./CollectionDetail";

const API = "https://boone-gifts-api.localhost";

const sampleCollection = {
  id: 1,
  name: "Christmas 2026",
  description: "Holiday gifts",
  owner_id: 1,
  lists: [
    { id: 10, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderCollectionDetail(id = "1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/collections/${id}`]}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionDetail />} />
          <Route path="/collections" element={<div>Collections List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CollectionDetail", () => {
  it("renders collection header and lists", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
  });

  it("edits collection name and description", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/collections/1`, () =>
        HttpResponse.json({ ...sampleCollection, name: "Updated", description: "New desc" })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Edit"));

    const nameInput = screen.getByDisplayValue("Christmas 2026");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated");
    await userEvent.click(screen.getByText("Save"));
  });

  it("removes a list from collection", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.delete(`${API}/collections/1/items/10`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Remove"));
  });

  it("adds a list to collection", async () => {
    const emptyCollection = { ...sampleCollection, lists: [] };

    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(emptyCollection)),
      http.get(`${API}/lists`, () =>
        HttpResponse.json([
          { id: 20, name: "Birthday List", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.post(`${API}/collections/1/items`, () =>
        new HttpResponse(null, { status: 201 })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "20");
    await userEvent.click(screen.getByText("Add"));
  });

  it("shows empty state for lists", async () => {
    const emptyCollection = { ...sampleCollection, lists: [] };

    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(emptyCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("No lists in this collection.")).toBeInTheDocument();
    });
  });
});
