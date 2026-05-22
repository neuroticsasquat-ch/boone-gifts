import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { ForgotPassword } from "./ForgotPassword";

const API = "https://boone-gifts-api.localhost";

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

describe("ForgotPassword", () => {
  it("renders an email input and submit button", () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  });

  it("posts the email to /auth/forgot-password and shows a generic success message", async () => {
    let receivedEmail = "";
    server.use(
      http.post(`${API}/auth/forgot-password`, async ({ request }) => {
        const body = (await request.json()) as { email: string };
        receivedEmail = body.email;
        return HttpResponse.json({ message: "ok" });
      })
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    });
    expect(receivedEmail).toBe("user@test.com");
  });

  it("shows the same success message when the backend returns an error", async () => {
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ detail: "rate limited" }, { status: 429 })
      )
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    });
  });

  it("links back to login", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });
});
