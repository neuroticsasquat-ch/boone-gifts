import { render, screen, waitFor } from "@testing-library/react";
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
import type { GiftList } from "../types";

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

/** Connection 5 is Alice, whose *user* id is 2. The two ids differ on purpose:
 *  the route param is the connection and the shared scope is keyed on the
 *  owner, so a page that filtered on the param would find nothing of hers. */
const alice = {
  id: 5,
  status: "accepted",
  user: { id: 2, name: "Alice", email: "alice@test.com" },
  created_at: "2026-01-01",
  accepted_at: "2026-01-02",
};

const CHRISTMAS = {
  kind: "occasion" as const,
  occasion: { id: 3, name: "Christmas 2026" },
  family: { id: 1, name: "Boone Family" },
};
const FROM_ALICE = { kind: "direct" as const, person: { id: 2, name: "Alice" } };

function list(fields: Partial<GiftList> & { id: number; name: string }): GiftList {
  return {
    description: null,
    owner_id: 2,
    owner_name: "Alice",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 8,
    claimed_count: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    shared_via: [],
    ...fields,
  };
}

/** The shared scope as `/lists?filter=shared` answers it: three of Alice's
 *  lists, each reaching the viewer by a different route, and one a third party
 *  sent through the same occasion. */
const OCCASION_ONLY = list({ id: 1, name: "Alice's Secret Santa", shared_via: [CHRISTMAS] });
const DIRECT_ONLY = list({ id: 2, name: "Alice's Birthday", shared_via: [FROM_ALICE] });
const BOTH_WAYS = list({ id: 3, name: "Alice's Wishlist", shared_via: [CHRISTMAS, FROM_ALICE] });
const SOMEONE_ELSES = list({
  id: 4,
  name: "Bob's Wishlist",
  owner_id: 9,
  owner_name: "Bob",
  shared_via: [CHRISTMAS],
});

const WHOLE_SCOPE = [OCCASION_ONLY, DIRECT_ONLY, BOTH_WAYS, SOMEONE_ELSES];

/** `arriveFrom` starts the session on another page and pushes into the profile
 *  from it, so the back control is at depth > 0. A deeper `initialEntries` would
 *  not do: that is still an entry location, and still depth 0 (NEU-1302). */
