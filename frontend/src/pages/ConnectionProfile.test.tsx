import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../test/arrived-from";
import { NumericId } from "../components/NumericId";
import { ConnectionProfile } from "./ConnectionProfile";

const API = "https://boone-gifts-api.localhost";

/** Supplied directly rather than through `AuthProvider`, so the session costs no
 *  `/auth/refresh`. The depth counter reads it to reset on a change of viewer. */
const AUTHENTICATED: AuthContextType = {
  user: { id: 1, email: "user@test.com", name: "Tom Boone", role: "member" },
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  changePassword: async () => {},
  updateProfile: async () => {},
};

const alice = {
  id: 5,
  status: "accepted",
  user: { id: 2, name: "Alice", email: "alice@test.com" },
  created_at: "2026-01-01",
  accepted_at: "2026-01-02",
};

/** `arriveFrom` starts the session on another page and pushes into the profile
 *  from it, so the back control is at depth > 0. A deeper `initialEntries` would
 *  not do: that is still an entry location, and still depth 0 (NEU-1302). */
function renderProfile({
  connections = [alice],
  arriveFrom,
}: { connections?: (typeof alice)[]; arriveFrom?: string } = {}) {
  server.use(
    http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    http.get(`${API}/connections/5/lists`, () => HttpResponse.json([])),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={AUTHENTICATED}>
        <MemoryRouter initialEntries={[arriveFrom ?? "/people/5"]}>
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/people/:id"
                element={
                  <NumericId back="/people">
                    <ConnectionProfile />
                  </NumericId>
                }
              />
              <Route path="*" element={<ArrivedFrom to="/people/5" />} />
            </Routes>
          </NavigationDepthProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("ConnectionProfile back control", () => {
  // The last site of the retired "connections" navigation label: it named a
  // section of /people rather than the page, which is the fault CONTEXT.md
  // already calls out for "connect"/"collect".
  it("names People when it was deep-linked into", async () => {
    renderProfile();

    expect(await screen.findByRole("link", { name: "← Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  // A reachability failure keeps its own arm (CONTEXT.md rule 7), and that arm
  // still needs a way back — the same one the page itself has.
  it("the not-found arm names People too", async () => {
    renderProfile({ connections: [] });

    expect(await screen.findByText("Connection not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  // Arrived from a list row rather than from /people: Back is the list.
  it("returns to the page it was opened from, and says only Back", async () => {
    renderProfile({ arriveFrom: "/lists/1" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    await userEvent.click(await screen.findByRole("button", { name: "← Back" }));

    expect(screen.getByRole("button", { name: "arrive" })).toBeInTheDocument();
  });
});
