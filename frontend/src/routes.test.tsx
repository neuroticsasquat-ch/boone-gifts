import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./test/mocks/server";
import { AuthProvider, AuthContext, type AuthContextType } from "./contexts/AuthContext";
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

  // `/folders` stays unrouted: `Folders.tsx` was retired with the nav project
  // and the folder filter on /lists is where a user meets the concept now.
  it.each(["/family-lists", "/families", "/families/1", "/folders", "/connections"])(
    "no longer matches the retired route %s",
    (path) => {
      const router = renderAt(path);
      // An unmatched path resolves to a 404 ErrorResponse rather than a page.
      expect(router.state.errors).not.toBeNull();
    }
  );

  // `/occasions/:id` is back, and means a *family's* occasion now — the folder
  // pages took the old meaning of the word with them (frontend ADR 0002).
  // `/folders/:id` is routed at last (NEU-1274), the index page still is not.
  it.each([
    "/lists",
    "/people",
    "/people/1",
    "/people/families/1",
    "/occasions/1",
    "/folders/1",
    "/lists/archive",
    "/people/families/1/archive",
  ])("still matches %s", (path) => {
    const router = renderAt(path);
    expect(router.state.errors).toBeNull();
  });

  // The archive is a static segment sitting beside `lists/:id`, so it has to
  // outrank it — otherwise the archive link opens a list detail page for a list
  // called "archive" (NEU-1278).
  it("routes /lists/archive to the archive, not to a list called archive", async () => {
    server.use(http.get(`${API}/folders`, () => HttpResponse.json([])));

    renderAt("/lists/archive");

    expect(await screen.findByRole("heading", { name: "Archive" })).toBeInTheDocument();
  });

  // The depth counter through the real tree, not a harness: the provider is a
  // pathless root route, so a page reached by a push sees depth > 0 and its back
  // control becomes a plain Back that returns to the pusher (NEU-1302).
  it("counts a push through the tree, so Back returns to the pusher", async () => {
    server.use(
      http.get(`${API}/lists/1`, () =>
        HttpResponse.json({
          id: 1,
          name: "My Wishlist",
          description: null,
          owner_id: 1,
          owner_name: "Tom Boone",
          is_archived: false,
          gifts: [],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        })
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/account`, () => HttpResponse.json({ is_shared: false, people: [] })),
    );

    const router = renderAt("/lists");
    await screen.findByRole("navigation", { name: "Primary navigation" });

    // Through the router rather than a list row, so the case is about the
    // counter and not about what `/lists` happens to render.
    await act(() => router.navigate("/lists/1"));
    expect(await screen.findByRole("heading", { name: "My Wishlist" })).toBeInTheDocument();

    // Not `← Back to Lists`: the app knows where the viewer came from, so the
    // control stops naming a destination it is not going to.
    await userEvent.click(screen.getByRole("button", { name: "\u2190 Back" }));

    expect(router.state.location.pathname).toBe("/lists");
  });
});

/**
 * The standing guard that every numeric `:id` route is wrapped in `<NumericId>`
 * (`docs/adr/0006-route-ids-are-validated-at-the-route.md`). It walks the
 * `routes` array rather than naming the six, so **adding a seventh `:id` route
 * without a wrapper fails here** — that is its whole job, in the spirit of the
 * standing retirement guard under `src/test/`, which greps the tree for the
 * same reason. (Named only by description: that guard fails on any file
 * carrying the phrase it retired, this one included.)
 */
function join(prefix: string, path: string): string {
  if (path.startsWith("/")) return path;
  return `${prefix}/${path}`.replace(/\/{2,}/g, "/");
}

/** Every routable path in the tree, as the full address a browser would carry. */
function fullPaths(children: RouteObject[], prefix = ""): string[] {
  return children.flatMap((route) => {
    if (route.path === undefined) {
      return route.children ? fullPaths(route.children, prefix) : [];
    }
    const here = join(prefix, route.path);
    return [here, ...(route.children ? fullPaths(route.children, here) : [])];
  });
}

const ID_PATHS = fullPaths(routes).filter((path) => path.includes(":id"));

/**
 * The nav shell fetches its three badge counts on every render and sits above
 * every one of these routes, so those are the only requests a wrapped route may
 * produce. Anything else means a page mounted and asked the backend about an
 * address that was never valid.
 */
const NAV_REQUESTS = ["/connections/requests", "/lists/unseen-count", "/families/invites"];

/** Supplied directly rather than through `AuthProvider`, so the session costs
 *  no `/auth/refresh` and the request count below stays about the page. */
const AUTHENTICATED: AuthContextType = {
  user: { id: 1, email: "user@test.com", name: "Tom Boone", role: "member" },
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  changePassword: async () => {},
  updateProfile: async () => {},
};

let requested: string[] = [];

function record({ request }: { request: Request }) {
  requested.push(new URL(request.url).pathname);
}

describe("every numeric :id route validates its id", () => {
  beforeEach(() => {
    requested = [];
    server.events.on("request:start", record);
  });

  afterEach(() => {
    server.events.removeListener("request:start", record);
  });

  function renderBadAddress(path: string) {
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={AUTHENTICATED}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  it("finds the :id routes to check", () => {
    expect(ID_PATHS.length).toBeGreaterThan(0);
  });

  it.each(ID_PATHS)("%s rejects a non-numeric id", async (path) => {
    renderBadAddress(path.replaceAll(":id", "abc"));

    expect(await screen.findByText("This page's address isn't valid.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it.each(ID_PATHS)("%s asks the backend nothing about a non-numeric id", async (path) => {
    renderBadAddress(path.replaceAll(":id", "abc"));
    await screen.findByText("This page's address isn't valid.");

    expect(requested.filter((pathname) => !NAV_REQUESTS.includes(pathname))).toEqual([]);
  });

  // The two that mattered beyond tidiness: `Number.isFinite(Number(id))`
  // accepted both, so the URL bar said one thing and the page loaded another.
  // Asserted on the real route, not just on the rule, because loading family 16
  // from `/people/families/0x10` is what the viewer would actually have seen.
  it.each([
    ["/people/families/0x10", "family 16"],
    ["/people/families/1e3", "family 1000"],
  ])("%s says the address is wrong rather than loading %s", async (address) => {
    renderBadAddress(address);

    expect(await screen.findByText("This page's address isn't valid.")).toBeInTheDocument();
    expect(requested.filter((pathname) => !NAV_REQUESTS.includes(pathname))).toEqual([]);
  });
});
