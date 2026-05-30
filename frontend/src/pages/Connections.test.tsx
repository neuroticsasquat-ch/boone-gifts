import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Connections } from "./Connections";

const API = "https://boone-gifts-api.localhost";

function renderConnections() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Connections />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Connections", () => {
  it("renders accepted connections with Remove button", async () => {
    server.use(
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 1, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders pending requests with Accept/Decline buttons", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () =>
        HttpResponse.json([
          { id: 5, status: "pending", user: { id: 3, name: "Bob", email: "bob@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ])
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("sends a connection request", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
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

    renderConnections();

    const input = await screen.findByPlaceholderText("Search by name or email");
    await userEvent.type(input, "carol");

    const option = await screen.findByText("Carol");
    await userEvent.click(option);

    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search by name or email")).toHaveValue("");
    });
  });

  it("shows error for duplicate connection request", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.get(`${API}/users/search`, () =>
        HttpResponse.json([{ id: 5, name: "Existing", email: "existing@test.com" }])
      ),
      http.post(`${API}/connections`, () =>
        HttpResponse.json({ detail: "Conflict" }, { status: 409 })
      ),
    );

    renderConnections();

    const input = await screen.findByPlaceholderText("Search by name or email");
    await userEvent.type(input, "existing");

    const option = await screen.findByText("Existing");
    await userEvent.click(option);

    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByText("A connection already exists with this user.")).toBeInTheDocument();
    });
  });

  it("hides pending requests section when empty", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("You don't have any connections yet. Use the form above to send a request.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pending Requests")).not.toBeInTheDocument();
  });
});
