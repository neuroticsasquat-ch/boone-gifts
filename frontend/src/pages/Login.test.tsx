import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Login } from "./Login";

const API = "https://boone-gifts-api.localhost";

// Decodable JWT (header.payload.signature); payload decodes via atob in AuthContext.
const fakeAccessToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(
    JSON.stringify({
      sub: "1",
      email: "mom@example.com",
      name: "Mom",
      role: "member",
      exp: 9999999999,
    })
  ),
  "fake-signature",
].join(".");

function renderLogin() {
  // AuthProvider clears the query cache at the identity boundary (ADR 0004), so it needs
  // a QueryClientProvider above it, exactly as App.tsx gives it one.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/lists" element={<div>App home</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

async function submitCredentials() {
  await userEvent.type(screen.getByLabelText(/email/i), "mom@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
}

describe("Login", () => {
  it("logs in and lands in the app", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ access_token: fakeAccessToken, token_type: "bearer" })
      )
    );

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/app home/i)).toBeInTheDocument();
  });

  it("says it could not reach the server, and does not blame the password", async () => {
    // The regression this ticket is: a workspace pointed at an unreachable host
    // told a user with correct credentials that their password was wrong, and
    // they reset a password that was always right.
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()));

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it("says the credentials are wrong for a 401, and nothing about which", async () => {
    // Uniform across "no such email" and "wrong password" on purpose: a message
    // that distinguished them would tell an attacker which addresses have accounts.
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({}, { status: 401 }))
    );

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it("says it is rate limiting for a 429", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ detail: "Rate limit exceeded: 10 per 1 minute" }, { status: 429 })
      )
    );

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
  });

  it("blames our own end when our own code throws, not the password", async () => {
    // A 200 carrying a malformed token makes `decodePayload` throw a TypeError
    // inside the login call — a bug in our own JavaScript reaching the same
    // catch as a rejected login. Answering that with a confident claim about
    // the user's password is the exact defect this ticket removes, which is why
    // a non-axios throw is never classified as a rejection.
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ access_token: "not-a-jwt", token_type: "bearer" })
      )
    );

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/went wrong on our end/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it("blames our own end for a 500", async () => {
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({}, { status: 500 }))
    );

    renderLogin();
    await submitCredentials();

    expect(await screen.findByText(/went wrong on our end/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });
});
