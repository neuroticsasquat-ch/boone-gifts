import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Register } from "./Register";

const API = "https://boone-gifts-api.localhost";

// Decodable JWT (header.payload.signature); payload decodes via atob in AuthContext.
const fakeAccessToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "mom@example.com", name: "Mom", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

function renderRegister(query: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/register${query}`]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/lists" element={<div>App home</div>} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("Register — family invite", () => {
  it("resolves the family_invite param and shows the family name", async () => {
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "mom@example.com", family_name: "Smith Family" })
      )
    );

    renderRegister("?family_invite=fam-1");

    expect(await screen.findByText(/Smith Family/)).toBeInTheDocument();
  });

  it("renders the invite email read-only for a family invite", async () => {
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "mom@example.com", family_name: "Smith Family" })
      )
    );

    renderRegister("?family_invite=fam-1");

    const email = (await screen.findByLabelText(/email/i)) as HTMLInputElement;
    expect(email).toBeDisabled();
    expect(email.value).toBe("mom@example.com");
  });

  it("registers via a family invite and lands in the app (auto-login)", async () => {
    let body: unknown = null;
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "mom@example.com", family_name: "Smith Family" })
      ),
      http.post(`${API}/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ access_token: fakeAccessToken, token_type: "bearer" });
      })
    );

    renderRegister("?family_invite=fam-1");
    await screen.findByText(/Smith Family/);
    await userEvent.type(screen.getByLabelText(/^name/i), "Mom");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText(/app home/i)).toBeInTheDocument();
    expect(body).toEqual({
      token: "fam-1",
      name: "Mom",
      password: "password123",
      email: "mom@example.com",
    });
  });

  it("surfaces the backend error detail when registration fails", async () => {
    const detail =
      "An account already exists for this email. Log in and accept the invite from your account.";
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "mom@example.com", family_name: "Smith Family" })
      ),
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json({ detail }, { status: 400 })
      )
    );

    renderRegister("?family_invite=fam-1");
    await screen.findByText(/Smith Family/);
    await userEvent.type(screen.getByLabelText(/^name/i), "Mom");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText(/an account already exists/i)).toBeInTheDocument();
  });
});

describe("Register — admin invite", () => {
  it("admin invite (token param) shows an editable email and no family banner", async () => {
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "new@example.com", family_name: null })
      )
    );

    renderRegister("?token=adm-1");

    const email = await screen.findByLabelText(/email/i);
    expect(email).toBeEnabled();
    expect(screen.queryByText(/family/i)).not.toBeInTheDocument();
  });
});

describe("Register — error cases", () => {
  it("shows an invalid-invite message when the token cannot be resolved", async () => {
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ detail: "Invalid or expired invite." }, { status: 400 })
      )
    );

    renderRegister("?token=bad");

    expect(await screen.findByText(/invalid invite link/i)).toBeInTheDocument();
  });

  it("shows an inline error when the passwords don't match", async () => {
    server.use(
      http.get(`${API}/auth/invite-info`, () =>
        HttpResponse.json({ email: "mom@example.com", family_name: "Smith Family" })
      )
    );

    renderRegister("?family_invite=fam-1");
    await screen.findByText(/Smith Family/);
    await userEvent.type(screen.getByLabelText(/^name/i), "Mom");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm/i), "different1");
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
  });
});
