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

  it("shows the same success message when the backend rejects the request", async () => {
    // The anti-enumeration case, and the one a future reader is most likely to
    // break: the only email-dependent answer the backend gives is 200, so a 4xx
    // must stay indistinguishable from success.
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 400 })
      )
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    });
  });

  it("says it could not reach the server, and keeps the form", async () => {
    // "Check your inbox" for a request that never left the browser is a lie the
    // user acts on by waiting.
    server.use(http.post(`${API}/auth/forgot-password`, () => HttpResponse.error()));

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("says it is rate limiting for a 429", async () => {
    // Keyed on the caller's IP, not the email, so saying so reveals nothing.
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ detail: "Rate limit exceeded: 5 per 1 minute" }, { status: 429 })
      )
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("blames our own end for a 500, and keeps the form", async () => {
    // Our failure, and it means no email was sent.
    server.use(
      http.post(`${API}/auth/forgot-password`, () => HttpResponse.json({}, { status: 500 }))
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/went wrong on our end/i)).toBeInTheDocument();
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("links back to login", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });
});
