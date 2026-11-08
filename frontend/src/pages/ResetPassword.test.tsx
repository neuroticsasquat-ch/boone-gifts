import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { ResetPassword } from "./ResetPassword";

const API = "https://boone-gifts-api.localhost";

function renderPageWithToken(token: string | null) {
  const initialPath = token === null ? "/reset-password" : `/reset-password?token=${token}`;
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/forgot-password" element={<div>Forgot page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResetPassword", () => {
  it("shows an error when the URL has no token", () => {
    renderPageWithToken(null);
    expect(screen.getByText(/invalid or missing reset link/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });

  it("renders new password + confirm fields when a token is present", () => {
    renderPageWithToken("abc-123");
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set new password/i })).toBeInTheDocument();
  });

  it("shows an inline error when the passwords don't match", async () => {
    renderPageWithToken("abc-123");
    await userEvent.type(screen.getByLabelText(/^new password/i), "first-password");
    await userEvent.type(screen.getByLabelText(/confirm/i), "different-password");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
  });

  it("posts the token and new password to /auth/reset-password and redirects to login", async () => {
    let receivedBody: { token: string; new_password: string } | null = null;
    server.use(
      http.post(`${API}/auth/reset-password`, async ({ request }) => {
        receivedBody = (await request.json()) as { token: string; new_password: string };
        return HttpResponse.json({ message: "ok" });
      })
    );

    renderPageWithToken("abc-123");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByText("Login page")).toBeInTheDocument();
    });
    expect(receivedBody).toEqual({ token: "abc-123", new_password: "new-password-123" });
  });

  it("keeps the form and says so when the server can't be reached", async () => {
    // Requesting a new link cannot fix a network outage, and the new link would
    // fail the same way — so the dead-link screen is the rejection arm only.
    server.use(http.post(`${API}/auth/reset-password`, () => HttpResponse.error()));

    renderPageWithToken("abc-123");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /request a new link/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
  });

  it("keeps the form and blames our own end for a 500", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () => HttpResponse.json({}, { status: 500 }))
    );

    renderPageWithToken("abc-123");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText(/went wrong on our end/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
  });

  it("shows an error with a forgot-password link when the backend returns 400", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json({ detail: "Invalid or expired reset token." }, { status: 400 })
      )
    );

    renderPageWithToken("expired-token");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });
});
