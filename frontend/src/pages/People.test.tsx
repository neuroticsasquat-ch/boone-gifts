import { render, screen, waitFor, within } from "@testing-library/react";
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

const BOONES = { id: 1, name: "The Boones", role: "organizer", member_count: 4 };
const CARTERS = { id: 2, name: "The Carters", role: "member", member_count: 3 };
const ALICE = {
  id: 7, status: "accepted",
  user: { id: 2, name: "Alice", email: "alice@test.com" },
  created_at: "2026-01-01", accepted_at: "2026-01-02",
};
const BOB = {
  id: 8, status: "accepted",
  user: { id: 3, name: "Bob", email: "bob@example.com" },
  created_at: "2026-01-01", accepted_at: "2026-01-02",
};
// Name and email share nothing, so each field can be proven to match on its own
const QUINN = {
  id: 9, status: "accepted",
  user: { id: 4, name: "Quinn", email: "dq@mail.test" },
  created_at: "2026-01-01", accepted_at: "2026-01-02",
};

function mockPeople(data: { families?: unknown[]; connections?: unknown[] }) {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json(data.families ?? [])),
    http.get(`${API}/connections`, () => HttpResponse.json(data.connections ?? [])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
  );
}

function filterBox() {
  return screen.findByRole("textbox", { name: "Filter people" });
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

    // Present before the families query settles — a slow list must not hide it
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

  it("narrows both sections at once from one filter box", async () => {
    mockPeople({ families: [BOONES, CARTERS], connections: [ALICE, BOB] });

    renderPeople();

    await userEvent.type(await filterBox(), "bo");

    expect(screen.getByText("The Boones")).toBeInTheDocument();
    expect(screen.queryByText("The Carters")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bob" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();

    // Families get the filter; they do not get a row action
    expect(
      screen.queryByRole("button", { name: "Remove The Boones" })
    ).not.toBeInTheDocument();
  });

  it("matches a person on name or email, and a family on its name alone", async () => {
    mockPeople({ families: [BOONES, CARTERS], connections: [ALICE, QUINN] });

    renderPeople();

    const filter = await filterBox();
    await userEvent.type(filter, "mail.test");

    expect(screen.getByRole("link", { name: "Quinn" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();

    // Quinn's name appears nowhere in Quinn's email, so this is the name half
    await userEvent.clear(filter);
    await userEvent.type(filter, "quinn");

    expect(screen.getByRole("link", { name: "Quinn" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();

    // `role` and `member_count` are facts about a family, not its identity
    await userEvent.clear(filter);
    await userEvent.type(filter, "organizer");

    expect(screen.getByText('No families match "organizer"')).toBeInTheDocument();
  });

  it("filters case-insensitively and ignores surrounding whitespace", async () => {
    mockPeople({ families: [BOONES], connections: [ALICE] });

    renderPeople();

    await userEvent.type(await filterBox(), "  ALICE  ");

    expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
  });

  it("keeps both headings and hides the empty states when nothing matches", async () => {
    mockPeople({ families: [BOONES], connections: [ALICE] });

    renderPeople();

    await userEvent.type(await filterBox(), "zzz");

    expect(screen.getByRole("heading", { name: "Families" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Individuals" })).toBeInTheDocument();
    expect(screen.getByText('No families match "zzz"')).toBeInTheDocument();
    expect(screen.getByText('No people match "zzz"')).toBeInTheDocument();
    expect(screen.queryByText(/You aren't in any families yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You aren't connected to anyone yet/)).not.toBeInTheDocument();
  });

  it("shows no filter box when there is nobody to filter", async () => {
    mockEmpty();

    renderPeople();

    await screen.findByText("You aren't in any families yet. Use Add to create one.");
    expect(
      screen.getByText("You aren't connected to anyone yet. Use Add to send a request.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Filter people" })).not.toBeInTheDocument();
  });

  it("shows Remove on the row, and cancelling removes nothing", async () => {
    let deleted = false;
    mockPeople({ connections: [ALICE] });
    server.use(
      http.delete(`${API}/connections/7`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPeople();

    await screen.findByRole("link", { name: "Alice" });

    // The accessible name carries the person; the visible text stays "Remove".
    await userEvent.click(screen.getByRole("button", { name: "Remove Alice" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove Alice?")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
    expect(deleted).toBe(false);
  });

  it("removes a connection from the row once confirmed", async () => {
    let deletedId: string | null = null;
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.get(`${API}/connections`, () => HttpResponse.json(deletedId ? [] : [ALICE])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.delete(`${API}/connections/:id`, ({ params }) => {
        deletedId = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Alice" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(deletedId).toBe("7"));
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();
    });
  });

  it("keeps the filter box after the last matching row is removed", async () => {
    let deleted = false;
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.get(`${API}/connections`, () => HttpResponse.json(deleted ? [] : [ALICE])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.delete(`${API}/connections/7`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPeople();

    await userEvent.type(await filterBox(), "al");
    await userEvent.click(screen.getByRole("button", { name: "Remove Alice" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    // Emptying both lists must not strand the viewer on `No people match "al"`
    // with nothing left to clear.
    await waitFor(() => {
      expect(screen.getByText('No people match "al"')).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: "Filter people" })).toHaveValue("al");
  });

  it("returns focus to that row's Remove when the dialog closes", async () => {
    mockPeople({ connections: [ALICE] });

    renderPeople();

    const remove = await screen.findByRole("button", { name: "Remove Alice" });
    await userEvent.click(remove);

    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");

    // A visible button is already the focused element when clicked, so the
    // dialog captures it as the thing to restore to with no help from the row
    // — the focus dance `HeaderMenu` needed is gone with it (ADR 0009).
    await waitFor(() => expect(remove).toHaveFocus());
  });

  it("leaves the dialog open and toasts when a removal fails", async () => {
    const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
    mockPeople({ connections: [ALICE] });
    server.use(
      http.delete(`${API}/connections/7`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      ),
    );

    renderPeople();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Alice" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to remove connection.");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
