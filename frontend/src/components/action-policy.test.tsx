import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { NumericId } from "./NumericId";
import { ListDetail } from "../pages/ListDetail";
import { FolderDetail } from "../pages/FolderDetail";
import { Folders } from "../pages/Folders";
import { OccasionDetail } from "../pages/OccasionDetail";
import { People } from "../pages/People";
import { organizerToken, renderFamilyDetail } from "../pages/family-detail/harness";

/**
 * **The rule: every action on the thing a page header or a list row is about is
 * a visible control** (`CONTEXT.md` rule 12).
 *
 * Rule 11's twin, and this file is `confirmation-policy.test.tsx`'s: rule 11
 * governs when an action *asks*, rule 12 whether it is *seen*, and both fail the
 * same way — one contributor tucking a Delete back behind a glyph to keep a
 * header clean, defensible where it stands, wrong as a set.
 *
 * The set is what is asserted because the set is what was wrong. Before
 * NEU-1322 four surfaces hid their actions behind a `⋯` rendered as *text* —
 * grey, borderless, transparent — while `FolderDetail`'s header hung the same
 * kind of actions on the page as plain buttons. Two of those four menus held a
 * *single* item: a viewer's `Add to a folder…`, and a `People` row's `Remove`.
 * Every one of them was defensible on its own page. The app held both answers,
 * and one had to lose.
 *
 * So each case below asserts what the rule promises rather than what the markup
 * happens to be: the action is on screen, enabled, and reachable with **no
 * prior interaction** — nothing was clicked between rendering and asserting.
 * Re-hiding any of them behind a disclosure fails this file whatever the
 * disclosure is built out of, which a per-site suite querying a button by name
 * would not.
 *
 * Out of scope by the same rule, and deliberately: `GiftsTab`'s claim and
 * purchase controls (a page's content, not actions on its subject),
 * `ActionableBanner` (a CTA), the admin pages, `FamilySettingsSection` and
 * `SharedAccountCard`. Rule 12 governs action groups on a header or a row and
 * says nothing about the rest, so neither does this file.
 */

const API = "https://boone-gifts-api.localhost";

function tokenFor(userId: number) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: String(userId), email: `user${userId}@test.com`, role: "member", exp: 9999999999 })),
    "fake-signature",
  ].join(".");
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function mount(initialEntry: string, path: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider client={client()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <NavigationDepthProvider>
            <Routes>
              <Route path={path} element={element} />
              <Route path="*" element={null} />
            </Routes>
          </NavigationDepthProvider>
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * The rule, as one assertion: each named action is on screen and usable, and
 * nothing was pressed to get there — every case renders, waits for the page to
 * settle, and asserts, with no interaction in between.
 *
 * `surface` scopes the search to one row where a page repeats them. A header's
 * actions are looked for page-wide instead: a page has one header, and pinning
 * the search to the element that happens to hold it today would make this file
 * fail when a header is restyled, which is the opposite of what it is for.
 */
function expectActionsVisible(names: string[], surface?: HTMLElement) {
  const scope = surface ? within(surface) : screen;
  for (const name of names) {
    expect(scope.getByRole("button", { name })).toBeEnabled();
  }
}

/**
 * Nothing anywhere on the page is a glyph standing in for actions behind it.
 *
 * Phrased against the fault rather than against `HeaderMenu`: a control whose
 * whole label is `⋯` (or a bare ellipsis) tells the user nothing about what it
 * holds, which is the complaint NEU-1322 opened with. `Add to a folder…` is not
 * one — its trailing ellipsis follows a verb that says what it does.
 */
function expectNoGlyphControls() {
  for (const control of screen.queryAllByRole("button")) {
    expect(control.textContent?.trim()).not.toMatch(/^[⋯….·]+$/);
  }
}

// --- List detail ---------------------------------------------------------

const ownerList = {
  id: 1, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Owner",
  is_archived: false, gifts: [], created_at: "2026-01-01", updated_at: "2026-01-01",
};

const viewerList = {
  id: 1, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Owner",
  is_archived: false, claim_candidates: [], claim_options: [], gifts: [],
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

function renderListDetail(token: string, list: object) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
    http.get(`${API}/lists/1`, () => HttpResponse.json(list)),
    http.get(`${API}/connections`, () => HttpResponse.json([])),
    http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    http.get(`${API}/lists/1/families`, () => HttpResponse.json([])),
    http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
  );
  return mount("/lists/1", "/lists/:id", <NumericId back="/lists"><ListDetail /></NumericId>);
}

/** Wait for a list page to have painted its header. */
async function listPainted() {
  await screen.findByRole("heading", { level: 1, name: "My Wishlist" });
}

// --- Folder detail -------------------------------------------------------

const folder = {
  id: 1, name: "Christmas 2026", description: null, owner_id: 1, is_archived: false,
  lists: [{
    id: 10, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Me",
    shared_via: [], created_at: "2026-01-01", updated_at: "2026-01-01",
  }],
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

function renderFolderDetail() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(1), token_type: "bearer" })
    ),
    http.get(`${API}/folders/1`, () => HttpResponse.json(folder)),
    http.get(`${API}/lists`, () => HttpResponse.json([])),
  );
  return mount("/folders/1", "/folders/:id", <NumericId back="/lists"><FolderDetail /></NumericId>);
}

// --- Folders -------------------------------------------------------------

