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
  it("renders hamburger menu button", async () => {
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    expect(hamburger).toBeInTheDocument();
  });

  it("opens drawer when hamburger is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    // Drawer becomes visible (has role="dialog" when open)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("renders nav links inside the drawer", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Lists");
    expect(dialog).toHaveTextContent("Connections");
    expect(dialog).toHaveTextContent("Collections");
  });

  it("renders user email and logout in drawer", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("user@test.com");
    const logoutButtons = screen.getAllByText("Logout");
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("closes drawer when close button is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close menu"));
    // Drawer is still in DOM but no longer has role="dialog"
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes drawer when backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("drawer-backdrop"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders desktop nav links in the header", async () => {
    renderLayout();
    await screen.findByLabelText("Open menu");
    const nav = document.querySelector("nav");
    expect(nav).toHaveTextContent("Lists");
    expect(nav).toHaveTextContent("Connections");
    expect(nav).toHaveTextContent("Collections");
  });
});
