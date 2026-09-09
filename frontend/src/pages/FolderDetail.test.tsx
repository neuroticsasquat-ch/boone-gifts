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
          <Route path="/lists" element={<div>Lists</div>} />
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

  it("carries the same two tabs the occasion page does, Lists first", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Lists", "My shopping"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  // The tab's own behaviour is `components/MyShopping.test.tsx`; what belongs
  // here is that the folder page scopes it to *this folder*, which is the whole
  // difference between the two pages that mount it.
  it("scopes My shopping to this folder's own claims", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.get(`${API}/folders/1/shopping`, () =>
        HttpResponse.json({
          budget: {
            amount: null,
            spent: "0.00",
            remaining: null,
            bought_count: 0,
            total_count: 1,
            unpriced_count: 0,
          },
          items: [
            {
              claim_id: 100,
              gift_id: 1,
              name: "Lego Set",
              description: null,
              url: null,
              price: "49.99",
              list_id: 10,
              list_name: "My Wishlist",
              purchased_at: null,
              amount_paid: null,
            },
          ],
        })
      ),
    );

    renderFolderDetail();

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Lego Set")).toBeInTheDocument();
    expect(screen.getByText("listed at $49.99")).toBeInTheDocument();
    // The budget line is on this page too, not the occasion page alone
    // (project spec §9.3); its own behaviour is `BudgetLine.test.tsx`.
    expect(screen.getByText("$0.00 spent · no budget set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
  });

  // Folders have no index page, so back cannot mean one.
  it("heads back to the lists rather than a folder index", async () => {
    server.use(
      http.get(`${API}/folders/1`, () => HttpResponse.json(sampleFolder)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderFolderDetail();

    expect(await screen.findByRole("link", { name: /Lists/ })).toHaveAttribute("href", "/lists");
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
