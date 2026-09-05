import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { FamiliesTab } from "./FamiliesTab";

const API = "https://boone-gifts-api.localhost";

function token(claims: Record<string, unknown>) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999, ...claims })),
    "fake-signature",
  ].join(".");
}

const fullModeToken = token({});
const simpleModeToken = token({ simple_mode: true });

const listFamilies = [
  { id: 7, name: "The Boones", shared: true },
  { id: 8, name: "The Smiths", shared: false },
];

function renderTab(authToken: string) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <FamiliesTab listId={1} queryClient={queryClient} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("FamiliesTab — full mode", () => {
  it("renders one toggle per family, reflecting its shared state", async () => {
    server.use(http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)));

    renderTab(fullModeToken);

    expect(await screen.findByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with the smiths/i })).not.toBeChecked();
  });

  it("toggling a family on PUTs the grant", async () => {
    const shared = vi.fn();
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.put(`${API}/lists/1/families/8`, () => {
        shared();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the smiths/i }));
    await waitFor(() => expect(shared).toHaveBeenCalled());
  });

  it("toggling a family off DELETEs the grant with no claims param", async () => {
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith(null));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the release/keep dialog on a 409, with no counts or names", async () => {
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.delete(`${API}/lists/1/families/7`, () =>
        HttpResponse.json(
          { detail: "Some gifts on this list are claimed by members of this family." },
          { status: 409 },
        )
      ),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Some gifts are claimed");
    expect(screen.getByRole("button", { name: /release those claims/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep them claimed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    // The owner is blind to claim state: no count, no gift name, no claimer name.
    expect(dialog).not.toHaveTextContent(/\d/);
  });

  it("re-issues the request with claims=release", async () => {
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /release those claims/i }));

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith("release"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("re-issues the request with claims=keep", async () => {
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        const claims = new URL(request.url).searchParams.get("claims");
        revoked(claims);
        return claims
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /keep them claimed/i }));

    await waitFor(() => expect(revoked).toHaveBeenLastCalledWith("keep"));
  });

  it("cancelling the dialog leaves the grant in place", async () => {
    const revoked = vi.fn();
    server.use(
      http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)),
      http.delete(`${API}/lists/1/families/7`, ({ request }) => {
        revoked(new URL(request.url).searchParams.get("claims"));
        return HttpResponse.json({ detail: "claimed" }, { status: 409 });
      }),
    );

    renderTab(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /share with the boones/i })).toBeChecked();
  });
});

describe("FamiliesTab — simple mode", () => {
  it("shows the real sharing state read-only, with the switch-to-full-mode instruction", async () => {
    server.use(http.get(`${API}/lists/1/families`, () => HttpResponse.json(listFamilies)));

    renderTab(simpleModeToken);

    await screen.findByText("The Boones");
    // The real state, not an assertion that everything is shared.
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Not shared")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/switch to full mode/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /account settings/i })).toHaveAttribute("href", "/account");
  });
});

describe("FamiliesTab — no families", () => {
  it("says so instead of rendering an empty list", async () => {
    server.use(http.get(`${API}/lists/1/families`, () => HttpResponse.json([])));

    renderTab(fullModeToken);

    expect(await screen.findByText(/don't belong to any families/i)).toBeInTheDocument();
  });
});
