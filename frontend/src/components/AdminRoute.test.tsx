import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";
import { AdminRoute } from "./AdminRoute";

function renderWithAuth(
  user: AuthContextType["user"],
  initialPath = "/admin",
  isLoading = false,
) {
  const authValue: AuthContextType = {
    user,
    isLoading,
    login: async () => {},
    logout: async () => {},
    changePassword: async () => {},
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>Admin Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AdminRoute", () => {
  it("renders children when user is admin", () => {
    renderWithAuth({ id: 1, email: "admin@test.com", role: "admin" });
    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    renderWithAuth(null);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("redirects to dashboard when authenticated but not admin", () => {
    renderWithAuth({ id: 2, email: "member@test.com", role: "member" });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    const { container } = renderWithAuth(null, "/admin", true);
    expect(container.innerHTML).toBe("");
  });
});
