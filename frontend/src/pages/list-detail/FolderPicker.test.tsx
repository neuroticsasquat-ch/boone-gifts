import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { FolderPicker } from "./FolderPicker";

const API = "https://boone-gifts-api.localhost";

const viewerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "viewer@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const folder = (id: number, name: string) => ({
  id,
  name,
  description: null,
  owner_id: 2,
  is_archived: false,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

/** Everything the picker reads, so a test only overrides what it cares about. */
function serveFolders({
  folders = [folder(1, "Christmas 2026"), folder(2, "Birthdays")],
  memberOf = [] as number[],
} = {}) {
  server.use(
    http.get(`${API}/folders`, () => HttpResponse.json(folders)),
    http.get(`${API}/folders/for-list/1`, () => HttpResponse.json(memberOf)),
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
          <FolderPicker listId={1} queryClient={queryClient} onClose={onClose} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

describe("FolderPicker", () => {
  it("lists the viewer's folders with current membership checked", async () => {
    serveFolders({ memberOf: [2] });

    renderPicker();

    const panel = await screen.findByRole("region", { name: "Add to a folder" });
    expect(await within(panel).findByRole("checkbox", { name: /christmas 2026/i })).not.toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: /birthdays/i })).toBeChecked();
  });

  it("adds the list to a folder when its box is ticked", async () => {
    serveFolders();
    let added: unknown = null;
    server.use(
      http.post(`${API}/folders/1/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderPicker();

    await userEvent.click(await screen.findByRole("checkbox", { name: /christmas 2026/i }));

    await waitFor(() => expect(added).toEqual({ list_id: 1 }));
  });

  it("removes the list from a folder when its box is unticked", async () => {
    serveFolders({ memberOf: [1] });
    let removed = false;
    server.use(
      http.delete(`${API}/folders/1/items/1`, () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPicker();

    await userEvent.click(await screen.findByRole("checkbox", { name: /christmas 2026/i }));

    await waitFor(() => expect(removed).toBe(true));
  });

  it("creates a folder inline and files the list under it", async () => {
    serveFolders({ folders: [] });
    let created: unknown = null;
    let added: unknown = null;
    server.use(
      http.post(`${API}/folders`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(folder(9, "Wedding"));
      }),
      http.post(`${API}/folders/9/items`, async ({ request }) => {
        added = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderPicker();

    await userEvent.type(await screen.findByLabelText("New folder name"), "Wedding");
    await userEvent.click(screen.getByRole("button", { name: "Create & add" }));

    await waitFor(() => expect(created).toEqual({ name: "Wedding" }));
    await waitFor(() => expect(added).toEqual({ list_id: 1 }));
  });

  // The folder is real once the first call returns, so a failed add must not
  // be reported as a failure to create — the row still has to show up.
  it("surfaces the new folder when creating it works but adding does not", async () => {
    let folders = [] as ReturnType<typeof folder>[];
    server.use(
      http.get(`${API}/folders`, () => HttpResponse.json(folders)),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
      http.post(`${API}/folders`, () => {
        folders = [folder(9, "Wedding")];
        return HttpResponse.json(folders[0]);
      }),
      http.post(`${API}/folders/9/items`, () => new HttpResponse(null, { status: 500 })),
    );

    renderPicker();

    await userEvent.type(await screen.findByLabelText("New folder name"), "Wedding");
    await userEvent.click(screen.getByRole("button", { name: "Create & add" }));

    const box = await screen.findByRole("checkbox", { name: /wedding/i });
    expect(box).not.toBeChecked();
  });

  it("offers the create field when the viewer has no folders yet", async () => {
    serveFolders({ folders: [] });

    renderPicker();

    expect(await screen.findByText(/don't have any folders yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText("New folder name")).toBeInTheDocument();
  });

  it("closes on Done", async () => {
    serveFolders();

    const { onClose } = renderPicker();

    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("reports a failure to load the folders", async () => {
    server.use(
      http.get(`${API}/folders`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API}/folders/for-list/1`, () => HttpResponse.json([])),
    );

    renderPicker();

    expect(await screen.findByText("Failed to load your folders.")).toBeInTheDocument();
  });
});
