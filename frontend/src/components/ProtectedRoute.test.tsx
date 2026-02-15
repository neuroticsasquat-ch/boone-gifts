import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";

function renderWithAuth(user: AuthContextType["user"], initialPath = "/") {
  const authValue: AuthContextType = {
    user,
    isLoading: false,
    login: async () => {},
    logout: () => {},
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("ProtectedRoute", () => {
  it("renders children when authenticated", () => {
    renderWithAuth({ id: 1, email: "test@test.com", role: "member" });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    renderWithAuth(null);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});
