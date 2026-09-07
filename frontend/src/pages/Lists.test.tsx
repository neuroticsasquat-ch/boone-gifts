import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Layout } from "../components/Layout";
import { Lists } from "./Lists";

const API = "https://boone-gifts-api.localhost";

const testRequest = {
  id: 7,
  status: "pending",
  user: { id: 3, name: "Dave Boone", email: "dave@test.com" },
  created_at: "2026-01-01T00:00:00Z",
  accepted_at: null,
};

const simpleModeToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
  "fake-signature",
].join(".");

function noLists() {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([])));
}

/** Lists inside the real nav shell, signed in as a simple-mode user. */
function renderInSimpleMode() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: simpleModeToken, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/lists"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/lists" element={<Lists />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderLists() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Lists />
      </MemoryRouter>
    </QueryClientProvider>
  )};
}

describe("Lists", () => {
  it("renders the actionable banner above the lists", async () => {
    noLists();
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderLists();

    const banner = await screen.findByRole("region", { name: "Waiting on you" });
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/wants to connect/)).toBeInTheDocument();

    // The banner precedes the lists heading in document order.
    const heading = screen.getByRole("heading", { name: /My Lists/ });
    expect(banner.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // Simple mode is purely subtractive, but the banner is the one surface it must
  // NOT subtract: with People hidden, /lists is the only route to these items.
  it("still renders the banner in simple mode, where People is hidden", async () => {
    noLists();
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderInSimpleMode();

    // Wait for the simple-mode session to be established.
    await screen.findByLabelText("Account menu");
    expect(screen.queryByRole("link", { name: /^People$/ })).not.toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Waiting on you" })).toBeInTheDocument();
    expect(screen.getByLabelText("Accept connection request from Dave Boone")).toBeInTheDocument();
  });

  it("renders no banner region when nothing is pending", async () => {
    noLists();

    const { queryClient } = renderLists();

    await waitFor(() => {
      expect(queryClient.getQueryState(["connectionRequests"])?.status).toBe("success");
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
    });
    expect(screen.queryByRole("region", { name: "Waiting on you" })).not.toBeInTheDocument();
  });
});
