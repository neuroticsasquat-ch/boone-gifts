import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { CreateList } from "./CreateList";

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

const families = [
  { id: 7, name: "The Boones", role: "organizer", member_count: 3 },
  { id: 8, name: "The Smiths", role: "member", member_count: 2 },
];

function renderCreateList(authToken: string) {
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
          <CreateList />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("CreateList — family sharing", () => {
  it("lists the user's families as unchecked checkboxes in full mode", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json(families)));

    renderCreateList(fullModeToken);

    const boones = await screen.findByRole("checkbox", { name: "The Boones" });
    expect(boones).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "The Smiths" })).not.toBeChecked();
  });

  it("posts family_ids for exactly the families checked", async () => {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json(families)),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    renderCreateList(fullModeToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /name/i }), "Birthday");
    await userEvent.click(screen.getByRole("checkbox", { name: "The Boones" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ name: "Birthday", family_ids: [7] });
  });

  it("posts an empty family_ids when nothing is checked", async () => {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json(families)),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    renderCreateList(fullModeToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /name/i }), "Private");
    await screen.findByRole("checkbox", { name: "The Boones" });
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ family_ids: [] });
  });

  it("hides the section in simple mode — the backend shares with all families anyway", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json(families)));

    renderCreateList(simpleModeToken);

    await screen.findByRole("button", { name: /create list/i });
    expect(screen.queryByText("Share with families")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("hides the section when the user belongs to no families", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await screen.findByRole("button", { name: /create list/i });
    await waitFor(() =>
      expect(screen.queryByText("Share with families")).not.toBeInTheDocument()
    );
  });
});
