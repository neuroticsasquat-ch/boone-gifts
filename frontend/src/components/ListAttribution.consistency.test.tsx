import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NumericId } from "./NumericId";
import { Lists } from "../pages/Lists";
import { FolderDetail } from "../pages/FolderDetail";

/**
 * One list, two pages, one line.
 *
 * `/lists` and `/folders/:id` are the two places a shared row is drawn, and
 * NEU-1286 was opened because they disagreed: the folder page read the owner's
 * name where `/lists` read the family's. They agree by construction now — both
 * render `<ListAttributionLine>` over the same `shared_via` routes — and this
 * test is what keeps them that way. It fails if either page stops calling the
 * component, or renders a line of its own beside it (project spec §13).
 *
 * The fixture is deliberately the hard case: a list that reached the viewer
 * **both** ways. Every page-local shortcut that ever produced a wrong label —
 * reading `owner_name`, or `routes[0]` — gives a different answer here than
 * "direct wins" does.
 */

const API = "https://boone-gifts-api.localhost";

/** Reached the viewer directly *and* through the family's occasion. Direct
 *  wins, so both pages must read "from Carol Boone". */
const BOTH_WAYS = {
  id: 1,
  name: "Carol's Wishlist",
  description: null,
  owner_id: 2,
  owner_name: "Gran Boone",
  recipient_name: null,
  is_archived: false,
  gift_count: 0,
  claimed_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  // The occasion route leads deliberately. Route order is the backend's and is
  // not a ranking, so a page that reached for `routes[0]` would read
  // "Boone Family" here and fail — as would one that reached for `owner_name`
  // and read "from Gran Boone". Only direct-wins gives "from Carol Boone".
  shared_via: [
    {
      kind: "occasion",
      occasion: { id: 3, name: "Christmas 2026" },
      family: { id: 1, name: "Boone Family" },
    },
    { kind: "direct", person: { id: 4, name: "Carol Boone" } },
  ],
};

const FOLDER = {
  id: 1,
  name: "Christmas 2026",
  description: null,
  owner_id: 1,
  lists: [BOTH_WAYS],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function token() {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
    "fake-signature",
  ].join(".");
}

/** The one list, served to whichever page asks: as the `shared` scope for
 *  `/lists`, and as this folder's contents for `/folders/1`. */
function serveTheList() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token(), token_type: "bearer" }),
    ),
    http.get(`${API}/lists`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get("filter");
      return HttpResponse.json(filter === "shared" ? [BOTH_WAYS] : []);
    }),
    http.get(`${API}/folders/1`, () => HttpResponse.json(FOLDER)),
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * The attribution line drawn beneath the list's name, wherever it is drawn.
 *
 * Found by walking up from the name and taking the line that follows it, so it
 * asks nothing of either page's markup beyond the one thing both pages promise:
 * the name, then what the list's source is. A page that stopped attributing the
 * row would return its next line instead — the claimed count on `/lists`, and
 * nothing at all on the folder page — and fail the comparison rather than
 * quietly passing it.
 */
async function attributionLineOn(name: string) {
  const heading = await screen.findByText(name);
  const row = heading.parentElement as HTMLElement;
  const lines = [...row.querySelectorAll("p")]
    .map((line) => line.textContent?.trim())
    .filter((text): text is string => Boolean(text) && text !== name);
  return lines[0] ?? null;
}

describe("ListAttribution — the same list on /lists and on a folder page", () => {
  it("renders one identical line from both call sites", async () => {
    serveTheList();

    const onLists = render(
      <QueryClientProvider client={client()}>
        <AuthProvider>
          <MemoryRouter>
            <Lists />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    const onListsPage = await attributionLineOn("Carol's Wishlist");
    onLists.unmount();

    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/folders/1"]}>
          <Routes>
            <Route
              path="/folders/:id"
              element={
                <NumericId back="/lists">
                  <FolderDetail />
                </NumericId>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const onFolderPage = await attributionLineOn("Carol's Wishlist");

    // The same line, from both call sites — the whole claim NEU-1286 makes.
    expect(onFolderPage).toBe(onListsPage);
    // And the right line: the direct share wins over the occasion one, so it
    // reads neither "from Gran Boone" (the owner, which is what the folder page
    // used to say) nor the bare "Boone Family".
    expect(onListsPage).toBe("from Carol Boone");
  });
});
