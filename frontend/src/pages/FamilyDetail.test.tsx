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

// JWT for user id=1 (organizer)
const organizerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "organizer@test.com", name: "Alice", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

// JWT for user id=2 (plain member)
const memberToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "member@test.com", name: "Bob", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const sampleFamily = {
  id: 1,
  name: "The Boones",
  created_by_id: 1,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "member" },
  ],
};

function renderFamilyDetail(token: string, id = "1") {
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
  it("renders family name and members with roles", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("organizer")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("organizer sees promote/demote and remove buttons for other members", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    // Organizer (Alice) should NOT see buttons for themselves, but should for Bob
    expect(screen.getByText("Make Organizer")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("plain member does NOT see promote/demote or remove buttons", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    expect(screen.queryByText("Make Organizer")).not.toBeInTheDocument();
    expect(screen.queryByText("Make Member")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("rename: fill input and submit calls PUT /families/:id", async () => {
    const updatedFamily = { ...sampleFamily, name: "The Boone Family" };

    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.put(`${API}/families/1`, () => HttpResponse.json(updatedFamily)),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("The Boones");
    await userEvent.type(input, "The Boone Family");
    await userEvent.click(screen.getByText("Rename"));

    // Success: no error and input cleared
    await waitFor(() => {
      expect(screen.queryByText("Failed to rename family.")).not.toBeInTheDocument();
      expect(input).toHaveValue("");
    });
  });

  it("delete: click Delete Family then Confirm Delete → navigates to /families", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.delete(`${API}/families/1`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete Family" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Families List")).toBeInTheDocument();
    });
  });

  it("leave: click Leave Family → calls DELETE /families/:id/members/:userId → navigates to /families", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.delete(`${API}/families/1/members/2`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Leave Family"));

    await waitFor(() => {
      expect(screen.getByText("Families List")).toBeInTheDocument();
    });
  });

  it("409 on leave shows last-organizer error message", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
      http.delete(`${API}/families/1/members/1`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Leave Family"));

    await waitFor(() => {
      expect(
        screen.getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
  });

  it("409 on remove member shows last-organizer error message", async () => {
    // Family where both are organizers and Bob is the only other member
    const twoOrganizers = {
      ...sampleFamily,
      members: [
        { user_id: 1, name: "Alice", role: "organizer" },
        { user_id: 2, name: "Bob", role: "organizer" },
      ],
    };

    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(twoOrganizers)),
      http.delete(`${API}/families/1/members/2`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(
        screen.getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
  });

  it("demote: clicking Make Member sends role: member to PUT /families/:id/members/:userId/role", async () => {
    const twoOrganizers = {
      ...sampleFamily,
      members: [
        { user_id: 1, name: "Alice", role: "organizer" },
        { user_id: 2, name: "Bob", role: "organizer" },
      ],
    };

    let capturedBody: unknown;
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(twoOrganizers)),
      http.put(`${API}/families/1/members/2/role`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...twoOrganizers.members[1], role: "member" });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Make Member"));

    await waitFor(() => {
      expect(capturedBody).toEqual({ role: "member" });
    });
  });

  it("409 on demote shows last-organizer error message", async () => {
    const twoOrganizers = {
      ...sampleFamily,
      members: [
        { user_id: 1, name: "Alice", role: "organizer" },
        { user_id: 2, name: "Bob", role: "organizer" },
      ],
    };

    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(twoOrganizers)),
      http.put(`${API}/families/1/members/2/role`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });

    // Bob is an organizer; "Make Member" demotes him → 409
    await userEvent.click(screen.getByText("Make Member"));

    await waitFor(() => {
      expect(
        screen.getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
  });

  it("shows back link to /families", async () => {
    server.use(
      http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText(/Back to families/i)).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: /Back to families/i });
    expect(backLink).toHaveAttribute("href", "/families");
  });
});
