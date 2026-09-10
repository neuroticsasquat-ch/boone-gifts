import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { NumericId } from "../../components/NumericId";
import { FamilyDetail } from "../FamilyDetail";
import type { FamilyDetail as FamilyRecord } from "../../types";

/**
 * Shared fixtures for the four suites over the family page: the page's own,
 * and one per zone component beside it (NEU-1300).
 *
 * Every one of those suites renders `FamilyDetail` and asserts `within` a zone
 * — MSW mocks at the network boundary, not the module boundary, so a zone's
 * cases mount the whole page. That made four near-identical copies of the JWTs
 * and the render tree likely, and a stale copy of an auth fixture is exactly
 * the drift that makes one suite quietly stop testing what it claims. This is
 * one fixture for one page's suites, not a repo-wide test-utils module: the
 * repo's convention is still per-suite duplication.
 */

const API = "https://boone-gifts-api.localhost";

/** JWT for user id=1, the organizer of `sampleFamily`. */
export const organizerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "organizer@test.com", name: "Alice", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

/** JWT for user id=2, a plain member of `sampleFamily`. */
export const memberToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "member@test.com", name: "Bob", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

export const sampleFamily: FamilyRecord = {
  id: 1,
  name: "Boone Family",
  created_by_id: 1,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "member" },
  ],
};

/**
 * Render the family page as the holder of `token`.
 *
 * `respondWith` is what `GET /families/:id` answers — a second organizer, or a
 * 404 for the not-found arm. It is a parameter rather than a `server.use()` in
 * the calling test because this handler goes up at render time and would win
 * over a runtime override the test registered before it.
 */
export function renderFamilyDetail(
  token: string,
  id = "1",
  respondWith: () => Response = () => HttpResponse.json(sampleFamily),
) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
    http.get(`${API}/families/${id}`, respondWith),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/people/families/${id}`]}>
          <Routes>
            <Route
              path="/people/families/:id"
              element={
                <NumericId back="/people">
                  <FamilyDetail />
                </NumericId>
              }
            />
            <Route path="/people" element={<div>People Page</div>} />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
