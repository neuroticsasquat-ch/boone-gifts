import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import toast, { Toaster } from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { NumericId } from "./NumericId";
import { BudgetLine } from "./BudgetLine";
import { ListDetail } from "../pages/ListDetail";
import { AdminInvites } from "../pages/AdminInvites";
import { FolderDetail } from "../pages/FolderDetail";
import { OccasionDetail } from "../pages/OccasionDetail";
import { People } from "../pages/People";
import {
  memberToken,
  organizerToken,
  renderFamilyDetail,
} from "../pages/family-detail/harness";

/**
 * **The rule: a confirmation is for what cannot be undone, or what lands on
 * somebody else** (`CONTEXT.md` rule 11).
 *
 * Every other suite in this repo proves that one site behaves. This one proves
 * the *arrangement*, and it exists because the arrangement is the thing that
 * was wrong: before NEU-1319 archiving a list — reversible, private, and
 * reachable again from a link on the page it was started from — stopped to ask,
 * while removing a family member, leaving a family and revoking an invite each
 * fired on the first click and destroyed shares and claims a re-invite does not
 * bring back. Every one of those dialogs looked defensible where it stood. Only
 * the set was wrong, so the set is what is asserted here.
 *
 * So this is not redundant coverage of the per-site suites. It is the test that
 * fails when somebody helpfully re-adds archive's confirmation, or adds a
 * destructive control without one — and it says in English why that is wrong,
 * where a per-site suite would only say that one file changed.
 *
 * Two sites are held by their own suites rather than here, because reaching
 * them means driving a modal open first and the walk would stop being a table:
 * revoking a share (`ListSharingModal` — and its dialog is a *choice* about
 * claims rather than a yes/no, so it does not fit either column) and stripping
 * a shared account's labels (`SharedAccountCard`).
 *
 * Everything else the audit looked at is here, including the rows it looked at
 * and deliberately left alone — the archive nudge, the admin pages, clearing a
 * budget, unticking a purchase. Those are the rows most at risk of being
 * "fixed" by somebody applying the rule from memory, so leaving them out would
 * cost this file exactly the thing it is for.
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

/**
 * Everything the audited mutations answer with, in one place: none of these
 * assertions is about what came back, only about what was asked first.
 *
 * Registered by the render helpers, so a test that wants to *capture* one of
 * these requests registers its own handler **after** rendering — `server.use`
 * prepends, and a handler put up first would be shadowed by this one.
 */
function serveWrites() {
  server.use(
    http.put(`${API}/lists/1`, () => HttpResponse.json(ownerList)),
    http.delete(`${API}/lists/1`, () => new HttpResponse(null, { status: 204 })),
    http.delete(`${API}/lists/1/gifts/10/claim`, () => new HttpResponse(null, { status: 204 })),
    http.put(`${API}/folders/1`, () => HttpResponse.json(folder)),
    http.delete(`${API}/folders/1`, () => new HttpResponse(null, { status: 204 })),
    http.delete(`${API}/folders/1/items/10`, () => new HttpResponse(null, { status: 204 })),
    http.delete(`${API}/families/1`, () => new HttpResponse(null, { status: 204 })),
    http.delete(`${API}/families/1/members/:userId`, () => new HttpResponse(null, { status: 204 })),
    http.put(`${API}/families/1/members/:userId/role`, () =>
      HttpResponse.json({ user_id: 2, name: "Bob", role: "organizer" })
    ),
    http.delete(`${API}/families/1/invites/:inviteId`, () => new HttpResponse(null, { status: 204 })),
    http.put(`${API}/occasions/:id`, () => HttpResponse.json({ ...familyOccasion, is_archived: true })),
    http.delete(`${API}/connections/7`, () => new HttpResponse(null, { status: 204 })),
  );
}

// --- List detail ---------------------------------------------------------

const ownerList = {
  id: 1, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Owner",
  is_archived: false, gifts: [], created_at: "2026-01-01", updated_at: "2026-01-01",
};

