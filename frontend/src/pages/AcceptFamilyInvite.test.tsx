import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AcceptFamilyInvite } from "./AcceptFamilyInvite";

const API = "https://boone-gifts-api.localhost";

function renderPageWithToken(token: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/family-invites/${token}`]}>
        <Routes>
          <Route path="/family-invites/:token" element={<AcceptFamilyInvite />} />
          <Route path="/lists" element={<div>Lists page</div>} />
          <Route path="/people" element={<div>People page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AcceptFamilyInvite", () => {
  it("accepts the invite by token and redirects to Lists", async () => {
    let receivedToken: string | null = null;
    server.use(
      http.post(`${API}/families/invites/:token/accept`, ({ params }) => {
        receivedToken = params.token as string;
        return HttpResponse.json({ family: { id: 1, name: "Boone" }, role: "member" });
      })
    );

    renderPageWithToken("tok-123");

    await waitFor(() => {
      expect(screen.getByText("Lists page")).toBeInTheDocument();
    });
    expect(receivedToken).toBe("tok-123");
  });

  it("shows a 'no longer valid' error with a People link when the invite is 409", async () => {
    server.use(
      http.post(`${API}/families/invites/:token/accept`, () =>
        HttpResponse.json({ detail: "conflict" }, { status: 409 })
      )
    );

    renderPageWithToken("stale-token");

    await waitFor(() => {
      expect(screen.getByText(/no longer valid/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /go to your families/i })).toHaveAttribute(
      "href",
      "/people"
    );
  });

  it("shows an invalid-link error when the invite is 404", async () => {
    server.use(
      http.post(`${API}/families/invites/:token/accept`, () =>
        HttpResponse.json({ detail: "not found" }, { status: 404 })
      )
    );

    renderPageWithToken("bogus-token");

    await waitFor(() => {
      expect(screen.getByText(/invalid or has been revoked/i)).toBeInTheDocument();
    });
  });
});
