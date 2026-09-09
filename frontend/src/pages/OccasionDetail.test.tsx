import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { OccasionDetail } from "./OccasionDetail";

const API = "https://boone-gifts-api.localhost";

function tokenFor(userId: number) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(
      JSON.stringify({
        sub: String(userId),
        email: `user${userId}@test.com`,
        role: "member",
        exp: 9999999999,
      })
    ),
    "fake-signature",
  ].join(".");
}

// User 1 is the family's organizer; user 2 is a plain member.
const family = {
  id: 7,
  name: "Boone Family",
  created_by_id: 1,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "member" },
  ],
};

const occasion = {
  id: 3,
  family_id: 7,
  name: "Christmas 2026",
  is_archived: false,
  created_by_id: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function list(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    name: "Jane's Wishlist",
    description: null,
    owner_id: 2,
    owner_name: "Jane",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 2,
    claimed_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/** No budget set, and counts that say nothing — these tests are about the tab,
 *  not the budget line, which has its own file. */
const noBudget = {
  amount: null,
  spent: "0.00",
  remaining: null,
  bought_count: 0,
  total_count: 0,
  unpriced_count: 0,
};

function renderOccasion({
  userId = 1,
  occasionResponse = HttpResponse.json(occasion),
  lists = [list()],
  shopping = [],
}: {
  userId?: number;
  occasionResponse?: Response;
  lists?: ReturnType<typeof list>[];
  shopping?: Record<string, unknown>[];
} = {}) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(userId), token_type: "bearer" })
    ),
    http.get(`${API}/occasions/3`, () => occasionResponse.clone()),
    http.get(`${API}/occasions/3/lists`, () => HttpResponse.json(lists)),
    http.get(`${API}/occasions/3/shopping`, () =>
      HttpResponse.json({ budget: noBudget, items: shopping })
    ),
    http.get(`${API}/families/7`, () => HttpResponse.json(family))
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/occasions/3"]}>
          <Routes>
            <Route path="/occasions/:id" element={<OccasionDetail />} />
            <Route path="/people/families/:id" element={<div>Family Page</div>} />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("OccasionDetail", () => {
  it("heads the page with the occasion, its family, and a link back to it", async () => {
    renderOccasion();

    expect(await screen.findByRole("heading", { name: "Christmas 2026" })).toBeInTheDocument();
    const back = await screen.findByRole("link", { name: /Boone Family/ });
    expect(back).toHaveAttribute("href", "/people/families/7");
  });

  it("lists every list shared to the occasion, naming who each came from", async () => {
    renderOccasion({
      lists: [list(), list({ id: 11, name: "My Wishlist", owner_id: 1, owner_name: "Alice" })],
    });

    const jane = await screen.findByRole("link", { name: /Jane's Wishlist/ });
    expect(jane).toHaveAttribute("href", "/lists/10");
    expect(jane).toHaveTextContent("from Jane");
    // The viewer's own list is not attributed back to the viewer.
    expect(await screen.findByRole("link", { name: /My Wishlist/ })).not.toHaveTextContent("from");
  });

  it("says so plainly when nothing is shared to the occasion", async () => {
    renderOccasion({ lists: [] });

    expect(await screen.findByText("No lists are shared to this occasion yet.")).toBeInTheDocument();
  });

  it("ships the tab bar with Lists and My shopping, Lists first", async () => {
    renderOccasion();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Lists", "My shopping"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  // The tab's own behaviour is `components/MyShopping.test.tsx`; what belongs
  // here is that the occasion page scopes it to *this occasion*.
  it("scopes My shopping to the claims filed under this occasion", async () => {
    renderOccasion({
      shopping: [
        {
          claim_id: 100,
          gift_id: 20,
          name: "Running shoes",
          description: null,
          url: null,
          price: "85.00",
          list_id: 10,
          list_name: "Jane's Wishlist",
          purchased_at: "2026-09-01T00:00:00Z",
          amount_paid: "85.00",
        },
      ],
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Running shoes")).toBeInTheDocument();
    expect(screen.getByText("you paid $85.00")).toBeInTheDocument();
  });

  // Archiving takes an occasion out of the default views and does nothing else
  // — the claims filed under it are still the claimer's to finish shopping for.
  it("serves My shopping on an archived occasion too", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json({ ...occasion, is_archived: true }),
      shopping: [
        {
          claim_id: 101,
          gift_id: 21,
          name: "Puzzle",
          description: null,
          url: null,
          price: "18.00",
          list_id: 11,
          list_name: "Gran's List",
          purchased_at: null,
          amount_paid: null,
        },
      ],
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My shopping" }));

    expect(await screen.findByText("Puzzle")).toBeInTheDocument();
  });

  it("renames the occasion from the organizer's menu", async () => {
    const renamed = vi.fn();
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        renamed(await request.json());
        return HttpResponse.json({ ...occasion, name: "Christmas 2027" });
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("Occasion name");
    await userEvent.clear(field);
    await userEvent.type(field, "Christmas 2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(renamed).toHaveBeenCalledWith({ name: "Christmas 2027" }));
  });

  it("archives the occasion once the organizer confirms", async () => {
    const archived = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        archived(await request.json());
        return HttpResponse.json({ ...occasion, is_archived: true });
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archived).toHaveBeenCalledWith({ is_archived: true }));
  });

  it("does not archive when the organizer cancels the confirm", async () => {
    const archived = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderOccasion();
    server.use(
      http.put(`${API}/occasions/3`, async ({ request }) => {
        archived(await request.json());
        return HttpResponse.json(occasion);
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Occasion actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(archived).not.toHaveBeenCalled();
  });

  it("gives a plain member no rename or archive menu", async () => {
    renderOccasion({ userId: 2 });

    expect(await screen.findByRole("heading", { name: "Christmas 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Occasion actions" })).not.toBeInTheDocument();
  });

  it("renders an archived occasion normally, offering Unarchive", async () => {
    renderOccasion({ occasionResponse: HttpResponse.json({ ...occasion, is_archived: true }) });

    expect(await screen.findByRole("heading", { name: "Christmas 2026" })).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    // Its lists are still listed: archiving is not unsharing.
    expect(await screen.findByRole("link", { name: /Jane's Wishlist/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Occasion actions" }));
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeInTheDocument();
  });

  it("does not offer a retry on an occasion the viewer can never reach", async () => {
    renderOccasion({
      occasionResponse: HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
    });

    expect(
      await screen.findByText("This occasion doesn't exist, or it belongs to a family you're not in.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
