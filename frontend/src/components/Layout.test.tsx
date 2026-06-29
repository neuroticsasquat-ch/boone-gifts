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

function renderLayout() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div>Home Content</div>} />
              <Route path="/lists" element={<div>Lists Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderSimpleLayout() {
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
              <Route path="/lists" element={<div>Lists Content</div>} />
              <Route path="/family-lists" element={<div>Family Lists Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("Layout", () => {
  it("renders bottom tab bar with nav links", async () => {
    renderLayout();
    await screen.findByLabelText("Account menu");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getAllByText("Lists").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("Collect")).toBeInTheDocument();
  });

  it("renders account menu button", async () => {
    renderLayout();
    const accountButton = await screen.findByLabelText("Account menu");
    expect(accountButton).toBeInTheDocument();
  });

  it("opens account dropdown when clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const accountButton = await screen.findByLabelText("Account menu");
    await user.click(accountButton);
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("shows email in account dropdown", async () => {
    const user = userEvent.setup();
    renderLayout();
    const accountButton = await screen.findByLabelText("Account menu");
    await user.click(accountButton);
    const emails = screen.getAllByText("user@test.com");
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it("closes dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    renderLayout();
    const accountButton = await screen.findByLabelText("Account menu");
    await user.click(accountButton);
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByText("Account Settings")).not.toBeInTheDocument();
    });
  });

  it("renders desktop nav links in the header", async () => {
    renderLayout();
    await screen.findByText("Home Content");
    const topNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(topNav).toHaveTextContent("Lists");
    expect(topNav).toHaveTextContent("Connections");
    expect(topNav).toHaveTextContent("Collections");
  });

  it("renders Boone Gifts brand link", async () => {
    renderLayout();
    await screen.findByText("Boone Gifts");
    expect(screen.getByText("Boone Gifts")).toBeInTheDocument();
  });

  it("shows family invite badge on Families tab in bottom nav when invites are pending", async () => {
    server.use(
      http.get(`${API}/families/invites`, () =>
        HttpResponse.json([{
          id: 1, token: "tok-abc", role: "member",
          family: { id: 10, name: "Smith Family" },
          invited_by: { id: 20, name: "Alice" },
          expires_at: "2026-07-05T00:00:00Z",
          created_at: "2026-06-28T00:00:00Z",
        }])
      ),
    );
    renderLayout();
    await screen.findByLabelText("Account menu");
    await waitFor(() => {
      // Badge with count 1 should appear in the bottom mobile nav bar
      const bottomNav = screen.getByRole("navigation", { name: "Mobile navigation" });
      expect(within(bottomNav).getByText("1")).toBeInTheDocument();
    });
  });

  it("hides family invite badge on Families tab when no invites are pending", async () => {
    // Default handler returns [] — badge must not appear
    renderLayout();
    await screen.findByLabelText("Account menu");
    // Wait for queries to settle then verify no badge with count appears in either nav
    await waitFor(() => {
      const topNav = screen.getByRole("navigation", { name: "Primary navigation" });
      const bottomNav = screen.getByRole("navigation", { name: "Mobile navigation" });
      expect(within(topNav).queryByText("1")).not.toBeInTheDocument();
      expect(within(bottomNav).queryByText("1")).not.toBeInTheDocument();
    });
  });

  it("shows family invite badge on Families link in top nav when invites are pending", async () => {
    server.use(
      http.get(`${API}/families/invites`, () =>
        HttpResponse.json([{
          id: 1, token: "tok-abc", role: "member",
          family: { id: 10, name: "Smith Family" },
          invited_by: { id: 20, name: "Alice" },
          expires_at: "2026-07-05T00:00:00Z",
          created_at: "2026-06-28T00:00:00Z",
        }])
      ),
    );
    renderLayout();
    await screen.findByLabelText("Account menu");
    await waitFor(() => {
      // The top nav Families link has an inline badge span
      const topNav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(topNav).toHaveTextContent("Families");
      expect(within(topNav).getByText("1")).toBeInTheDocument();
    });
  });

  it("simple-mode: bottom tab bar shows only My Lists and Family Lists", async () => {
    renderSimpleLayout();
    await screen.findByLabelText("Account menu");
    const bottomNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(bottomNav).getByText("My Lists")).toBeInTheDocument();
    expect(within(bottomNav).getByText("Family Lists")).toBeInTheDocument();
    expect(within(bottomNav).queryByText("Home")).not.toBeInTheDocument();
    expect(within(bottomNav).queryByText("Connect")).not.toBeInTheDocument();
    expect(within(bottomNav).queryByText("Families")).not.toBeInTheDocument();
    expect(within(bottomNav).queryByText("Collect")).not.toBeInTheDocument();
  });

  it("simple-mode: top nav shows My Lists and Family Lists links only", async () => {
    renderSimpleLayout();
    await screen.findByLabelText("Account menu");
    const topNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(topNav).toHaveTextContent("My Lists");
    expect(topNav).toHaveTextContent("Family Lists");
    expect(topNav).not.toHaveTextContent("Connections");
    expect(topNav).not.toHaveTextContent("Collections");
  });
});
