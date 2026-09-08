import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
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

const listFamilies = [
  { id: 7, name: "The Boones", shared: true },
  { id: 8, name: "The Smiths", shared: false },
];

/** Everything the panel reads, so a test only overrides what it cares about. */
function serveSharingState({
  shares = [] as { id: number; list_id: number; user_id: number; created_at: string }[],
  families = listFamilies,
} = {}) {
  server.use(
    http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    http.get(`${API}/lists/1/shares`, () => HttpResponse.json(shares)),
    http.get(`${API}/lists/1/families`, () => HttpResponse.json(families)),
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
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

describe("SharingPanel — one panel for people and families", () => {
  it("puts both groups in a single panel, people first", async () => {
    serveSharingState();

    renderPanel();

    const panel = await screen.findByRole("region", { name: "Who can see this list" });
    const headings = within(panel)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["People", "Families"]);

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
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
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
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
    );

    renderPanel();

    expect(await screen.findByText(/don't have any connections/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a connection/i })).toHaveAttribute("href", "/people");
  });
});

describe("SharingPanel — families", () => {
  it("renders one toggle per family, reflecting its shared state", async () => {
    serveSharingState();

    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with the smiths/i })).not.toBeChecked();
  });

  it("toggling a family on PUTs the grant", async () => {
    const shared = vi.fn();
    serveSharingState();
    server.use(
      http.put(`${API}/lists/1/families/8`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the smiths/i }));
    await waitFor(() => expect(shared).toHaveBeenCalled());
  });

  it("toggling a family off DELETEs the grant with no claims param", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith(null));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the release/keep dialog on a 409, with no counts or names", async () => {
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/families/7`, () =>
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

  it("re-issues the request with claims=release", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /release those claims/i }));

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith("release"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("re-issues the request with claims=keep", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderPanel();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /keep them claimed/i }));

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith("keep"));
  });

  it("cancelling the dialog leaves the grant in place", async () => {
    const revoked = vi.fn();
    serveSharingState();
    server.use(
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
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
    serveSharingState({ families: [] });

    renderPanel();

    expect(await screen.findByText(/don't belong to any families/i)).toBeInTheDocument();
  });
});
