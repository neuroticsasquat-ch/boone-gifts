import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NumericId } from "./NumericId";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { Lists } from "../pages/Lists";
import { ListsArchive } from "../pages/ListsArchive";
import { FolderDetail } from "../pages/FolderDetail";
import { ConnectionProfile } from "../pages/ConnectionProfile";
import { OccasionDetail } from "../pages/OccasionDetail";

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
 * **`/occasions/:id` and `/lists/archive` are the fifth and sixth, since
 * NEU-1324.** Both were call sites all along and neither was covered, which is
 * how the occasion page shipped a row that read "Boone Family" underneath a
 * heading that already said "Boone Family" — a line no page-level test noticed
 * because the fixture it used carried a direct share too.
 *
 * The fixture is deliberately the hard case: a list that reached the viewer
 * **both** ways. Every page-local shortcut that ever produced a wrong label —
 * reading `owner_name`, or `routes[0]` — gives a different answer here than
 * "direct wins" does.
 *
 * **The occasion page is the one surface that answers differently, on purpose.**
 * That is not drift: `withinFamily` is a fact the *page* knows and the function
 * does not, and the second test below is the whole rule in one pair — the same
 * occasion-only list reads "Boone Family" on `/lists`, where the family says how
 * it reached you, and "from Gran Boone" on the page that has already said the
 * family. A surface that could choose its own wording would be free to disagree
 * about far more than this; an option with one meaning is not.
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

/** Reached the viewer through the family's occasion and **no other way** — what
 *  a list shared into an occasion normally is, and what `BOTH_WAYS` above
 *  deliberately is not. The pair of answers this one gives is the rule. */
const OCCASION_ONLY = {
  ...BOTH_WAYS,
  id: 3,
  name: "Gran's Christmas List",
  shared_via: [
    {
      kind: "occasion",
      occasion: { id: 3, name: "Christmas 2026" },
      family: { id: 1, name: "Boone Family" },
    },
  ],
};

/** The viewer's own, marked for nobody — no recipient and no account person.
 *  The default state of a list on an ordinary account, and until NEU-1324 the
 *  state that rendered a bare title on all five owner-side surfaces. */
const MINE = {
  ...BOTH_WAYS,
  id: 4,
  name: "My Wishlist",
  owner_id: 1,
  owner_name: "Tom Boone",
  shared_via: [],
};

/** The same row, archived — `/lists/archive` reads its own scope. */
const MINE_ARCHIVED = { ...MINE, id: 5, name: "My Old Wishlist", is_archived: true };

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

function folder(lists: object[]) {
  return {
    id: 1,
    name: "Christmas 2026",
    description: null,
    owner_id: 1,
    lists,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** The occasion the family's shares point at, and the family behind it. The
 *  page's heading is built from these, which is the whole reason its rows must
 *  not repeat the family. */
const OCCASION = {
  id: 3,
  family_id: 7,
  name: "Christmas 2026",
  family_name: "Boone Family",
  is_archived: false,
  created_by_id: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const FAMILY = {
  id: 7,
  name: "Boone Family",
  created_by_id: 1,
  members: [{ user_id: 1, name: "Tom Boone", role: "organizer" }],
};

function token() {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
    "fake-signature",
  ].join(".");
}

/**
 * The same lists, served to whichever page asks — as the `shared` or `owned`
 * scope for `/lists` and `/people/5`, as this folder's contents for
 * `/folders/1`, as the occasion's for `/occasions/3`, and as either archived
 * scope for `/lists/archive`.
 *
 * One handler set rather than one per test: a surface that disagreed because it
 * was handed different data would be a test bug wearing this file's costume.
 * The defaults are what the first test has always been served.
 */
function serveTheList({
  owned = [] as object[],
  shared = [BOTH_WAYS, BOTH_WAYS_OFFERED] as object[],
  archivedOwned = [] as object[],
  archivedShared = [] as object[],
  inFolder = [BOTH_WAYS] as object[],
  inOccasion = [BOTH_WAYS] as object[],
} = {}) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token(), token_type: "bearer" }),
    ),
    http.get(`${API}/lists`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const isArchived = params.get("archived") === "true";
      const isShared = params.get("filter") === "shared";
      if (isArchived) return HttpResponse.json(isShared ? archivedShared : archivedOwned);
      return HttpResponse.json(isShared ? shared : owned);
    }),
    http.get(`${API}/folders`, () => HttpResponse.json([])),
    http.get(`${API}/folders/1`, () => HttpResponse.json(folder(inFolder))),
    http.get(`${API}/connections`, () => HttpResponse.json([GRAN])),
    http.get(`${API}/occasions/3`, () => HttpResponse.json(OCCASION)),
    http.get(`${API}/occasions/3/lists`, () => HttpResponse.json(inOccasion)),
    http.get(`${API}/occasions/3/shopping`, () =>
      HttpResponse.json({ budget: { amount: null, spent: 0, remaining: null }, items: [] }),
    ),
    http.get(`${API}/families/7`, () => HttpResponse.json(FAMILY)),
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

