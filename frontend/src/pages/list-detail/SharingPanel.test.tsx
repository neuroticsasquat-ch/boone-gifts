import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import toast, { Toaster } from "react-hot-toast";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { SharingPanel } from "./SharingPanel";

const API = "https://boone-gifts-api.localhost";

const ownerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const connections = [
  {
    id: 5,
    status: "accepted",
    user: { id: 2, name: "Alice", email: "alice@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
  {
    id: 6,
    status: "accepted",
    user: { id: 3, name: "Bob", email: "bob@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
];

/**
 * One family of each shape the control has to render (project spec §5.2).
 *
 * Every family holds the owner and nobody else, so no connection is covered
 * here: coverage is what disables a People row, and a test that cares about it
 * says so by serving its own targets.
 */
const shareTargets = [
  {
    id: 7,
    name: "The Boones",
    member_ids: [1],
    occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
  },
  {
    id: 8,
    name: "The Smiths",
    member_ids: [1],
    occasions: [{ id: 20, name: "Easter 2026", is_archived: false, shared: false }],
  },
  {
    id: 9,
    name: "The Joneses",
    member_ids: [1],
    occasions: [
      { id: 31, name: "Jones Christmas", is_archived: false, shared: false },
      { id: 32, name: "Jones Birthdays", is_archived: false, shared: false },
    ],
  },
  { id: 11, name: "Work Friends", member_ids: [1], occasions: [] },
];

/** Everything the panel reads, so a test only overrides what it cares about. */
function serveSharingState({
  shares = [] as { id: number; list_id: number; user_id: number; created_at: string }[],
  targets = shareTargets,
} = {}) {
  server.use(
    http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    http.get(`${API}/lists/1/shares`, () => HttpResponse.json(shares)),
    http.get(`${API}/lists/1/families`, () => HttpResponse.json(targets)),
  );
}

function renderPanel(onClose = vi.fn()) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: ownerToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <SharingPanel listId={1} queryClient={queryClient} onClose={onClose} />
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

describe("SharingPanel — one panel for people and families", () => {
  it("puts both groups in a single panel, families first", async () => {
    // The order is deliberate, not incidental: families is the broader stroke,
    // and it decides what the People rows can even offer (NEU-1284).
    serveSharingState();

    renderPanel();

    const panel = await screen.findByRole("region", { name: "Who can see this list" });
    const headings = within(panel)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Families", "People"]);

    expect(await within(panel).findByRole("checkbox", { name: /share with alice/i })).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /share with the boones/i })).toBeInTheDocument();
  });

  it("closes on Done", async () => {
    serveSharingState();

    const { onClose } = renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SharingPanel — people", () => {
  it("checks the connections the list is already shared with", async () => {
    serveSharingState({ shares: [{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }] });

    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /share with alice/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with bob/i })).not.toBeChecked();
  });

  it("checking a person POSTs the share", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.post(`${API}/lists/1/shares`, async ({ request }) => {
        shared(await request.json());
        return HttpResponse.json(
          { id: 1, list_id: 1, user_id: 3, created_at: "2026-01-01" },
          { status: 201 },
        );
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with bob/i }));
    await waitFor(() => expect(shared).toHaveBeenCalledWith({ user_id: 3 }));
  });

  it("unchecking a person DELETEs the share", async () => {
    const revoked = vi.fn();
    serveSharingState({ shares: [{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }] });
    server.use(
      http.delete(`${API}/lists/1/shares/2`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with alice/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("keeps a revokable row for a share held by someone no longer connected", async () => {
    // The header summary still reads "Shared with User 42", and this panel is
    // the only place to switch that off — so it has to offer the row.
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 42, created_at: "2026-01-01" }])
      ),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
      http.delete(`${API}/lists/1/shares/42`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    const row = await screen.findByRole("checkbox", { name: /share with user 42/i });
    expect(row).toBeChecked();

    await userEvent.click(row);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("says so when there are no connections, and points at People", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(shareTargets)),
    );

    renderPanel();

    expect(await screen.findByText(/don't have any connections/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a connection/i })).toHaveAttribute("href", "/people");
  });
});

