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
      http.post(`${API}/connections`, () =>
        HttpResponse.json(
          { id: 10, status: "pending", user: { id: 4, name: "Carol", email: "carol@test.com" }, created_at: "2026-01-01", accepted_at: null },
          { status: 201 }
        )
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "carol@test.com");
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toHaveValue("");
    });
  });

  it("shows error for duplicate connection request", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.post(`${API}/connections`, () =>
        HttpResponse.json({ detail: "Conflict" }, { status: 409 })
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "existing@test.com");
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
      expect(screen.getByText("No connections yet.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pending Requests")).not.toBeInTheDocument();
  });
});