/**
 * One page, wrapped in what every one of these six needs: a viewer (the folder
 * page, the picker and the occasion page all pair `RecipientLine` against
 * `ListAttributionLine` on who owns the row) and a navigation depth (the archive
 * and the occasion page both carry a back control).
 */
function renderPage(ui: ReactNode, entries: string[] = ["/"]) {
  return render(
    <QueryClientProvider client={client()}>
      <AuthProvider>
        <MemoryRouter initialEntries={entries}>
          <NavigationDepthProvider>{ui}</NavigationDepthProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function renderLists() {
  return renderPage(<Lists />);
}

function renderArchive() {
  return renderPage(<ListsArchive />, ["/lists/archive"]);
}

function renderFolder() {
  return renderPage(
    <Routes>
      <Route
        path="/folders/:id"
        element={
          <NumericId back="/lists">
            <FolderDetail />
          </NumericId>
        }
      />
    </Routes>,
    ["/folders/1"],
  );
}

function renderPerson() {
  return renderPage(
    <Routes>
      <Route
        path="/people/:id"
        element={
          <NumericId back="/people">
            <ConnectionProfile />
          </NumericId>
        }
      />
    </Routes>,
    ["/people/5"],
  );
}

function renderOccasion() {
  return renderPage(
    <Routes>
      <Route
        path="/occasions/:id"
        element={
          <NumericId back="/people">
            <OccasionDetail />
          </NumericId>
        }
      />
    </Routes>,
    ["/occasions/3"],
  );
}

describe("ListAttribution — the same list on every surface that draws a row", () => {
  it("renders one identical line from every call site", async () => {
    serveTheList({ archivedShared: [BOTH_WAYS] });

    const onLists = renderLists();
    const onListsPage = await attributionLineOn("Carol's Wishlist");
    // The second list, read here while `/lists` is still mounted: it is what the
    // folder's picker is compared against below.
    const otherOnListsPage = await attributionLineOn("Gran's Other List");
    onLists.unmount();

    const onFolder = renderFolder();
    const onFolderPage = await attributionLineOn("Carol's Wishlist");
    // The picker, on the one page that draws two row lists at once. Scoped to
    // its own region: an unscoped `findByText` would match the folder's row and
    // the picker's row for one name and fail as ambiguous.
    const onPicker = await attributionLineOn(
      "Gran's Other List",
      await screen.findByRole("region", { name: "Add a List" }),
    );
    onFolder.unmount();

    const onPerson = renderPerson();
    const onPersonPage = await attributionLineOn("Carol's Wishlist");
    onPerson.unmount();

    // The archive draws the same rows from its own scope, and was a call site
    // this test never covered until NEU-1324.
    const onArchive = renderArchive();
    const onArchivePage = await attributionLineOn("Carol's Wishlist");
    onArchive.unmount();

    // The occasion page reads `withinFamily`, and this list is exactly the case
    // where that changes nothing: a direct share outranks the family branch, so
    // the option has no branch left to skip. That is criterion 3 — the flag must
    // not outrank "direct wins" — stated on the one page that sets it.
    renderOccasion();
    const onOccasionPage = await attributionLineOn("Carol's Wishlist");

    // The same line, from every call site — the whole claim NEU-1286 makes.
    expect(onFolderPage).toBe(onListsPage);
    expect(onPersonPage).toBe(onListsPage);
    expect(onArchivePage).toBe(onListsPage);
    expect(onOccasionPage).toBe(onListsPage);
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

  /**
   * The one place two surfaces answer differently, and the pair is the rule.
   *
   * A list that reached the viewer through the family's occasion and no other
   * way is labelled with the **family** on `/lists`, because there the family is
   * the answer — it says how the list got to you (NEU-1235). On the occasion
   * page the heading has already said it, so the same label identifies nobody
   * and the row owes the viewer the owner's name instead (NEU-1324).
   *
   * The folder page is in here as the limiting case: it looks family-ish, is
   * often literally named "Christmas 2026", and establishes no family at all —
   * so it keeps `/lists`' answer, and a diff that "fixed" it would replace a
   * true label with a guess.
   */
  it("names the family everywhere except the page that has already named it", async () => {
    serveTheList({
      shared: [OCCASION_ONLY],
      inFolder: [OCCASION_ONLY],
      inOccasion: [OCCASION_ONLY],
    });

    const onLists = renderLists();
    const onListsPage = await attributionLineOn("Gran's Christmas List");
    onLists.unmount();

    const onFolder = renderFolder();
    const onFolderPage = await attributionLineOn("Gran's Christmas List");
    onFolder.unmount();

    renderOccasion();
    const onOccasionPage = await attributionLineOn("Gran's Christmas List");

    expect(onListsPage).toBe("Boone Family");
    expect(onFolderPage).toBe("Boone Family");
    expect(onOccasionPage).toBe("from Gran Boone");
  });

  /**
   * `RecipientLine`'s five call sites, and the thing that was missing from all
   * of them: a list marked for nobody is the default state of a list on an
   * ordinary account, and it used to render a bare title.
   *
   * "Mine" is a fallback and never a replacement, which is the second half of
   * this case — and it is safe to say only because every one of these five sites
   * has already established that the viewer owns the row. A sixth that had not
   * would read "Mine" at somebody about a list that is not theirs.
   */
  it("marks the viewer's own unmarked row as theirs, on every surface that draws one", async () => {
    const kept = { ...MINE, id: 6, name: "Beth's List", recipient_name: "Beth" };
    serveTheList({
      owned: [MINE, kept],
      shared: [],
      archivedOwned: [MINE_ARCHIVED],
      inFolder: [MINE],
      inOccasion: [MINE],
    });

    const onLists = renderLists();
    expect(await attributionLineOn("My Wishlist")).toBe("Mine");
    // Never a replacement: a list that says who it is for goes on saying it.
    expect(await attributionLineOn("Beth's List")).toBe("for Beth");
    onLists.unmount();

    const onArchive = renderArchive();
    expect(await attributionLineOn("My Old Wishlist")).toBe("Mine");
    onArchive.unmount();

    const onFolder = renderFolder();
    expect(await attributionLineOn("My Wishlist")).toBe("Mine");
    // The picker offers what the folder does not already hold — `kept` and the
    // archived row are excluded, so `MINE` reaches it from the owned scope.
    expect(
      await attributionLineOn(
        "Beth's List",
        await screen.findByRole("region", { name: "Add a List" }),
      ),
    ).toBe("for Beth");
    onFolder.unmount();

    renderOccasion();
    expect(await attributionLineOn("My Wishlist")).toBe("Mine");
  });
});
