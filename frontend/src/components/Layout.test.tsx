import { render, screen, waitFor } from "@testing-library/react";
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
    const topNav = document.querySelector("nav");
    expect(topNav).toHaveTextContent("Lists");
    expect(topNav).toHaveTextContent("Connections");
    expect(topNav).toHaveTextContent("Collections");
  });

  it("renders Boone Gifts brand link", async () => {
    renderLayout();
    await screen.findByText("Boone Gifts");
    expect(screen.getByText("Boone Gifts")).toBeInTheDocument();
  });
});
