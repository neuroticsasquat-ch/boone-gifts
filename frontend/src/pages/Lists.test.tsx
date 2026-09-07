import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
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

const simpleModeToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
  "fake-signature",
].join(".");

function noLists() {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([])));
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

/** Lists inside the real nav shell, signed in as a simple-mode user. */
function renderInSimpleMode() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: simpleModeToken, token_type: "bearer" })
    ),
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Lists />
      </MemoryRouter>
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
