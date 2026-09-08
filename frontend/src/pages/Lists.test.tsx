import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
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

const authToken = token({});

function noLists() {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([])));
}

/** The viewer's folders: what the filter's `<select>` lists, and what each one
 *  reports as its member lists when selected. */
function folders(all: { id: number; name: string; lists?: unknown[] }[]) {
  const summary = (folder: { id: number; name: string }) => ({
    id: folder.id,
    name: folder.name,
    description: null,
    owner_id: 1,
    is_archived: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  server.use(
    http.get(`${API}/folders`, () => HttpResponse.json(all.map(summary))),
    http.get(`${API}/folders/:id`, ({ params }) => {
      const folder = all.find((candidate) => candidate.id === Number(params.id));
      if (!folder) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json({ ...summary(folder), lists: folder.lists ?? [] });
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

function renderLists() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
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
          recipient_name: "Beth",
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

describe("Lists — folder filter", () => {
  it("offers the viewer's folders, defaulting to all lists", async () => {
    noLists();
    folders([{ id: 5, name: "Christmas 2026" }, { id: 6, name: "Birthdays" }]);

    renderLists();

    const filter = await screen.findByLabelText("Folder");
    expect(filter).toHaveValue("all");
    expect(within(filter).getByRole("option", { name: "All lists" })).toBeInTheDocument();
    expect(within(filter).getByRole("option", { name: "Christmas 2026" })).toBeInTheDocument();
    expect(within(filter).getByRole("option", { name: "Birthdays" })).toBeInTheDocument();
  });

  // A select whose only option is "All lists" would be dead UI naming a concept
  // it cannot explain.
  it("hides the select itself when the viewer has no folders", async () => {
    noLists();

    renderLists();

    await screen.findByLabelText("Sort");
    expect(screen.queryByLabelText("Folder")).not.toBeInTheDocument();
  });

  // The folders pages lost their route (NEU-1231), so this is the only
  // introduction to the concept — and a viewer with no folders yet is exactly
  // the one who needs it, so the explanation does NOT hide with the select.
  it("explains what a folder is, whether or not the viewer has any", async () => {
    noLists();
    folders([{ id: 5, name: "Christmas 2026" }]);

    const { unmount } = renderLists();

    await screen.findByLabelText("Folder");
    expect(screen.getByText(/Folders group lists together/)).toBeInTheDocument();
    unmount();

    server.resetHandlers();
    noLists();
    renderLists();

    expect(await screen.findByText(/Folders group lists together/)).toBeInTheDocument();
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
    folders([{ id: 5, name: "Christmas 2026", lists: [{ id: 1 }, { id: 3 }] }]);

    renderLists();

    await userEvent.selectOptions(await screen.findByLabelText("Folder"), "5");

    // One from each section survives; the other two are filtered out of both.
    expect(await screen.findByText("Tom's Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Jane's Wishlist")).toBeInTheDocument();
    expect(screen.queryByText("Beth's List")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol's Wishlist")).not.toBeInTheDocument();
  });

  it("shows a list under each folder it belongs to", async () => {
    lists({ owned: [ownedList({ id: 1, name: "Tom's Wishlist" })] });
    folders([
      { id: 5, name: "Christmas 2026", lists: [{ id: 1 }] },
      { id: 6, name: "Birthdays", lists: [{ id: 1 }] },
    ]);

    renderLists();

    const filter = await screen.findByLabelText("Folder");

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
    folders([{ id: 5, name: "Christmas 2026", lists: [] }]);

    renderLists();

    await userEvent.selectOptions(await screen.findByLabelText("Folder"), "5");

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

describe("Lists — empty states", () => {
  it("offers to create a list when the viewer owns none", async () => {
    noLists();

    renderLists();

    expect(await screen.findByText(/haven't created any lists yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first list" })).toBeInTheDocument();
  });

  it("points the viewer at People when nothing is shared", async () => {
    noLists();

    renderLists();

    expect(await screen.findByText(/No one has shared a list with you yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a connection" })).toHaveAttribute("href", "/people");
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

describe("Lists — shared account labels", () => {
  // On a shared account the owner's own rows say which of the account's people
  // each list is for (NEU-1237). A household list says nothing, which is the
  // same as every row on a non-shared account.
  it("labels an owned row with the person it is marked for", async () => {
    lists({
      owned: [
        ownedList({
          id: 1, name: "Gran's List",
          account_person_id: 4, account_person_name: "Gran",
        }),
        ownedList({ id: 2, name: "Christmas 2026" }),
      ],
    });

    renderLists();

    expect(await screen.findByText("Gran's List")).toBeInTheDocument();
    expect(screen.getByText("for Gran")).toBeInTheDocument();
    expect(screen.getAllByText(/^for /)).toHaveLength(1);
  });
});
