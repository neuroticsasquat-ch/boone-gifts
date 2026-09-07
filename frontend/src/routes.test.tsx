import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./test/mocks/server";
import { AuthProvider } from "./contexts/AuthContext";
import { routes } from "./routes";

const API = "https://boone-gifts-api.localhost";

const token = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

function renderAt(path: string) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
    http.get(`${API}/lists`, () => HttpResponse.json([])),
  );

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );

  return router;
}

describe("routes", () => {
  // Not a shim for the retired Dashboard — this is the bare-domain entry point.
  it("sends the app root to /lists", async () => {
    const router = renderAt("/");
    await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(router.state.location.pathname).toBe("/lists");
  });

  it.each(["/family-lists", "/families", "/families/1", "/occasions", "/occasions/1", "/connections"])(
    "no longer matches the retired route %s",
    (path) => {
      const router = renderAt(path);
      // An unmatched path resolves to a 404 ErrorResponse rather than a page.
      expect(router.state.errors).not.toBeNull();
    }
  );

  it.each(["/lists", "/people", "/people/1", "/people/families/1"])(
    "still matches %s",
    (path) => {
      const router = renderAt(path);
      expect(router.state.errors).toBeNull();
    }
  );
});
