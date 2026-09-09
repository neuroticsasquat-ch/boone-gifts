import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { FolderDetail } from "./FolderDetail";

const API = "https://boone-gifts-api.localhost";

const sampleFolder = {
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

function renderFolderDetail(id = "1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/folders/${id}`]}>
        <Routes>
          <Route path="/folders/:id" element={<FolderDetail />} />
          <Route path="/folders" element={<div>Folders List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FolderDetail", () => {
  it("renders folder header and lists", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
  });

  it("edits folder name and description", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/folders/1`, () =>
        HttpResponse.json({ ...sampleFolder, name: "Updated", description: "New desc" })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Edit"));

    const nameInput = screen.getByDisplayValue("Christmas 2026");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated");
    await userEvent.click(screen.getByText("Save"));
  });

  it("removes a list from folder", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.delete(`${API}/folders/1/items/10`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Remove"));
  });

  it("adds a list to folder", async () => {
    const emptyFolder = { ...sampleFolder, lists: [] };

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(emptyFolder)),
      http.get(`${API}/lists`, () =>
        HttpResponse.json([
          { id: 20, name: "Birthday List", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.post(`${API}/folders/1/items`, () =>
        new HttpResponse(null, { status: 201 })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "20");
    await userEvent.click(screen.getByText("Add"));
  });

  it("shows empty state for lists", async () => {
    const emptyFolder = { ...sampleFolder, lists: [] };

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(emptyFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("No lists in this folder.")).toBeInTheDocument();
    });
  });

  it("switches to shopping list view and shows empty state", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping-list`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("My Shopping List"));

    await waitFor(() => {
      expect(screen.getByText("No claimed gifts in this folder.")).toBeInTheDocument();
    });
  });

  it("shows shopping list items grouped by list and summary count", async () => {
    const shoppingItems = [
      {
        id: 1,
        name: "Lego Set",
        description: "Great fun",
        url: "https://lego.com",
        price: "49.99",
        list_id: 10,
        list_name: "My Wishlist",
        purchased_at: null,
      },
      {
        id: 2,
        name: "Book",
        description: null,
        url: null,
        price: "14.99",
        list_id: 10,
        list_name: "My Wishlist",
        purchased_at: "2026-01-10T00:00:00",
      },
    ];

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping-list`, () => HttpResponse.json(shoppingItems)),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("My Shopping List"));

    await waitFor(() => {
      expect(screen.getByText("1 of 2 purchased")).toBeInTheDocument();
    });
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Lego Set")).toBeInTheDocument();
    expect(screen.getByText("Book")).toBeInTheDocument();
  });

  it("pads a shopping-list price that arrives with fewer than two decimals", async () => {
    // The shopping list is the second site the shared formatter converted
    // (NEU-1272), and the fixtures above all carry two decimals already, so
    // they pass with or without it. This one does not.
    const shoppingItems = [
      {
        id: 1,
        name: "Lego Set",
        description: null,
        url: null,
        price: "19.5",
        list_id: 10,
        list_name: "My Wishlist",
        purchased_at: null,
      },
    ];

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping-list`, () => HttpResponse.json(shoppingItems)),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("My Shopping List"));

    expect(await screen.findByText("$19.50")).toBeInTheDocument();
  });

  it("toggles purchase status on checkbox click", async () => {
    const shoppingItems = [
      {
        id: 1,
        name: "Lego Set",
        description: null,
        url: null,
        price: null,
        list_id: 10,
        list_name: "My Wishlist",
        purchased_at: null,
      },
    ];

    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping-list`, () => HttpResponse.json(shoppingItems)),
      http.post(`${API}/lists/10/gifts/1/purchase`, () =>
        HttpResponse.json({ ...shoppingItems[0], purchased_at: "2026-01-10T00:00:00" })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("My Shopping List"));

    await waitFor(() => {
      expect(screen.getByLabelText(/Mark "Lego Set" as purchased/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(/Mark "Lego Set" as purchased/));

    await waitFor(() => {
      expect(screen.queryByText("Failed to mark as purchased.")).not.toBeInTheDocument();
    });
  });

  it("attributes folder lists the same way every other list view does", async () => {
    // This changes the wording from "by X" to "from X"/"for X", accepted for
    // consistency with the rest of the app.
    server.use(
      http.get(`${API}/folders/1`, () =>
        HttpResponse.json({
          ...sampleFolder,
          lists: [
            { id: 30, name: "Beth's List", description: null, owner_id: 3, owner_name: "Tom",
              recipient_name: "Beth",
              created_at: "2026-01-01", updated_at: "2026-01-01" },
            { id: 31, name: "Plain List", description: null, owner_id: 4, owner_name: "Alice",
              recipient_name: null,
              created_at: "2026-01-01", updated_at: "2026-01-01" },
          ],
        })
      ),
    );

    renderFolderDetail();

    await waitFor(() => {
      expect(screen.getByText("for Beth · kept by Tom")).toBeInTheDocument();
    });
    expect(screen.getByText("from Alice")).toBeInTheDocument();
  });
});