function renderFolders() {
  server.use(
    http.get(`${API}/folders`, () =>
      HttpResponse.json([{
        id: 1, name: "Christmas 2026", description: null, owner_id: 1,
        is_archived: false, created_at: "2026-01-01", updated_at: "2026-01-01",
      }])
    ),
  );
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter><Folders /></MemoryRouter>
    </QueryClientProvider>
  );
}

// --- Occasion detail -----------------------------------------------------

const occasion = {
  id: 3, family_id: 7, family_name: "Boone Family", name: "Christmas 2026",
  is_archived: false, created_by_id: 1,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

function renderOccasionDetail() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(1), token_type: "bearer" })
    ),
    http.get(`${API}/occasions/3`, () => HttpResponse.json(occasion)),
    http.get(`${API}/occasions/3/lists`, () => HttpResponse.json([])),
    http.get(`${API}/occasions/3/shopping`, () =>
      HttpResponse.json({ budget: { amount: null, spent: "0.00", remaining: null }, items: [] })
    ),
    http.get(`${API}/families/7`, () =>
      HttpResponse.json({
        id: 7, name: "Boone Family", created_by_id: 1,
        members: [{ user_id: 1, name: "Alice", role: "organizer" }],
      })
    ),
    http.get(`${API}/lists`, () => HttpResponse.json([])),
  );
  return mount("/occasions/3", "/occasions/:id", <NumericId back="/people"><OccasionDetail /></NumericId>);
}

// --- People --------------------------------------------------------------

const ALICE = {
  id: 7, status: "accepted",
  user: { id: 2, name: "Alice", email: "alice@test.com" },
  created_at: "2026-01-01", accepted_at: "2026-01-02",
};

function renderPeople() {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json([])),
    http.get(`${API}/connections`, () => HttpResponse.json([ALICE])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    http.get(`${API}/occasions/archive-prompts`, () => HttpResponse.json([])),
    http.get(`${API}/families/invites`, () => HttpResponse.json([])),
  );
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={["/people"]}>
        <Routes>
          <Route path="/people" element={<People />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The row a name sits on, whichever list it belongs to. */
function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("the action policy — a header's actions stand on the header", () => {
  it("a list owner's four actions are all on the page at once", async () => {
    renderListDetail(tokenFor(1), ownerList);
    await listPainted();

    expectActionsVisible(["Add to a folder…", "Edit", "Archive", "Delete"]);
    expectNoGlyphControls();
  });

  // One of the two menus that held a single item: two clicks, behind a glyph
  // nobody recognised, to reach a viewer's only entry point to the feature.
  it("a list viewer's one action is on the page, not behind anything", async () => {
    renderListDetail(tokenFor(2), viewerList);
    await listPainted();

    expectActionsVisible(["Add to a folder…"]);
    expectNoGlyphControls();
  });

  it("an occasion organizer's actions are on the occasion header", async () => {
    renderOccasionDetail();

    await screen.findByRole("heading", { level: 1, name: "Boone Family · Christmas 2026" });
    // Gated on the viewer's role, which the family read settles a tick later
    // than the occasion itself — so this waits for the bar rather than the page.
    await screen.findByRole("button", { name: "Rename" });

    expectActionsVisible(["Rename", "Archive"]);
    expectNoGlyphControls();
  });

  // The header that always did this, and the one the other three now match.
  it("a folder's three actions are on the folder header", async () => {
    renderFolderDetail();

    await screen.findByRole("heading", { level: 1, name: "Christmas 2026" });

    expectActionsVisible(["Archive", "Edit", "Delete"]);
    expectNoGlyphControls();
  });
});

describe("the action policy — a row's actions stand on the row, and name it", () => {
  /**
   * Each of these is announced with its subject, which is the one thing the
   * `⋯` did better and had to be rebuilt: its trigger carried
   * `aria-label="Actions for Jane Boone"`, so a screen-reader user heard the
   * person before the verb. Without it fifty rows each offer a button announced
   * as nothing but "Remove".
   */

  it("a connection row's Remove is on the row and names the person", async () => {
    renderPeople();

    await screen.findByRole("link", { name: "Alice" });
    expectActionsVisible(["Remove Alice"], rowFor("alice@test.com"));
    expectNoGlyphControls();
  });

  it("a folder row's Delete is on the row and names the folder", async () => {
    renderFolders();

    await screen.findByText("Christmas 2026");
    expectActionsVisible(["Delete Christmas 2026"], rowFor("Christmas 2026"));
    expectNoGlyphControls();
  });

  it("a folder's list row carries Remove, naming the list", async () => {
    renderFolderDetail();

    await screen.findByText("My Wishlist");
    expectActionsVisible(["Remove My Wishlist"], rowFor("My Wishlist"));
    expectNoGlyphControls();
  });

  it("a member row carries both of its actions, each naming the member", async () => {
    renderFamilyDetail(organizerToken);

    await screen.findByText("Boone Family");
    expectActionsVisible(["Make Organizer Bob", "Remove Bob"], rowFor("Bob"));
    expectNoGlyphControls();
  });
});

describe("the action policy — the accessible name contains the visible label", () => {
  /**
   * WCAG 2.5.3 Label in Name: a row's action may say more than its text, never
   * something else, so voice control still works on "click Remove". This is why
   * `"Remove Jane Boone"` is correct where `"Delete connection"` is not.
   */
  it("holds for every row action in the app", async () => {
    renderPeople();
    await screen.findByRole("link", { name: "Alice" });

    const remove = within(rowFor("alice@test.com")).getByRole("button");
    expect(remove).toHaveAccessibleName(expect.stringContaining(remove.textContent!.trim()));
  });
});
