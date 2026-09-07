import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Layout } from "../components/Layout";
import { Lists } from "./Lists";

const API = "https://boone-gifts-api.localhost";

const testRequest = {
  id: 7,
  status: "pending",
  user: { id: 3, name: "Dave Boone", email: "dave@test.com" },
  created_at: "2026-01-01T00:00:00Z",
  accepted_at: null,
};

function token(claims: Record<string, unknown>) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999, ...claims })),
    "fake-signature",
  ].join(".");
}

const fullModeToken = token({});
const simpleModeToken = token({ simple_mode: true });

function noLists() {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([])));
}

/** The viewer's occasions: what the filter's `<select>` lists, and what each one
 *  reports as its member lists when selected. */
function occasions(all: { id: number; name: string; lists?: unknown[] }[]) {
  const summary = (occasion: { id: number; name: string }) => ({
    id: occasion.id,
    name: occasion.name,
    description: null,
    owner_id: 1,
    is_archived: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  server.use(
    http.get(`${API}/occasions`, () => HttpResponse.json(all.map(summary))),
    http.get(`${API}/occasions/:id`, ({ params }) => {
      const occasion = all.find((candidate) => candidate.id === Number(params.id));
      if (!occasion) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json({ ...summary(occasion), lists: occasion.lists ?? [] });
    }),
  );
}

/** A list as the `owned` scope returns it. */
function ownedList(overrides: Record<string, unknown>) {
  return sharedList({ owner_id: 1, owner_name: "Tom Boone", ...overrides });
}

/** A list as the `shared` scope returns it, source and all. */
function sharedList(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "A list",
    description: null,
    owner_id: 2,
    owner_name: "Jane Boone",
    recipient_name: null,
    recipient_has_account: null,
    is_archived: false,
    gift_count: 0,
    claimed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Serve the two scopes separately: only `shared` carries `shared_via`. */
function lists({ owned = [], shared = [] }: { owned?: unknown[]; shared?: unknown[] }) {
  server.use(
    http.get(`${API}/lists`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get("filter");
      return HttpResponse.json(filter === "shared" ? shared : owned);
    }),
  );
}

/** Lists inside the real nav shell, signed in as a simple-mode user. `authDelayMs`
 *  holds the silent refresh open so the lists land before the mode is known. */
function renderInSimpleMode({ authDelayMs = 0 } = {}) {
  server.use(
    http.post(`${API}/auth/refresh`, async () => {
      if (authDelayMs) await delay(authDelayMs);
      return HttpResponse.json({ access_token: simpleModeToken, token_type: "bearer" });
    }),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/lists"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/lists" element={<Lists />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderLists() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: fullModeToken, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <Lists />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )};
}

describe("Lists", () => {
  it("renders the actionable banner above the lists", async () => {
    noLists();
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderLists();

    const banner = await screen.findByRole("region", { name: "Waiting on you" });
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/wants to connect/)).toBeInTheDocument();

    // The banner precedes the lists heading in document order.
    const heading = screen.getByRole("heading", { name: /My Lists/ });
    expect(banner.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // Simple mode is purely subtractive, but the banner is the one surface it must
  // NOT subtract: with People hidden, /lists is the only route to these items.
  it("still renders the banner in simple mode, where People is hidden", async () => {
    noLists();
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderInSimpleMode();

    // Wait for the simple-mode session to be established.
    await screen.findByLabelText("Account menu");
    expect(screen.queryByRole("link", { name: /^People$/ })).not.toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Waiting on you" })).toBeInTheDocument();
    expect(screen.getByLabelText("Accept connection request from Dave Boone")).toBeInTheDocument();
  });

  // One section for every list shared with the viewer, labelled with its source:
  // "from Jane" for a direct share, the bare family name for a family grant
  // (NEU-1235). The source is a label, never a destination.
  it("labels each shared row with its source", async () => {
    lists({
      shared: [
        sharedList({ id: 1, name: "Jane's Wishlist", shared_via: { kind: "user", id: 2, name: "Jane Boone" } }),
        sharedList({
          id: 2, name: "Carol's Wishlist", owner_name: "Carol Boone",
          shared_via: { kind: "family", id: 1, name: "Boone Family" },
        }),
        sharedList({
          id: 3, name: "Beth's List", owner_name: "Tom Boone",
          recipient_name: "Beth", recipient_has_account: false,
          shared_via: { kind: "family", id: 1, name: "Boone Family" },
        }),
      ],
    });

    renderLists();

    expect(await screen.findByText("Jane's Wishlist")).toBeInTheDocument();
    expect(screen.getByText("from Jane Boone")).toBeInTheDocument();
    expect(screen.getByText("Boone Family")).toBeInTheDocument();
    // The absent-person form survives the source label.
    expect(screen.getByText("for Beth · kept by Tom Boone")).toBeInTheDocument();

    // A label and nothing more: no heading per family, and no route to one — the
    // rows link to their lists and nowhere else.
    expect(screen.queryByRole("heading", { name: "Boone Family" })).not.toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("/families"))).toBe(false);
  });

  it("renders shared lists flat, in the order the server returns", async () => {
    // The server has already merged and ordered the two grant paths, and the
    // default sort ("Most recent") is that same order — the page neither groups
    // the two paths nor re-orders them. Alphabetically ascending would put Adam
    // first, so this fails if either happens.
    lists({
      shared: [
        sharedList({
          id: 1, name: "Zoe's Wishlist", updated_at: "2026-02-01T00:00:00Z",
          shared_via: { kind: "user", id: 2, name: "Zoe" },
        }),
        sharedList({
          id: 2, name: "Adam's Wishlist", updated_at: "2026-01-01T00:00:00Z",
          shared_via: { kind: "family", id: 1, name: "Boone Family" },
        }),
      ],
    });

    renderLists();

    await screen.findByText("Zoe's Wishlist");
    const names = screen.getAllByText(/'s Wishlist$/).map((el) => el.textContent);
    expect(names).toEqual(["Zoe's Wishlist", "Adam's Wishlist"]);

    // One section holds both paths — there is no second list of rows.
    expect(screen.getAllByRole("list")).toHaveLength(1);
  });

  it("renders no banner region when nothing is pending", async () => {
    noLists();

    const { queryClient } = renderLists();

    await waitFor(() => {
      expect(queryClient.getQueryState(["connectionRequests"])?.status).toBe("success");
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
    });
    expect(screen.queryByRole("region", { name: "Waiting on you" })).not.toBeInTheDocument();
  });
});

describe("Lists — occasion filter", () => {
  it("offers the viewer's occasions, defaulting to all lists", async () => {
    noLists();
    occasions([{ id: 5, name: "Christmas 2026" }, { id: 6, name: "Birthdays" }]);

    renderLists();

    const filter = await screen.findByLabelText("Occasion");
    expect(filter).toHaveValue("all");
    expect(within(filter).getByRole("option", { name: "All lists" })).toBeInTheDocument();
    expect(within(filter).getByRole("option", { name: "Christmas 2026" })).toBeInTheDocument();
    expect(within(filter).getByRole("option", { name: "Birthdays" })).toBeInTheDocument();
  });

  // A select whose only option is "All lists" would be dead UI naming a concept
  // it cannot explain.
  it("hides the select itself when the viewer has no occasions", async () => {
    noLists();

    renderLists();

    await screen.findByLabelText("Sort");
    expect(screen.queryByLabelText("Occasion")).not.toBeInTheDocument();
  });

  // The occasions pages lost their route (NEU-1231), so this is the only
  // introduction to the concept — and a viewer with no occasions yet is exactly
  // the one who needs it, so the explanation does NOT hide with the select.
  it("explains what an occasion is, whether or not the viewer has any", async () => {
    noLists();
    occasions([{ id: 5, name: "Christmas 2026" }]);

    const { unmount } = renderLists();

    await screen.findByLabelText("Occasion");
    expect(screen.getByText(/Occasions group lists together/)).toBeInTheDocument();
    unmount();

    server.resetHandlers();
    noLists();
    renderLists();

    expect(await screen.findByText(/Occasions group lists together/)).toBeInTheDocument();
    // With none to pick from, it says where they come from instead.
    expect(screen.getByText(/Open a list to file it under one/)).toBeInTheDocument();
  });

  it("filters both sections at once", async () => {
    lists({
      owned: [ownedList({ id: 1, name: "Tom's Wishlist" }), ownedList({ id: 2, name: "Beth's List" })],
      shared: [
        sharedList({ id: 3, name: "Jane's Wishlist", shared_via: { kind: "user", id: 2, name: "Jane Boone" } }),
        sharedList({ id: 4, name: "Carol's Wishlist", shared_via: { kind: "family", id: 1, name: "Boone Family" } }),
      ],
    });
    occasions([{ id: 5, name: "Christmas 2026", lists: [{ id: 1 }, { id: 3 }] }]);

    renderLists();

    await userEvent.selectOptions(await screen.findByLabelText("Occasion"), "5");

    // One from each section survives; the other two are filtered out of both.
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Jane's Wishlist")).toBeInTheDocument();
    expect(screen.queryByText("Beth's List")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol's Wishlist")).not.toBeInTheDocument();
  });

  it("shows a list under each occasion it belongs to", async () => {
    lists({ owned: [ownedList({ id: 1, name: "Tom's Wishlist" })] });
    occasions([
      { id: 5, name: "Christmas 2026", lists: [{ id: 1 }] },
      { id: 6, name: "Birthdays", lists: [{ id: 1 }] },
    ]);

    renderLists();

    const filter = await screen.findByLabelText("Occasion");

    await userEvent.selectOptions(filter, "5");
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();

    await userEvent.selectOptions(filter, "6");
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();
  });

  it("says so per section when the filter matches nothing", async () => {
    lists({
      owned: [ownedList({ id: 1, name: "Tom's Wishlist" })],
      shared: [sharedList({ id: 3, name: "Jane's Wishlist", shared_via: { kind: "user", id: 2, name: "Jane Boone" } })],
    });
    occasions([{ id: 5, name: "Christmas 2026", lists: [] }]);

    renderLists();

    await userEvent.selectOptions(await screen.findByLabelText("Occasion"), "5");

    expect(await screen.findByText("None of your lists are in Christmas 2026.")).toBeInTheDocument();
    expect(screen.getByText("No lists shared with you are in Christmas 2026.")).toBeInTheDocument();
    // It is the filter that is empty, not the account — the create prompt would
    // be the wrong thing to say here.
    expect(screen.queryByText(/haven't created any lists yet/)).not.toBeInTheDocument();
  });
});

describe("Lists — sort and archive", () => {
  it("sorts both sections from the one header control", async () => {
    lists({
      owned: [
        ownedList({ id: 1, name: "Zoe's List", updated_at: "2026-02-01T00:00:00Z" }),
        ownedList({ id: 2, name: "Adam's List", updated_at: "2026-01-01T00:00:00Z" }),
      ],
      shared: [
        sharedList({ id: 3, name: "Zoe's Wishlist", updated_at: "2026-02-01T00:00:00Z", shared_via: { kind: "user", id: 2, name: "Zoe" } }),
        sharedList({ id: 4, name: "Adam's Wishlist", updated_at: "2026-01-01T00:00:00Z", shared_via: { kind: "user", id: 3, name: "Adam" } }),
      ],
    });

    renderLists();

    await userEvent.selectOptions(await screen.findByLabelText("Sort"), "name");

    const names = screen.getAllByText(/'s (List|Wishlist)$/).map((el) => el.textContent);
    expect(names).toEqual(["Adam's List", "Zoe's List", "Adam's Wishlist", "Zoe's Wishlist"]);
  });

  it("swaps to archived lists and back", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("filter") !== "owned") return HttpResponse.json([]);
        return HttpResponse.json(
          params.get("archived") === "true"
            ? [ownedList({ id: 9, name: "Last Christmas", is_archived: true })]
            : [ownedList({ id: 1, name: "Tom's Wishlist" })],
        );
      }),
    );

    renderLists();

    await screen.findByText("Tom's Wishlist");

    await userEvent.click(screen.getByRole("button", { name: "View archived lists" }));
    expect(await screen.findByText("Last Christmas")).toBeInTheDocument();
    expect(screen.queryByText("Tom's Wishlist")).not.toBeInTheDocument();
    // Creating a list is not an action you take while looking at archived ones.
    expect(screen.queryByRole("link", { name: "New List" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View active lists" }));
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();
  });
});

describe("Lists — simple mode", () => {
  // Purely subtractive: it hides the occasion filter, sort and archive, and
  // nothing else on this page (project spec §6.1).
  it("hides the occasion filter, sort and archive — and nothing else", async () => {
    lists({
      owned: [ownedList({ id: 1, name: "Tom's Wishlist" })],
      shared: [sharedList({ id: 3, name: "Jane's Wishlist", shared_via: { kind: "user", id: 2, name: "Jane Boone" } })],
    });
    occasions([{ id: 5, name: "Christmas 2026", lists: [{ id: 1 }] }]);

    renderInSimpleMode();

    await screen.findByLabelText("Account menu");
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();

    expect(screen.queryByLabelText("Occasion")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sort")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archived lists/ })).not.toBeInTheDocument();
    // The filter's explanation goes with the filter.
    expect(screen.queryByText(/Occasions group lists together/)).not.toBeInTheDocument();

    // Everything else on the page survives, unrelabelled.
    expect(screen.getByRole("link", { name: "New List" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /My Lists/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Shared with Me/ })).toBeInTheDocument();
    expect(screen.getByText("Jane's Wishlist")).toBeInTheDocument();
    expect(screen.getByText("from Jane Boone")).toBeInTheDocument();
  });

  // The lists resolve long before the silent refresh does, so "is this simple
  // mode?" is still unanswered while the page is already on screen. Guessing
  // "full" there flashes up exactly the controls simple mode must hide.
  it("withholds the controls until the session resolves", async () => {
    lists({ owned: [ownedList({ id: 1, name: "Tom's Wishlist" })] });
    occasions([{ id: 5, name: "Christmas 2026" }]);

    renderInSimpleMode({ authDelayMs: 100 });

    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sort")).not.toBeInTheDocument();

    // And they stay gone once the answer arrives.
    await screen.findByLabelText("Account menu");
    expect(screen.queryByLabelText("Sort")).not.toBeInTheDocument();
  });
});

describe("Lists — empty states", () => {
  it("offers to create a list when the viewer owns none", async () => {
    noLists();

    renderLists();

    expect(await screen.findByText(/haven't created any lists yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first list" })).toBeInTheDocument();
  });

  it("points a full-mode viewer at People when nothing is shared", async () => {
    noLists();

    renderLists();

    expect(await screen.findByText(/No one has shared a list with you yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a connection" })).toHaveAttribute("href", "/people");
  });

  // People is hidden in simple mode, so pointing at it would be a dead end.
  it("offers nothing actionable in simple mode when nothing is shared", async () => {
    noLists();

    renderInSimpleMode();

    await screen.findByLabelText("Account menu");
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /^People$/ })).not.toBeInTheDocument();
    });

    expect(await screen.findByText("No one has shared a list with you yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add a connection" })).not.toBeInTheDocument();
  });

  it("says there are no archived lists when the archive is empty", async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("filter") !== "owned" || params.get("archived") === "true") {
          return HttpResponse.json([]);
        }
        return HttpResponse.json([ownedList({ id: 1, name: "Tom's Wishlist" })]);
      }),
    );

    renderLists();

    await screen.findByText("Tom's Wishlist");
    await userEvent.click(screen.getByRole("button", { name: "View archived lists" }));

    expect(await screen.findByText("No archived lists.")).toBeInTheDocument();
    expect(screen.getByText("No archived lists shared with you.")).toBeInTheDocument();
  });
});
