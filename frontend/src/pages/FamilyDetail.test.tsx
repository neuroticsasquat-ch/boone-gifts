import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { FamilyDetail } from "./FamilyDetail";

const API = "https://boone-gifts-api.localhost";

// Craft a minimal JWT whose sub claim becomes user.id in AuthContext.
function makeJwt(payload: object) {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.fakesig`;
}

const ORGANIZER_USER_ID = 1;
const MEMBER_USER_ID = 2;

const organizerToken = makeJwt({
  sub: ORGANIZER_USER_ID,
  email: "organizer@test.com",
  name: "Organizer",
  role: "user",
});

const memberToken = makeJwt({
  sub: MEMBER_USER_ID,
  email: "member@test.com",
  name: "Member",
  role: "user",
});

const sampleFamily = {
  id: 1,
  name: "The Boones",
  created_by_id: ORGANIZER_USER_ID,
  members: [
    { user_id: ORGANIZER_USER_ID, name: "Organizer", role: "organizer" },
    { user_id: MEMBER_USER_ID, name: "Member", role: "member" },
  ],
};

const pendingInvite = {
  id: 10,
  family_id: 1,
  email: "invite@test.com",
  role: "member",
  simple_mode: false,
  token: "tok-abc",
  invited_by_id: ORGANIZER_USER_ID,
  expires_at: "2099-01-01T00:00:00",
  accepted_at: null,
  declined_at: null,
  created_at: "2026-01-01T00:00:00",
  status: "pending" as const,
};

function renderFamilyDetail(id = "1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/families/${id}`]}>
          <Routes>
            <Route path="/families/:id" element={<FamilyDetail />} />
            <Route path="/families" element={<div>Families List</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("FamilyDetail", () => {
  it("renders invite form for organizer", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: organizerToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([])),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    expect(screen.getByText("Send Invite")).toBeInTheDocument();
  });

  it("invite success adds a row to the pending invites list", async () => {
    const newInvite = { ...pendingInvite, id: 20, email: "newuser@test.com" };

    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: organizerToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      // First load: no invites; after POST: one invite
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([])),
      http.post(`${API}/families/1/invites`, () =>
        HttpResponse.json(newInvite, { status: 201 })
      ),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    // After invite, re-query returns the new invite
    server.use(
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([newInvite]))
    );

    await userEvent.type(screen.getByPlaceholderText("Email address"), "newuser@test.com");
    await userEvent.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(screen.getByText("newuser@test.com")).toBeInTheDocument();
    });
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });

  it("shows pending invites list and revoke removes the invite", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: organizerToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([pendingInvite])),
      http.delete(`${API}/families/1/invites/10`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByText("invite@test.com")).toBeInTheDocument();
    });
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();

    // After revoke, re-query returns empty list
    server.use(
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([]))
    );

    await userEvent.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(screen.queryByText("invite@test.com")).not.toBeInTheDocument();
    });
  });

  it("shows 409 duplicate invite error message", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: organizerToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([])),
      http.post(`${API}/families/1/invites`, () =>
        HttpResponse.json({ detail: "Conflict" }, { status: 409 })
      ),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "existing@test.com");
    await userEvent.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(
        screen.getByText("An invite for this email is already pending.")
      ).toBeInTheDocument();
    });
  });

  it("shows 400 bad email error detail from response", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: organizerToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([])),
      http.post(`${API}/families/1/invites`, () =>
        HttpResponse.json({ detail: "Invalid email format." }, { status: 400 })
      ),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    // Use a well-formed email so the browser's type="email" validation passes,
    // but the server-side validation rejects it (400).
    await userEvent.type(screen.getByPlaceholderText("Email address"), "bad@format.x");
    await userEvent.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(screen.getByText("Invalid email format.")).toBeInTheDocument();
    });
  });

  it("non-organizer sees no invite form or invite list", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ access_token: memberToken })
      ),
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
    );

    renderFamilyDetail();

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText("Email address")).not.toBeInTheDocument();
    expect(screen.queryByText("Send Invite")).not.toBeInTheDocument();
    expect(screen.queryByText("Invites")).not.toBeInTheDocument();
  });
});
