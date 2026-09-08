import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Layout } from "./Layout";

const API = "https://boone-gifts-api.localhost";

const token = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const simpleModeToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
  "fake-signature",
].join(".");

const familyInvite = {
  id: 1,
  token: "tok-abc",
  role: "member",
  family: { id: 10, name: "Smith Family" },
  invited_by: { id: 20, name: "Alice" },
  expires_at: "2026-07-05T00:00:00Z",
  created_at: "2026-06-28T00:00:00Z",
};

const connectionRequest = {
  id: 5,
  status: "pending",
  user: { id: 20, name: "Alice", email: "alice@test.com" },
  created_at: "2026-06-28T00:00:00Z",
};

function renderLayout(sessionToken = token, initialEntry = "/lists") {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: sessionToken, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/lists" element={<div>Lists Content</div>} />
              <Route path="/lists/:id" element={<div>List Detail Content</div>} />
              <Route path="/people" element={<div>People Content</div>} />
              <Route path="/people/:id" element={<div>Person Content</div>} />
              <Route path="/people/families/:id" element={<div>Family Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const renderSimpleLayout = () => renderLayout(simpleModeToken);

function topNav() {
  return screen.getByRole("navigation", { name: "Primary navigation" });
}

function bottomNav() {
  return screen.getByRole("navigation", { name: "Mobile navigation" });
}

describe("Layout", () => {
  it("renders the same two tabs in the bottom tab bar and the top nav", async () => {
    renderLayout();
    await screen.findByLabelText("Account menu");

    expect(within(bottomNav()).getByText("Lists")).toBeInTheDocument();
    expect(within(bottomNav()).getByText("People")).toBeInTheDocument();
    expect(within(topNav()).getByText("Lists")).toBeInTheDocument();
    expect(within(topNav()).getByText("People")).toBeInTheDocument();
  });

  it("no longer renders the retired destinations", async () => {
    renderLayout();
    await screen.findByLabelText("Account menu");

    for (const label of ["Home", "Connect", "Connections", "Families", "Family Lists", "Folders"]) {
      expect(within(bottomNav()).queryByText(label)).not.toBeInTheDocument();
      expect(within(topNav()).queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("points the brand link at /lists", async () => {
    renderLayout();
    const brand = await screen.findByRole("link", { name: /Boone Gifts/ });
    expect(brand).toHaveAttribute("href", "/lists");
  });

  it("highlights the tab matching the current route", async () => {
    renderLayout(token, "/people");
    await screen.findByText("People Content");

    const peopleTab = within(bottomNav()).getByRole("link", { name: /People/ });
    const listsTab = within(bottomNav()).getByRole("link", { name: /Lists/ });
    expect(peopleTab).toHaveClass("text-blue-600");
    expect(listsTab).not.toHaveClass("text-blue-600");
  });

  // "Every remaining route highlights a tab" — the sub-paths are the whole
  // point of matching on a prefix rather than an exact path.
  it.each([
    ["/lists", "Lists Content", /Lists/],
    ["/lists/5", "List Detail Content", /Lists/],
    ["/people", "People Content", /People/],
    ["/people/7", "Person Content", /People/],
    ["/people/families/3", "Family Content", /People/],
  ])("highlights a tab on %s", async (path, content, tabName) => {
    renderLayout(token, path);
    await screen.findByText(content);
    expect(within(bottomNav()).getByRole("link", { name: tabName })).toHaveClass("text-blue-600");
  });

  it("renders account menu button", async () => {
    renderLayout();
    expect(await screen.findByLabelText("Account menu")).toBeInTheDocument();
  });

  it("opens account dropdown when clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(await screen.findByLabelText("Account menu"));
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("shows email in account dropdown", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(await screen.findByLabelText("Account menu"));
    expect(screen.getAllByText("user@test.com").length).toBeGreaterThanOrEqual(1);
  });

  it("closes dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(await screen.findByLabelText("Account menu"));
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByText("Account Settings")).not.toBeInTheDocument();
    });
  });

  it("badges Lists with the unseen share count", async () => {
    server.use(
      http.get(`${API}/lists/unseen-count`, () => HttpResponse.json({ count: 3 })),
    );
    renderLayout();
    await screen.findByLabelText("Account menu");

    await waitFor(() => {
      const listsTab = within(bottomNav()).getByRole("link", { name: /Lists/ });
      expect(within(listsTab).getByText("3")).toBeInTheDocument();
    });
    const listsLink = within(topNav()).getByRole("link", { name: /Lists/ });
    expect(within(listsLink).getByText("3")).toBeInTheDocument();
  });

  it("badges People with connection requests plus family invites combined", async () => {
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([connectionRequest])),
      http.get(`${API}/families/invites`, () => HttpResponse.json([familyInvite])),
    );
    renderLayout();
    await screen.findByLabelText("Account menu");

    await waitFor(() => {
      const peopleTab = within(bottomNav()).getByRole("link", { name: /People/ });
      expect(within(peopleTab).getByText("2")).toBeInTheDocument();
    });
    const peopleLink = within(topNav()).getByRole("link", { name: /People/ });
    expect(within(peopleLink).getByText("2")).toBeInTheDocument();
  });

  it("shows no badges when nothing is pending", async () => {
    renderLayout();
    await screen.findByLabelText("Account menu");
    await waitFor(() => {
      expect(within(topNav()).queryByText("1")).not.toBeInTheDocument();
      expect(within(bottomNav()).queryByText("1")).not.toBeInTheDocument();
    });
  });

  it("simple-mode: renders only the Lists tab in both navs", async () => {
    renderSimpleLayout();
    await screen.findByLabelText("Account menu");

    expect(within(bottomNav()).getByText("Lists")).toBeInTheDocument();
    expect(within(bottomNav()).queryByText("People")).not.toBeInTheDocument();
    expect(within(topNav()).getByText("Lists")).toBeInTheDocument();
    expect(within(topNav()).queryByText("People")).not.toBeInTheDocument();
  });

  it("simple-mode: keeps the same label, not a simple-mode-only one", async () => {
    renderSimpleLayout();
    await screen.findByLabelText("Account menu");
    expect(within(bottomNav()).queryByText("My Lists")).not.toBeInTheDocument();
  });

  it("simple-mode: People collapses into the account menu", async () => {
    const user = userEvent.setup();
    renderSimpleLayout();
    await screen.findByLabelText("Account menu");
    expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Account menu"));
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute("href", "/people");
  });

  it("full mode: opening the account menu adds no second People link", async () => {
    const user = userEvent.setup();
    renderLayout();
    await screen.findByLabelText("Account menu");
    const before = screen.getAllByRole("link", { name: "People" }).length;

    await user.click(screen.getByLabelText("Account menu"));
    expect(screen.getAllByRole("link", { name: "People" })).toHaveLength(before);
  });
});
