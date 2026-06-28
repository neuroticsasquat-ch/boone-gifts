import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Account } from "./Account";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";

const API = "https://boone-gifts-api.localhost";

function renderAccount(overrides: Partial<AuthContextType> = {}) {
  const value: AuthContextType = {
    user: { id: 1, email: "user@test.com", name: "Test User", role: "member" },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    updateProfile: vi.fn(),
    ...overrides,
  };
  return {
    value,
    ...render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>
          <Account />
        </AuthContext.Provider>
      </MemoryRouter>
    ),
  };
}

describe("Account", () => {
  beforeEach(() => {
    server.use(
      http.post(`${API}/auth/change-password`, () =>
        HttpResponse.json({ access_token: "new-token" })
      )
    );
  });

  it("renders the current password, new password, and confirm fields", () => {
    renderAccount();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
  });

  it("shows an inline error when the new password and confirmation don't match", async () => {
    renderAccount();
    await userEvent.type(screen.getByLabelText(/current password/i), "current");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "different-password");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
  });

  it("calls changePassword on submit when passwords match", async () => {
    const changePassword = vi.fn().mockResolvedValue(undefined);
    renderAccount({ changePassword });

    await userEvent.type(screen.getByLabelText(/current password/i), "current");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith("current", "new-password-123");
    });
  });

  it("shows a success message and clears the form after a successful change", async () => {
    const changePassword = vi.fn().mockResolvedValue(undefined);
    renderAccount({ changePassword });

    await userEvent.type(screen.getByLabelText(/current password/i), "current");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password updated/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/current password/i)).toHaveValue("");
    expect(screen.getByLabelText(/^new password/i)).toHaveValue("");
    expect(screen.getByLabelText(/confirm/i)).toHaveValue("");
  });

  it("shows an inline error on the current-password field when the backend returns 400", async () => {
    const error = Object.assign(new Error("400"), {
      response: { status: 400, data: { detail: "Current password is incorrect." } },
    });
    const changePassword = vi.fn().mockRejectedValue(error);
    renderAccount({ changePassword });

    await userEvent.type(screen.getByLabelText(/current password/i), "wrong");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument();
    });
  });
});
