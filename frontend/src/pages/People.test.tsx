import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { People } from "./People";
import toast from "react-hot-toast";

const API = "https://boone-gifts-api.localhost";

function renderPeople() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/people"]}>
        <Routes>
          <Route path="/people" element={<People />} />
          <Route path="/people/families/:id" element={<div>Family Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockEmpty() {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json([])),
    http.get(`${API}/connections`, () => HttpResponse.json([])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
  );
}

describe("People", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders families above individuals, each linking to its detail page", async () => {
    server.use(
      http.get(`${API}/families`, () =>
        HttpResponse.json([
          { id: 1, name: "The Boones", role: "organizer", member_count: 4 },
        ])
      ),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 7, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderPeople();

    const familyLink = await screen.findByRole("link", { name: /The Boones/ });
    expect(familyLink).toHaveAttribute("href", "/people/families/1");
    expect(screen.getByText(/organizer/i)).toBeInTheDocument();
    expect(screen.getByText(/4 members/i)).toBeInTheDocument();

    const personLink = screen.getByRole("link", { name: "Alice" });
    expect(personLink).toHaveAttribute("href", "/people/7");
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();

    // Families first — they are the coarser grouping
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Families", "Individuals"]);
  });

  it("shows singular 'member' for a family with 1 member", async () => {
    server.use(
      http.get(`${API}/families`, () =>
        HttpResponse.json([{ id: 3, name: "Solo Family", role: "organizer", member_count: 1 }])
      ),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderPeople();

    await waitFor(() => {
      expect(screen.getByText(/1 member$/)).toBeInTheDocument();
    });
  });

  it("shows an empty state for each section", async () => {
    mockEmpty();

    renderPeople();

    await waitFor(() => {
      expect(screen.getByText("You aren't in any families yet. Use Add to create one.")).toBeInTheDocument();
    });
    expect(screen.getByText("You aren't connected to anyone yet. Use Add to send a request.")).toBeInTheDocument();
  });

  it("renders pending requests with Accept/Decline buttons", async () => {
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () =>
        HttpResponse.json([
          { id: 5, status: "pending", user: { id: 3, name: "Bob", email: "bob@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ])
      ),
    );

    renderPeople();

    await waitFor(() => {
      expect(screen.getByLabelText("Accept connection request from Bob")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Decline connection request from Bob")).toBeInTheDocument();
  });

  it("hides both Add forms until Add is pressed", async () => {
    mockEmpty();

    renderPeople();

    const addButton = await screen.findByRole("button", { name: "Add" });
    expect(addButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByPlaceholderText("Family name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search by name or email")).not.toBeInTheDocument();

    await userEvent.click(addButton);

    // One "Add" offering both: connect with a person, or create a family
    expect(screen.getByPlaceholderText("Search by name or email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Family name")).toBeInTheDocument();
  });

  it("creates a family and navigates to its detail page", async () => {
    mockEmpty();
    server.use(
      http.post(`${API}/families`, () =>
        HttpResponse.json({ id: 5, name: "New Family", created_by_id: 1, members: [] }, { status: 201 })
      ),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Family name"), "New Family");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByText("Family Detail Page")).toBeInTheDocument();
    });
  });

  it("shows an error toast when creating a family fails", async () => {
    const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
    mockEmpty();
    server.use(
      http.post(`${API}/families`, () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Family name"), "New Family");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to create family.");
    });
  });

  it("sends a connection request and closes the Add panel", async () => {
    mockEmpty();
    server.use(
      http.get(`${API}/users/search`, () =>
        HttpResponse.json([{ id: 4, name: "Carol", email: "carol@test.com" }])
      ),
      http.post(`${API}/connections`, () =>
        HttpResponse.json(
          { id: 10, status: "pending", user: { id: 4, name: "Carol", email: "carol@test.com" }, created_at: "2026-01-01", accepted_at: null },
          { status: 201 }
        )
      ),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Search by name or email"), "carol");

    await userEvent.click(await screen.findByText("Carol"));
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search by name or email")).not.toBeInTheDocument();
    });
  });

  it("sends a connection request to a typed email that matches no search result", async () => {
    let posted: unknown = null;
    mockEmpty();
    server.use(
      http.get(`${API}/users/search`, () => HttpResponse.json([])),
      http.post(`${API}/connections`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { id: 11, status: "pending", user: { id: 9, name: "Dave", email: "dave@test.com" }, created_at: "2026-01-01", accepted_at: null },
          { status: 201 }
        );
      }),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Search by name or email"), "dave@test.com");
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(posted).toEqual({ email: "dave@test.com" });
    });
  });

  it("reports an unknown email rather than sending nothing", async () => {
    mockEmpty();
    server.use(
      http.get(`${API}/users/search`, () => HttpResponse.json([])),
      http.post(`${API}/connections`, () => HttpResponse.json({ detail: "Not found" }, { status: 404 })),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Search by name or email"), "nobody@test.com");
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByText("No user found.")).toBeInTheDocument();
    });
  });

  it("keeps the actionable banner visible while the two lists load", async () => {
    server.use(
      http.get(`${API}/families`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json([]);
      }),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () =>
        HttpResponse.json([
          { id: 5, status: "pending", user: { id: 3, name: "Bob", email: "bob@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ])
      ),
    );

    renderPeople();

    // Present before the families query settles — this banner is the only route
    // to a pending item in simple mode, so a slow list must not hide it
    await waitFor(() => {
      expect(screen.getByLabelText("Accept connection request from Bob")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Families" })).not.toBeInTheDocument();
  });

  it("shows an error for a duplicate connection request", async () => {
    mockEmpty();
    server.use(
      http.get(`${API}/users/search`, () =>
        HttpResponse.json([{ id: 5, name: "Existing", email: "existing@test.com" }])
      ),
      http.post(`${API}/connections`, () => HttpResponse.json({ detail: "Conflict" }, { status: 409 })),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByPlaceholderText("Search by name or email"), "existing");

    await userEvent.click(await screen.findByText("Existing"));
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByText("A connection already exists with this user.")).toBeInTheDocument();
    });
  });

  it("removes a connection", async () => {
    let deleted = false;
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.get(`${API}/connections`, () =>
        HttpResponse.json(
          deleted
            ? []
            : [{ id: 7, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" }]
        )
      ),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.delete(`${API}/connections/7`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPeople();

    await userEvent.click(await screen.findByLabelText("Remove Alice"));

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
  });

  it("reports a failure to load either section without hiding the other", async () => {
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 7, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderPeople();

    await waitFor(() => {
      expect(screen.getByText("Failed to load families.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
  });
});
