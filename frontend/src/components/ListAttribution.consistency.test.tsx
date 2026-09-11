import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NumericId } from "./NumericId";
import { Lists } from "../pages/Lists";
import { FolderDetail } from "../pages/FolderDetail";
import { ConnectionProfile } from "../pages/ConnectionProfile";

/**
 * One list, three pages, one line.
 *
 * `/lists` and `/folders/:id` were the two places a shared row is drawn, and
 * NEU-1286 was opened because they disagreed: the folder page read the owner's
 * name where `/lists` read the family's. They agree by construction now — all
 * render `<ListAttributionLine>` over the same `shared_via` routes — and this
 * test is what keeps them that way. It fails if any page stops calling the
 * component, or renders a line of its own beside it (project spec §13).
 *
 * `/people/:id` is the third since NEU-1316: it stopped asking a narrower
 * question of its own and became a cut of the same shared scope `/lists`
 * paints, drawn through the same row component — so it is now a page this test
 * has to hold to the line.
 *
 * The folder page's **Add a List** picker is the fourth since NEU-1318. It was a
 * `<select>` rendering a bare name, and the alternative to making it rows was to
 * compose its option text from `attributionFor()` — a second place turning a
 * share route into words, which is the drift this test exists to catch. It is a
 * call site now, so it is held to the same line.
 *
 * The fixture is deliberately the hard case: a list that reached the viewer
 * **both** ways. Every page-local shortcut that ever produced a wrong label —
 * reading `owner_name`, or `routes[0]` — gives a different answer here than
 * "direct wins" does.
 */

const API = "https://boone-gifts-api.localhost";

/** Reached the viewer directly *and* through the family's occasion. Direct
 *  wins, so every page must read "from Carol Boone". */
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

/** The picker excludes every list already in the folder, and `BOTH_WAYS` is
 *  inside it — so covering the picker needs a second list the folder does not
 *  hold. Both-ways for the same reason the first one is: it is the case where
 *  every page-local shortcut gives a different answer from "direct wins". */
const BOTH_WAYS_OFFERED = {
  ...BOTH_WAYS,
  id: 2,
  name: "Gran's Other List",
};

/** Connection 5 is the list's owner. The ids differ on purpose — `/people/5`
 *  is the connection, whose `user.id` is 2 — because the profile keys its rows
 *  on ownership and has to make that hop to find this list at all. */
const GRAN = {
  id: 5,
  status: "accepted",
  user: { id: 2, name: "Gran Boone", email: "gran@test.com" },
  created_at: "2026-01-01",
  accepted_at: "2026-01-02",
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
 *  `/lists` and for `/people/5`, and as this folder's contents for
 *  `/folders/1`. */
function serveTheList() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token(), token_type: "bearer" }),
    ),
    http.get(`${API}/lists`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get("filter");
      return HttpResponse.json(filter === "shared" ? [BOTH_WAYS, BOTH_WAYS_OFFERED] : []);
    }),
    http.get(`${API}/folders/1`, () => HttpResponse.json(FOLDER)),
    http.get(`${API}/connections`, () => HttpResponse.json([GRAN])),
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * The attribution line drawn beneath the list's name, wherever it is drawn.
 *
 * Found by walking up from the name and taking the line that follows it, so it
 * asks nothing of any page's markup beyond the one thing they all promise:
 * the name, then what the list's source is. A page that stopped attributing the
 * row would return its next line instead — the claimed count on `/lists`, and
 * nothing at all on the folder page — and fail the comparison rather than
 * quietly passing it.
 */
async function attributionLineOn(name: string, scope: HTMLElement | null = null) {
  const heading = scope
    ? await within(scope).findByText(name)
    : await screen.findByText(name);
  const row = heading.parentElement as HTMLElement;
  const lines = [...row.querySelectorAll("p")]
    .map((line) => line.textContent?.trim())
    .filter((text): text is string => Boolean(text) && text !== name);
  return lines[0] ?? null;
}

describe("ListAttribution — the same list on /lists, a folder page and a person's page", () => {
  it("renders one identical line from every call site", async () => {
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
    // The second list, read here while `/lists` is still mounted: it is what the
    // folder's picker is compared against below.
    const otherOnListsPage = await attributionLineOn("Gran's Other List");
    onLists.unmount();

    // Wrapped in the provider the other two already carry: the folder page's
    // rows and its picker both pair `RecipientLine` against
    // `ListAttributionLine` on who owns the list, so they need a viewer to
    // compare against.
    const onFolder = render(
      <QueryClientProvider client={client()}>
        <AuthProvider>
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
        </AuthProvider>
      </QueryClientProvider>,
    );
    const onFolderPage = await attributionLineOn("Carol's Wishlist");
    // The picker, on the one page that draws two row lists at once. Scoped to
    // its own region: an unscoped `findByText` would match the folder's row and
    // the picker's row for one name and fail as ambiguous.
    const onPicker = await attributionLineOn(
      "Gran's Other List",
      await screen.findByRole("region", { name: "Add a List" }),
    );
    onFolder.unmount();

    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/people/5"]}>
          <Routes>
            <Route
              path="/people/:id"
              element={
                <NumericId back="/people">
                  <ConnectionProfile />
                </NumericId>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const onPersonPage = await attributionLineOn("Carol's Wishlist");

    // The same line, from every call site — the whole claim NEU-1286 makes.
    expect(onFolderPage).toBe(onListsPage);
    expect(onPersonPage).toBe(onListsPage);
    // The picker's is the same line over the same routes, on the second list
    // `/lists` also renders — so it is compared against that list's line there.
    expect(onPicker).toBe(otherOnListsPage);
    // And the right line: the direct share wins over the occasion one, so it
    // reads neither "from Gran Boone" (the owner, which is what the folder page
    // used to say) nor the bare "Boone Family".
    expect(onListsPage).toBe("from Carol Boone");
    // Pinned at both ends, so a picker that rendered no line at all fails on the
    // literal rather than passing against a comparison that also went empty.
    expect(otherOnListsPage).toBe("from Carol Boone");
  });
});
