import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { FamilyArchive } from "./FamilyArchive";

const API = "https://boone-gifts-api.localhost";

const authToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

function occasion(id: number, name: string) {
  return {
    id,
    family_id: 1,
    name,
    is_archived: true,
    created_by_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function family() {
  server.use(
    http.get(`${API}/families/1`, () =>
      HttpResponse.json({
        id: 1,
        name: "Boone Family",
        created_by_id: 1,
        members: [{ user_id: 1, name: "Tom Boone", role: "member" }],
      })
    ),
  );
}

/** Answers the archived read only, so a page asking for the active occasions
 *  would come back empty and fail loudly. */
function archivedOccasions(occasions: ReturnType<typeof occasion>[]) {
  server.use(
    http.get(`${API}/families/1/occasions`, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("archived") === "true" ? occasions : []
      )
    ),
  );
}

function renderArchive() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/people/families/1/archive"]}>
          <Routes>
            <Route path="/people/families/:id/archive" element={<FamilyArchive />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("FamilyArchive", () => {
  it("lists the family's archived occasions, each linking to its page", async () => {
    family();
    archivedOccasions([occasion(2, "Christmas 2025"), occasion(3, "Gran's 80th")]);

    renderArchive();

    expect(await screen.findByRole("link", { name: "Christmas 2025" })).toHaveAttribute(
      "href",
      "/occasions/2",
    );
    expect(screen.getByRole("link", { name: "Gran's 80th" })).toHaveAttribute("href", "/occasions/3");
  });

  it("goes back to the family page it was reached from", async () => {
    family();
    archivedOccasions([]);

    renderArchive();

    expect(await screen.findByRole("link", { name: "← Boone Family" })).toHaveAttribute(
      "href",
      "/people/families/1",
    );
  });

  it("says so when nothing has been archived", async () => {
    family();
    archivedOccasions([]);

    renderArchive();

    expect(await screen.findByText("No archived occasions.")).toBeInTheDocument();
  });

  // A failed read is not an empty one.
  it("says the read failed rather than calling the archive empty", async () => {
    family();
    server.use(
      http.get(`${API}/families/1/occasions`, () => new HttpResponse(null, { status: 500 })),
    );

    renderArchive();

    expect(await screen.findByText("Couldn't load occasions.")).toBeInTheDocument();
    expect(screen.queryByText("No archived occasions.")).not.toBeInTheDocument();
  });

  // Archiving an occasion takes it out of the default views and does nothing
  // else (project spec §5.4) — the page says so, because a member arriving here
  // needs to know their shopping and the lists shared to it are still live.
  it("says archiving changed nothing but where the occasion shows up", async () => {
    family();
    archivedOccasions([occasion(2, "Christmas 2025")]);

    renderArchive();

    expect(
      await screen.findByText(/takes an occasion out of the default views and does nothing else/)
    ).toBeInTheDocument();
  });
});