/** The viewer's own claim on the owner's gift. `purchased_at` is what the
 *  unclaim rule turns on, so it is the only field the two cases differ in. */
function viewerListWithClaim(purchasedAt: string | null) {
  return {
    id: 1, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Owner",
    is_archived: false, claim_candidates: [], claim_options: [],
    gifts: [{
      id: 10, name: "Cast iron skillet", description: null, url: null, price: "39.00",
      claimed_by_id: 2, claimed_at: "2026-01-02",
      purchased_at: purchasedAt, amount_paid: purchasedAt === null ? null : "32.50",
      created_at: "2026-01-01", updated_at: "2026-01-01",
    }],
    created_at: "2026-01-01", updated_at: "2026-01-01",
  };
}

function renderListDetail(token: string, list: object = ownerList) {
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
  serveWrites();

  return render(
    <QueryClientProvider client={client()}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/lists/1"]}>
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/lists/:id"
                element={<NumericId back="/lists"><ListDetail /></NumericId>}
              />
              <Route path="*" element={null} />
            </Routes>
          </NavigationDepthProvider>
          {/* Mounted so "nothing was announced" is a claim that can fail:
              without it a toast has nowhere to render and the assertion passes
              whatever the code does. */}
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Press one of the owner header's actions, which stand on the header itself. */
async function fromListHeader(label: string) {
  await screen.findByText("My Wishlist");
  await userEvent.click(screen.getByRole("button", { name: label }));
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

function renderFolderDetail(isArchived = false) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(1), token_type: "bearer" })
    ),
    http.get(`${API}/folders/1`, () => HttpResponse.json({ ...folder, is_archived: isArchived })),
    http.get(`${API}/lists`, () => HttpResponse.json([])),
  );
  serveWrites();

  return render(
    <QueryClientProvider client={client()}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/folders/1"]}>
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/folders/:id"
                element={<NumericId back="/lists"><FolderDetail /></NumericId>}
              />
              <Route path="*" element={null} />
            </Routes>
          </NavigationDepthProvider>
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// --- The family page -----------------------------------------------------

const familyOccasion = {
  id: 3, family_id: 1, name: "Christmas 2026", is_archived: false, created_by_id: 1,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

const pendingInvite = {
  id: 10, family_id: 1, email: "newperson@example.com", role: "member", token: "abc123",
  invited_by_id: 1, expires_at: "2099-01-01T00:00:00Z", accepted_at: null, declined_at: null,
  created_at: "2026-06-28T00:00:00Z", status: "pending" as const,
};

/** The family page with an occasion and an invite on it, so all five of its
 *  audited controls are on screen at once. */
function renderFamilyPage(token = organizerToken) {
  server.use(
    http.get(`${API}/families/1/occasions`, ({ request }) => {
      const wantsArchived = new URL(request.url).searchParams.get("archived") === "true";
      return HttpResponse.json(wantsArchived ? [] : [familyOccasion]);
    }),
    http.get(`${API}/families/1/invites`, () => HttpResponse.json([pendingInvite])),
  );
  serveWrites();
  return renderFamilyDetail(token);
}

/** One of the family page's four zones, by its `h2`. */
function zone(heading: string): HTMLElement {
  return screen
    .getByRole("heading", { level: 2, name: heading })
    .closest("section") as HTMLElement;
}

// --- The occasion page ---------------------------------------------------

function renderOccasionDetail() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: tokenFor(1), token_type: "bearer" })
    ),
    // The detail read names the family (NEU-1321); the family occasions list
    // `familyOccasion` also feeds does not, which is why it is spread here.
    http.get(`${API}/occasions/3`, () =>
      HttpResponse.json({ ...familyOccasion, family_id: 7, family_name: "Boone Family" })
    ),
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
  serveWrites();

  return render(
    <QueryClientProvider client={client()}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/occasions/3"]}>
          <NavigationDepthProvider>
            <Routes>
              <Route
                path="/occasions/:id"
                element={<NumericId back="/people"><OccasionDetail /></NumericId>}
              />
              <Route path="*" element={null} />
            </Routes>
          </NavigationDepthProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// --- People --------------------------------------------------------------

const ALICE = {
  id: 7, status: "accepted",
  user: { id: 2, name: "Alice", email: "alice@test.com" },
  created_at: "2026-01-01", accepted_at: "2026-01-02",
};

/** The nudge to archive an occasion that has gone quiet, which the banner
 *  draws on /people and /lists. */
const ARCHIVE_PROMPT = { id: 25, name: "Christmas 2025", family_id: 10, family_name: "Boone Family" };

function renderPeople({ prompts = [] as object[] } = {}) {
  server.use(
    http.get(`${API}/occasions/archive-prompts`, () => HttpResponse.json(prompts)),
    http.get(`${API}/families/invites`, () => HttpResponse.json([])),
  );
  return renderPeopleShell();
}

function renderPeopleShell() {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json([])),
    http.get(`${API}/connections`, () => HttpResponse.json([ALICE])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
  );
  serveWrites();

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

// --- The budget line, and the admin pages --------------------------------

/** The viewer's own budget, on a `My shopping` tab. Rendered directly: the tab
 *  that hosts it adds nothing this walk is asking about. */
function renderBudgetLine() {
  return render(
    <QueryClientProvider client={client()}>
      <BudgetLine
        budget={{
          amount: "200.00", spent: "142.00", remaining: "58.00",
          bought_count: 3, total_count: 7, unpriced_count: 0,
        }}
        scope={{ kind: "occasion", id: 3 }}
      />
    </QueryClientProvider>
  );
}

const ADMIN_INVITE = {
  id: 42, token: "tok", email: "invitee@example.com", role: "member",
  status: "pending" as const, expires_at: "2099-01-01T00:00:00Z", used_at: null,
  invited_by_id: 1, created_at: "2026-01-01T00:00:00Z",
};

function renderAdminInvites() {
  server.use(
    http.get(`${API}/invites`, () => HttpResponse.json([ADMIN_INVITE])),
    http.delete(`${API}/invites/42`, () => new HttpResponse(null, { status: 204 })),
  );
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={["/admin/invites"]}>
        <Routes>
          <Route path="/admin/invites" element={<AdminInvites />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * No dialog now, and none a moment later either.
 *
 * A confirmation that is raised asynchronously — after a query settles, or on a
 * mutation's own callback — would pass a bare `queryByRole` immediately after
 * the click. Waiting for the page to reach the state the action produces and
 * only then asserting is what makes "no dialog at any point" a real claim.
 */
async function noDialogRaised(settled: () => void | Promise<void>) {
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(settled);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}

beforeEach(() => toast.remove());

describe("the confirmation policy — what asks nothing", () => {
  it("archiving a list does not ask", async () => {
    let archived: unknown = null;
    renderListDetail(tokenFor(1));
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json({ ...ownerList, is_archived: true });
      }),
    );

    await fromListHeader("Archive");

    await noDialogRaised(() => expect(archived).toBe(true));
    // Nothing is announced either. `ListHeader` takes `isArchived`, so the page
    // the viewer is looking at already says what happened, and a notification
    // for a state change rendered on screen is the same nagging in a quieter
    // font.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("unarchiving a list does not ask", async () => {
    let archived: unknown = null;
    renderListDetail(tokenFor(1), { ...ownerList, is_archived: true });
    server.use(
      http.put(`${API}/lists/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json(ownerList);
      }),
    );

    await fromListHeader("Unarchive");

    await noDialogRaised(() => expect(archived).toBe(false));
  });

  it("archiving a folder does not ask", async () => {
    let archived: unknown = null;
    renderFolderDetail();
    server.use(
      http.put(`${API}/folders/1`, async ({ request }) => {
        archived = ((await request.json()) as { is_archived?: boolean }).is_archived;
        return HttpResponse.json({ ...folder, is_archived: true });
      }),
    );

    await screen.findByText("Christmas 2026");
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await noDialogRaised(() => expect(archived).toBe(true));
    // Nor is anything announced: the header swaps its own controls, so the page
    // already says what happened.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // Reversible and private, like archiving — the list is still there, and this
  // only changes where the viewer filed it.
  it("taking a list out of a folder does not ask", async () => {
    let removed = false;
    renderFolderDetail();
    server.use(
      http.delete(`${API}/folders/1/items/10`, () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await screen.findByText("My Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "Remove My Wishlist" }));

    await noDialogRaised(() => expect(removed).toBe(true));
  });

  // Nothing is destroyed and the claim survives, so this is the archive case
  // rather than the unclaim one.
  it("changing a member's role does not ask", async () => {
    let promoted = false;
    renderFamilyPage();
    server.use(
      http.put(`${API}/families/1/members/2/role`, () => {
        promoted = true;
        return HttpResponse.json({ user_id: 2, name: "Bob", role: "organizer" });
      }),
    );

    await screen.findByText("Boone Family");
    await userEvent.click(within(zone("Members")).getByRole("button", { name: "Make Organizer Bob" }));

    await noDialogRaised(() => expect(promoted).toBe(true));
  });

  // The contrast the whole rule turns on. `purchase_gift` treats an absent
  // `amount_paid` as "keep what is recorded", so unticking and re-ticking is
  // non-destructive by design — the amount survives it, and unclaiming is the
  // only way to lose it.
  it("unticking a purchase does not ask", async () => {
    let unpurchased = false;
    renderListDetail(tokenFor(2), viewerListWithClaim("2026-01-03"));
    server.use(
      http.delete(`${API}/lists/1/gifts/10/purchase`, () => {
        unpurchased = true;
        return HttpResponse.json({ ...viewerListWithClaim(null).gifts[0], amount_paid: "32.50" });
      }),
    );

    await userEvent.click(await screen.findByRole("checkbox", { name: "Bought" }));

    await noDialogRaised(() => expect(unpurchased).toBe(true));
  });

  // The viewer's own target for their own spending: nobody else can see it, and
  // setting it again is one field away.
  it("clearing a budget does not ask", async () => {
    let cleared = false;
    renderBudgetLine();
    server.use(
      http.delete(`${API}/occasions/3/budget`, () => {
        cleared = true;
        return HttpResponse.json({
          amount: null, spent: "142.00", remaining: null,
          bought_count: 3, total_count: 7, unpriced_count: 0,
        });
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

    await noDialogRaised(() => expect(cleared).toBe(true));
  });

  it("unclaiming a gift that was never marked bought does not ask", async () => {
    let unclaimed = false;
    renderListDetail(tokenFor(2), viewerListWithClaim(null));
    server.use(
      http.delete(`${API}/lists/1/gifts/10/claim`, () => {
        unclaimed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Never mind" }));

    await noDialogRaised(() => expect(unclaimed).toBe(true));
  });
});

describe("the confirmation policy — what asks, and names what it is acting on", () => {
  /** Press a control, and return the dialog it must have raised. */
  async function dialogFrom(control: HTMLElement) {
    await userEvent.click(control);
    return screen.findByRole("dialog");
  }

  it("deleting a list asks", async () => {
    renderListDetail(tokenFor(1));

    await fromListHeader("Delete");

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Delete this list?");
  });

  it("deleting a folder asks", async () => {
    renderFolderDetail();

    await screen.findByText("Christmas 2026");
    const dialog = await dialogFrom(screen.getByRole("button", { name: "Delete" }));

    expect(dialog).toHaveAccessibleName("Delete this folder?");
  });

  it("deleting a family asks", async () => {
    renderFamilyPage();

    await screen.findByText("Boone Family");
    const dialog = await dialogFrom(
      within(zone("Family settings")).getByRole("button", { name: "Delete Family" })
    );

    expect(dialog).toHaveAccessibleName("Delete Family?");
  });

  it("removing a family member asks, and names the member and the family", async () => {
    renderFamilyPage();

    await screen.findByText("Boone Family");
    const dialog = await dialogFrom(
      within(zone("Members")).getByRole("button", { name: "Remove Bob" })
    );

    expect(dialog).toHaveAccessibleName("Remove Bob from Boone Family?");
  });

  it("leaving a family asks, and names the family", async () => {
    renderFamilyPage(memberToken);

    await screen.findByText("Boone Family");
    const dialog = await dialogFrom(
      within(zone("Leave Family")).getByRole("button", { name: "Leave Family" })
    );

    expect(dialog).toHaveAccessibleName("Leave Boone Family?");
  });

  it("archiving an occasion from the family page asks, and names the occasion", async () => {
    renderFamilyPage();

    await screen.findByText("Christmas 2026");
    const dialog = await dialogFrom(
      within(zone("Occasions")).getByRole("button", { name: "Archive" })
    );

    expect(dialog).toHaveAccessibleName("Archive Christmas 2026?");
  });

  it("archiving an occasion from its own page asks", async () => {
    renderOccasionDetail();

    await screen.findByRole("heading", { level: 1, name: "Boone Family Christmas 2026" });
    const dialog = await dialogFrom(screen.getByRole("button", { name: "Archive" }));

    // The page's own heading names the occasion above the dialog, so the title
    // has nothing left to disambiguate.
    expect(dialog).toHaveAccessibleName("Archive this occasion?");
  });

  it("revoking a family invite asks, and names the email", async () => {
    renderFamilyPage();

    await screen.findByText("newperson@example.com");
    const dialog = await dialogFrom(
      within(zone("Family settings")).getByRole("button", { name: "Revoke" })
    );

    expect(dialog).toHaveAccessibleName("Revoke the invite to newperson@example.com?");
  });

  // A row of the audit table that needed no code: the nudge already confirmed,
  // and it lands on the whole family exactly as the other two archive-occasion
  // sites do.
  it("archiving an occasion from the archive nudge asks, and names the occasion", async () => {
    renderPeople({ prompts: [ARCHIVE_PROMPT] });

    const dialog = await dialogFrom(
      await screen.findByLabelText("Archive Christmas 2025 in Boone Family")
    );

    expect(dialog).toHaveAccessibleName("Archive Christmas 2025?");
  });

  // Already correct under the rule before this ticket, and named in the spec as
  // unchanged: every action here is irreversible and about somebody else.
  it("revoking an admin invite asks", async () => {
    renderAdminInvites();

    await screen.findAllByText("invitee@example.com");
    const dialog = await dialogFrom(screen.getAllByRole("button", { name: "Revoke" })[0]);

    expect(dialog).toHaveAccessibleName("Revoke this invite?");
  });

  it("removing a connection asks, and names the person", async () => {
    renderPeople();

    await screen.findByRole("link", { name: "Alice" });
    const dialog = await dialogFrom(screen.getByRole("button", { name: "Remove Alice" }));

    expect(dialog).toHaveAccessibleName("Remove Alice?");
  });

  it("unclaiming a gift that was marked bought asks, and names what is lost", async () => {
    renderListDetail(tokenFor(2), viewerListWithClaim("2026-01-03"));

    const dialog = await dialogFrom(await screen.findByRole("button", { name: "Never mind" }));

    expect(dialog).toHaveAccessibleName("Are you sure you no longer want to get this gift?");
    expect(within(dialog).getByText(/the \$32\.50 you recorded, will be forgotten/)).toBeInTheDocument();
  });
});

describe("the confirmation policy — cancelling never writes", () => {
  // One case standing for the column: the dialog is one component, so what is
  // being checked is that a call site wires Cancel to nothing, and the site
  // most recently given a dialog is the one most likely to have got it wrong.
  it("cancelling a member removal sends no request", async () => {
    let called = false;
    renderFamilyPage();
    server.use(
      http.delete(`${API}/families/1/members/2`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await screen.findByText("Boone Family");
    await userEvent.click(within(zone("Members")).getByRole("button", { name: "Remove Bob" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(called).toBe(false);
  });
});
