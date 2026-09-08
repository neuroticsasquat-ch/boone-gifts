import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { OccasionPicker } from "./OccasionPicker";

const API = "https://boone-gifts-api.localhost";

const viewerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "viewer@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const occasion = (id: number, name: string) => ({
  id,
  name,
  description: null,
  owner_id: 2,
  is_archived: false,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

/** Everything the picker reads, so a test only overrides what it cares about. */
function serveOccasions({
  occasions = [occasion(1, "Christmas 2026"), occasion(2, "Birthdays")],
  memberOf = [] as number[],
} = {}) {
  server.use(
    http.get(`${API}/occasions`, () => HttpResponse.json(occasions)),
    http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json(memberOf)),
  );
}

function renderPicker(onClose = vi.fn()) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: viewerToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <OccasionPicker listId={1} queryClient={queryClient} onClose={onClose} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

describe("OccasionPicker", () => {
  it("lists the viewer's occasions with current membership checked", async () => {
    serveOccasions({ memberOf: [2] });

    renderPicker();

    const panel = await screen.findByRole("region", { name: "Add to an occasion" });
    expect(await within(panel).findByRole("checkbox", { name: /christmas 2026/i })).not.toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: /birthdays/i })).toBeChecked();
  });

  it("adds the list to an occasion when its box is ticked", async () => {
    serveOccasions();
    let added: unknown = null;
    server.use(
      http.post(`${API}/occasions/1/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderPicker();

    await userEvent.click(await screen.findByRole("checkbox", { name: /christmas 2026/i }));

    await waitFor(() => expect(added).toEqual({ list_id: 1 }));
  });

  it("removes the list from an occasion when its box is unticked", async () => {
    serveOccasions({ memberOf: [1] });
    let removed = false;
    server.use(
      http.delete(`${API}/occasions/1/items/1`, () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPicker();

    await userEvent.click(await screen.findByRole("checkbox", { name: /christmas 2026/i }));

    await waitFor(() => expect(removed).toBe(true));
  });

  it("creates an occasion inline and files the list under it", async () => {
    serveOccasions({ occasions: [] });
    let created: unknown = null;
    let added: unknown = null;
    server.use(
      http.post(`${API}/occasions`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(occasion(9, "Wedding"));
      }),
      http.post(`${API}/occasions/9/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderPicker();

    await userEvent.type(await screen.findByLabelText("New occasion name"), "Wedding");
    await userEvent.click(screen.getByRole("button", { name: "Create & add" }));

    await waitFor(() => expect(created).toEqual({ name: "Wedding" }));
    await waitFor(() => expect(added).toEqual({ list_id: 1 }));
  });

  // The occasion is real once the first call returns, so a failed add must not
  // be reported as a failure to create — the row still has to show up.
  it("surfaces the new occasion when creating it works but adding does not", async () => {
    let occasions = [] as ReturnType<typeof occasion>[];
    server.use(
      http.get(`${API}/occasions`, () => HttpResponse.json(occasions)),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
      http.post(`${API}/occasions`, () => {
        occasions = [occasion(9, "Wedding")];
        return HttpResponse.json(occasions[0]);
      }),
      http.post(`${API}/occasions/9/items`, () => new HttpResponse(null, { status: 500 })),
    );

    renderPicker();

    await userEvent.type(await screen.findByLabelText("New occasion name"), "Wedding");
    await userEvent.click(screen.getByRole("button", { name: "Create & add" }));

    const box = await screen.findByRole("checkbox", { name: /wedding/i });
    expect(box).not.toBeChecked();
  });

  it("offers the create field when the viewer has no occasions yet", async () => {
    serveOccasions({ occasions: [] });

    renderPicker();

    expect(await screen.findByText(/don't have any occasions yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText("New occasion name")).toBeInTheDocument();
  });

  it("closes on Done", async () => {
    serveOccasions();

    const { onClose } = renderPicker();

    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("reports a failure to load the occasions", async () => {
    server.use(
      http.get(`${API}/occasions`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API}/occasions/for-list/1`, () => HttpResponse.json([])),
    );

    renderPicker();

    expect(await screen.findByText("Failed to load your occasions.")).toBeInTheDocument();
  });
});
