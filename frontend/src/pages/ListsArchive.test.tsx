import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../test/arrived-from";
import { ListsArchive } from "./ListsArchive";

const API = "https://boone-gifts-api.localhost";

const authToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

function list(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "A list",
    description: null,
    owner_id: 2,
    owner_name: "Jane Boone",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: true,
    gift_count: 0,
    claimed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function folder(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "A folder",
    description: null,
    owner_id: 1,
    is_archived: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The three reads the page makes, each answering only what it was asked for. */
function archive({
  owned = [],
  shared = [],
  folders = [],
}: { owned?: unknown[]; shared?: unknown[]; folders?: unknown[] } = {}) {
  server.use(
    http.get(`${API}/lists`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      if (params.get("archived") !== "true") return HttpResponse.json([]);
      return HttpResponse.json(params.get("filter") === "shared" ? shared : owned);
    }),
    http.get(`${API}/folders`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      return HttpResponse.json(params.get("archived") === "true" ? folders : []);
    }),
  );
}

/** `arriveFrom` starts the session on another page, so that pushing into the
 *  archive from it is a real in-app push and the back control is at depth > 0. */
function renderArchive({ arriveFrom }: { arriveFrom?: string } = {}) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[arriveFrom ?? "/lists/archive"]}>
          <NavigationDepthProvider>
            <Routes>
              <Route path="/lists/archive" element={<ListsArchive />} />
              <Route path="*" element={<ArrivedFrom to="/lists/archive" />} />
            </Routes>
          </NavigationDepthProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function sectionFor(heading: string) {
  return within(screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement);
}

describe("ListsArchive", () => {
  // The one deliberate way in to everything archived, and it asks for archived
  // things only (project spec §9.5).
  it("lists archived lists, archived shared lists and archived folders", async () => {
    archive({
      owned: [list({ id: 1, name: "Last Christmas", owner_id: 1, owner_name: "Tom Boone" })],
      shared: [list({ id: 2, name: "Jane's Old Wishlist", shared_via: [{ kind: "direct", person: { id: 2, name: "Jane" } }] })],
      folders: [folder({ id: 5, name: "Christmas 2025" })],
    });

    renderArchive();

    expect(await screen.findByText("Last Christmas")).toBeInTheDocument();
    expect(sectionFor("Archived Lists Shared with Me").getByText("Jane's Old Wishlist")).toBeInTheDocument();
    expect(sectionFor("Archived Folders").getByText("Christmas 2025")).toBeInTheDocument();
  });

  // Nothing is unarchived from here: the rows lead to the pages that already
  // own that control, so there is exactly one implementation of each.
  it("links every row to the page that can bring it back", async () => {
    archive({
      owned: [list({ id: 1, name: "Last Christmas", owner_id: 1, owner_name: "Tom Boone" })],
      folders: [folder({ id: 5, name: "Christmas 2025" })],
    });

    renderArchive();

    expect(await screen.findByRole("link", { name: /Last Christmas/ })).toHaveAttribute("href", "/lists/1");
    expect(screen.getByRole("link", { name: /Christmas 2025/ })).toHaveAttribute("href", "/folders/5");
    expect(screen.queryByRole("button", { name: "Unarchive" })).not.toBeInTheDocument();
  });

  it("names the lists dashboard when it was deep-linked into", async () => {
    archive();

    renderArchive();

    expect(await screen.findByRole("link", { name: "← Back to Lists" })).toHaveAttribute(
      "href",
      "/lists",
    );
  });

  // Arrived from a list rather than from the dashboard: Back is where the viewer
  // came from, and the control stops claiming otherwise.
  it("returns to the page it was opened from, and says only Back", async () => {
    archive();

    renderArchive({ arriveFrom: "/lists/1" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    await userEvent.click(await screen.findByRole("button", { name: "← Back" }));

    expect(screen.getByRole("button", { name: "arrive" })).toBeInTheDocument();
  });

  // One line rather than three "No archived …" ones, since an empty archive is
  // the ordinary case.
  it("says the archive is empty once, when all three reads come back empty", async () => {
    archive();

    renderArchive();

    expect(await screen.findByText(/haven't archived anything yet/)).toBeInTheDocument();
    expect(screen.queryByText("No archived lists.")).not.toBeInTheDocument();
  });

  it("says which half is empty when the other half is not", async () => {
    archive({ folders: [folder({ id: 5, name: "Christmas 2025" })] });

    renderArchive();

    expect(await screen.findByText("No archived lists.")).toBeInTheDocument();
    expect(screen.getByText("No archived lists shared with you.")).toBeInTheDocument();
    expect(screen.queryByText(/haven't archived anything yet/)).not.toBeInTheDocument();
  });

  // A read that failed is not an empty one — the repo's standing rule. Saying
  // "nothing is archived" here would be a claim the page cannot make.
  it("says a section failed rather than calling it empty", async () => {
    archive({ owned: [list({ id: 1, name: "Last Christmas", owner_id: 1, owner_name: "Tom Boone" })] });
    server.use(http.get(`${API}/folders`, () => new HttpResponse(null, { status: 500 })));

    renderArchive();

    expect(await screen.findByText("Your archived folders couldn't be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No archived folders.")).not.toBeInTheDocument();
    expect(screen.queryByText(/haven't archived anything yet/)).not.toBeInTheDocument();
    // The sections that did answer still render.
    expect(screen.getByText("Last Christmas")).toBeInTheDocument();
  });
});