describe("SharingPanel — people an occasion share already reaches", () => {
  /** The Boones, reaching Bob (user 3) through a live occasion. */
  const boonesCoveringBob = {
    id: 7,
    name: "The Boones",
    member_ids: [1, 3],
    occasions: [{ id: 10, name: "Christmas 2026", is_archived: false, shared: true }],
  };

  it("disables an unshared connection the family already reaches, and names the family", async () => {
    serveSharingState({ targets: [boonesCoveringBob] });

    renderPanel();

    const box = await screen.findByRole("checkbox", { name: /share with bob/i });
    expect(box).toBeDisabled();
    expect(screen.getByText("Already sees this through The Boones")).toBeInTheDocument();
    // The reason replaces the email: it is why the control is dead, and the
    // email was only decoration.
    expect(screen.queryByText("bob@test.com")).not.toBeInTheDocument();

    // A connection no family reaches is untouched.
    expect(screen.getByRole("checkbox", { name: /share with alice/i })).toBeEnabled();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });

  it("names every family that covers a person", async () => {
    // Naming only the first would send the owner to untick a family that leaves
    // the row disabled anyway.
    serveSharingState({
      targets: [
        boonesCoveringBob,
        {
          id: 8,
          name: "The Smiths",
          member_ids: [1, 3],
          occasions: [{ id: 20, name: "Easter 2026", is_archived: false, shared: true }],
        },
      ],
    });

    renderPanel();

    expect(
      await screen.findByText("Already sees this through The Boones and The Smiths"),
    ).toBeInTheDocument();
  });

  it("leaves a connection reached only by an archived share operable, and unannotated", async () => {
    // An archived share still grants sight, but that route is winding down, so
    // the direct share is the useful thing to offer — and the row says nothing
    // about a state most owners never reach.
    serveSharingState({
      targets: [
        {
          id: 7,
          name: "The Boones",
          member_ids: [1, 3],
          occasions: [{ id: 10, name: "Christmas 2025", is_archived: true, shared: true }],
        },
      ],
    });

    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /share with bob/i })).toBeEnabled();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();
  });

  it("keeps a direct share operable and revokable while a family covers the same person", async () => {
    // You can always remove a grant; you just cannot add a redundant one. This
    // panel is the only revoke surface there is.
    const revoked = vi.fn();
    serveSharingState({
      shares: [{ id: 1, list_id: 1, user_id: 3, created_at: "2026-01-01" }],
      targets: [boonesCoveringBob],
    });
    server.use(
      http.delete(`${API}/lists/1/shares/3`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    const box = await screen.findByRole("checkbox", { name: /share with bob/i });
    expect(box).toBeChecked();
    expect(box).toBeEnabled();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();

    await userEvent.click(box);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("re-enables the row when the covering family is unticked, with no reload", async () => {
    // Both halves read the same share-targets query, so the untick's
    // invalidation repaints the People row on its own.
    let shared = true;
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json(connections)),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/families`, () =>
        HttpResponse.json([
          { ...boonesCoveringBob, occasions: [{ ...boonesCoveringBob.occasions[0], shared }] },
        ])
      ),
      http.delete(`${API}/lists/1/occasions/10`, () => {
        shared = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /share with bob/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the boones/i }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /share with bob/i })).toBeEnabled()
    );
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });
});

describe("SharingPanel — families", () => {
  // react-hot-toast keeps its queue at module level, so a toast raised by one
  // test outlives `cleanup()` and shows up in the next one.
  beforeEach(() => toast.remove());

  it("names the occasion a family with one is reached through, and shares to it", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/20`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    // One occasion is displayed, not offered: no select, and one click shares.
    expect(await screen.findByText("Easter 2026")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /occasion for the smiths/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /share with the smiths/i }));
    await waitFor(() => expect(shared).toHaveBeenCalled());
  });

  it("checks the family whose occasion already holds the share, and names it", async () => {
    serveSharingState();

    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
    expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /share with the smiths/i })).not.toBeChecked();
  });

  it("disables a family with no active occasion and says why", async () => {
    serveSharingState();

    renderPanel();

    const box = await screen.findByRole("checkbox", { name: /share with work friends/i });
    expect(box).toBeDisabled();
    expect(screen.getByText(/no active occasion/i)).toBeInTheDocument();
  });

  it("refuses a tick on a family with several occasions until one is chosen", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/:occasionId`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the joneses/i }));

    expect(await screen.findByText(/choose an occasion to share with the joneses/i)).toBeInTheDocument();
    expect(shared).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /share with the joneses/i })).not.toBeChecked();
  });

  it("shares to the occasion chosen in the select", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/:occasionId`, ({ params }) => {
        shared(params.occasionId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    const select = await screen.findByRole("combobox", { name: /occasion for the joneses/i });
    await userEvent.selectOptions(select, "32");
    await userEvent.click(screen.getByRole("checkbox", { name: /share with the joneses/i }));

    await waitFor(() => expect(shared).toHaveBeenCalledWith("32"));
  });

  it("keeps the select on a shared family, disabled and naming the occasion", async () => {
    // The wireframe draws a ticked row still carrying its select (project spec
    // §5.2): the row keeps one shape as the box is ticked. Disabled, because
    // re-pointing a share is untick-then-tick — the only order in which the
    // claims question can be asked.
    serveSharingState({
      targets: [
        {
          id: 9,
          name: "The Joneses",
          member_ids: [1],
          occasions: [
            { id: 31, name: "Jones Christmas", is_archived: false, shared: true },
            { id: 32, name: "Jones Birthdays", is_archived: false, shared: false },
          ],
        },
      ],
    });

    renderPanel();

    const select = await screen.findByRole("combobox", { name: /occasion for the joneses/i });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("31");
    expect(screen.getByRole("checkbox", { name: /share with the joneses/i })).toBeChecked();
    // Nothing to choose while shared, so no placeholder offering one.
    expect(screen.queryByRole("option", { name: /choose an occasion/i })).not.toBeInTheDocument();
  });

  it("says an occasion archived out from under the owner cannot be shared to", async () => {
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/occasions/20`, () =>
        HttpResponse.json(
          { detail: "This occasion is archived and can no longer be shared to." },
          { status: 409 },
        )
      ),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the smiths/i }));

    // A 409 here is the one thing the owner can act on, so it must not arrive as
    // the generic failure toast.
    expect(await screen.findByText(/has been archived/i)).toBeInTheDocument();
  });

  it("toggling a family off DELETEs its occasion's share with no claims param", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith(null));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can still unshare from an occasion archived after the share was made", async () => {
    // Archiving is not unsharing, so the row stays operable — and it is the only
    // way the owner has of switching that grant off.
    const revoked = vi.fn();
    serveSharingState({
      targets: [
        {
          id: 7,
          name: "The Boones",
          member_ids: [1],
          occasions: [{ id: 10, name: "Christmas 2025", is_archived: true, shared: true }],
        },
      ],
    });
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    const box = await screen.findByRole("checkbox", { name: /share with the boones/i });
    expect(box).toBeEnabled();
    expect(screen.getByText(/christmas 2025 — archived/i)).toBeInTheDocument();

    await userEvent.click(box);
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("shows the release/keep dialog on a 409, with no counts or names", async () => {
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, () =>
        HttpResponse.json(
          { detail: "Some gifts on this list are claimed by members of this family." },
          { status: 409 },
        )
      ),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Some gifts are claimed");
    expect(screen.getByRole("button", { name: /release those claims/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep them claimed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    // The owner is blind to claim state: no count, no gift name, no claimer name.
    expect(dialog).not.toHaveTextContent(/\d/);
  });

  it.each(["release", "keep"] as const)("re-issues the request with claims=%s", async (choice) => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: choice === "release" ? /release those claims/i : /keep them claimed/i,
      }),
    );

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith(choice));
  });

  it("cancelling the dialog leaves the grant in place", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/occasions/10`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
  });

  it("says so when the owner belongs to no families", async () => {
    serveSharingState({ targets: [] });

    renderPanel();

    expect(await screen.findByText(/don't belong to any families/i)).toBeInTheDocument();
  });
});