function renderProfile({
  connections = [alice],
  shared = WHOLE_SCOPE,
  sharedFails = false,
  arriveFrom,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: {
  connections?: (typeof alice)[];
  shared?: GiftList[];
  sharedFails?: boolean;
  arriveFrom?: string;
  /** Supply one to seed the cache before the page mounts — how the
   *  arriving-from-`/lists` case is set up. */
  queryClient?: QueryClient;
} = {}) {
  server.use(
    http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    http.get(`${API}/lists`, () =>
      sharedFails ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(shared),
    ),
  );

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

describe("ConnectionProfile — the rows are a cut of the shared scope", () => {
  // The regression this ticket exists for. `/connections/5/lists` answered
  // direct shares only, so clicking "Boone Family" on an occasion-reached list
  // of Alice's landed on a page that omitted the very list it came from.
  it("shows a list that reached the viewer only through an occasion", async () => {
    renderProfile();

    expect(await screen.findByText("Alice's Secret Santa")).toBeInTheDocument();
  });

  it("shows a directly-shared list of theirs, and a both-ways list exactly once", async () => {
    renderProfile();

    expect(await screen.findByText("Alice's Birthday")).toBeInTheDocument();
    expect(screen.getAllByText("Alice's Wishlist")).toHaveLength(1);
  });

  // Ownership is the key, so the occasion that carried Alice's list carrying
  // Bob's too does not put Bob's list on Alice's page.
  it("does not show a list owned by someone else on the same occasion", async () => {
    renderProfile();

    await screen.findByText("Alice's Secret Santa");
    expect(screen.queryByText("Bob's Wishlist")).not.toBeInTheDocument();
  });

  // The route param is the connection id (5); the scope is keyed on the owner's
  // user id (2). Asserting the page found her lists at all is what proves the
  // hop through `connection.user.id` happened.
  it("asks the shared scope, not the retired per-connection endpoint", async () => {
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => asked.push(new URL(request.url).pathname));
    renderProfile();

    await screen.findByText("Alice's Secret Santa");
    expect(asked).not.toContain("/connections/5/lists");
    server.events.removeAllListeners("request:start");
  });

  it("reads each row's attribution line from the routes it arrived by", async () => {
    renderProfile();

    // The occasion-only row is labelled with its family — the thing that
    // explains its presence on a page about a person.
    const occasionRow = (await screen.findByText("Alice's Secret Santa")).parentElement!;
    expect(occasionRow).toHaveTextContent("Boone Family");
    // And the direct one reads the person, mildly redundant here and the price
    // of one labelling rule rather than two (NEU-1291 decision 1).
    const directRow = screen.getByText("Alice's Birthday").parentElement!;
    expect(directRow).toHaveTextContent("from Alice");
  });

  // Three cases, not two: a count, a zero, and no count at all. Absent is the
  // contract saying this row carries no such number — never a quiet stand-in
  // for "nothing left to buy" — so it draws nothing for its own reason.
  it("renders the to-buy badge from the viewer's own unbought claims, and not at zero or absent", async () => {
    renderProfile({
      shared: [
        list({ id: 1, name: "Has claims", shared_via: [FROM_ALICE], my_unpurchased_claim_count: 2 }),
        list({ id: 2, name: "No claims", shared_via: [FROM_ALICE], my_unpurchased_claim_count: 0 }),
        list({ id: 3, name: "No count at all", shared_via: [FROM_ALICE] }),
      ],
    });

    expect(await screen.findByText("• 2 to buy")).toBeInTheDocument();
    expect(screen.queryByText("• 0 to buy")).not.toBeInTheDocument();
    // Nothing beyond the one real badge — the absent-count row drew none.
    expect(screen.getByText("No count at all")).toBeInTheDocument();
    expect(screen.getAllByText(/to buy$/)).toHaveLength(1);
  });

  // AC5. The point of copying `/lists`' key and query function exactly is that
  // arriving from it paints from the entry already in hand. Asserted on the
  // *first* render, with no `await`: the rows are there before anything can
  // resolve, which is only true of data that was already cached. A key that
  // differed by a character would miss the entry, render the spinner and fail
  // here — and would make this page a second copy of the same data, the thing
  // the ticket exists to stop.
  //
  // Not asserted as "no request at all": the entry is stale on mount, so Query
  // revalidates it in the background exactly as it does on `/lists`. What AC5
  // is about is the viewer never waiting, and there being one entry rather than
  // two.
  it("paints from the cache entry /lists already filled, without waiting", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["lists", "shared", { archived: false }], WHOLE_SCOPE);
    // `connections` is seeded too — the page needs the connection to know whose
    // lists these are, and this test is about the shared-scope entry alone.
    queryClient.setQueryData(["connections"], [alice]);

    renderProfile({ queryClient });

    // No `await`. Had the key missed, the page would be a spinner and there
    // would be no such text to find.
    expect(screen.getByText("Alice's Secret Santa")).toBeInTheDocument();
  });

  it("says the scope holds none of theirs when it holds none of theirs", async () => {
    renderProfile({ shared: [SOMEONE_ELSES] });

    expect(await screen.findByText("No lists shared with you yet.")).toBeInTheDocument();
  });

  // The empty state is a claim about the person whose page this is, and may
  // only be made on data that arrived; a failed read is a fact about the
  // network (CONTEXT.md rule 7 one layer down, and the milestone is named
  // Correctness).
  it("says the read failed rather than claiming they have shared nothing", async () => {
    renderProfile({ sharedFails: true });

    expect(await screen.findByText("Couldn't load these lists.")).toBeInTheDocument();
    expect(screen.queryByText("No lists shared with you yet.")).not.toBeInTheDocument();
  });

  // The other half of decision 4. The error arm may not overcorrect: this page
  // paints from the entry `/lists` fills, so a *background refetch* failure
  // arrives with good rows already in hand. Blanking them would make this page
  // disagree with `/lists`, which goes on showing the same rows from the same
  // entry — the error only speaks when there is nothing else to say.
  it("keeps showing cached rows when a background refetch fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["lists", "shared", { archived: false }], WHOLE_SCOPE);
    queryClient.setQueryData(["connections"], [alice]);

    renderProfile({ queryClient, sharedFails: true });

    // Wait for the refetch to actually fail before asserting the rows survived it.
    await waitFor(() =>
      expect(queryClient.getQueryState(["lists", "shared", { archived: false }])?.status).toBe(
        "error",
      ),
    );
    expect(screen.getByText("Alice's Secret Santa")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load these lists.")).not.toBeInTheDocument();
  });

  // The profile is a label's destination, not a second index (project spec
  // §9.4) — the occasion that carried these lists is named on the rows and
  // nowhere else.
  it("lists no occasions and gains no second section", async () => {
    renderProfile();

    await screen.findByText("Alice's Secret Santa");
    expect(screen.getAllByRole("heading")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Christmas 2026/ })).not.toBeInTheDocument();
  });
});
