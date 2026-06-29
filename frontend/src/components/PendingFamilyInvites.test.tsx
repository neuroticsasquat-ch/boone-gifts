import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { http, HttpResponse, delay } from "msw";
import { server } from "../test/mocks/server";
import { PendingFamilyInvites } from "./PendingFamilyInvites";

const API = "https://boone-gifts-api.localhost";

const testInvite = {
  id: 1,
  token: "tok-abc123",
  role: "member",
  family: { id: 10, name: "The Smiths" },
  invited_by: { id: 5, name: "Alice Smith" },
  expires_at: "2026-12-31T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <PendingFamilyInvites />
    </QueryClientProvider>
  )};
}

describe("PendingFamilyInvites", () => {
  it("renders incoming invites with family name and inviter name", async () => {
    server.use(
      http.get(`${API}/families/invites`, () =>
        HttpResponse.json([testInvite])
      ),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("The Smiths")).toBeInTheDocument();
    });
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
    expect(screen.getByText("Pending Family Invites")).toBeInTheDocument();
  });

  it("hides section when invite list is empty", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([])),
    );

    const { queryClient } = renderComponent();

    // Wait for the query to actually settle so the negative assertion proves
    // "empty data → null", not "still loading → not rendered yet".
    await waitFor(() => {
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
    });
    expect(screen.queryByText("Pending Family Invites")).not.toBeInTheDocument();
  });

  it("fires POST /families/invites/{token}/accept when Accept is clicked", async () => {
    const acceptHandler = vi.fn();

    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, ({ params }) => {
        acceptHandler(params.token);
        return HttpResponse.json({ family: testInvite.family, role: "member" });
      }),
    );

    renderComponent();

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(acceptHandler).toHaveBeenCalledWith("tok-abc123");
    });
  });

  it("fires POST /families/invites/{token}/decline when Decline is clicked", async () => {
    const declineHandler = vi.fn();

    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/decline`, ({ params }) => {
        declineHandler(params.token);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderComponent();

    const declineBtn = await screen.findByText("Decline");
    await userEvent.click(declineBtn);

    await waitFor(() => {
      expect(declineHandler).toHaveBeenCalledWith("tok-abc123");
    });
  });

  it("invalidates familyInvites and shows stale-invite toast on 409 accept", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, () =>
        new HttpResponse(null, { status: 409 })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown }).queryKey
      );
      expect(keys).toContainEqual(["familyInvites"]);
    });
    expect((await screen.findAllByText(/no longer valid/i)).length).toBeGreaterThan(0);
  });

  it("invalidates familyInvites and shows stale-invite toast on 409 decline", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/decline`, () =>
        new HttpResponse(null, { status: 409 })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const declineBtn = await screen.findByText("Decline");
    await userEvent.click(declineBtn);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown }).queryKey
      );
      expect(keys).toContainEqual(["familyInvites"]);
    });
    expect((await screen.findAllByText(/no longer valid/i)).length).toBeGreaterThan(0);
  });

  it("shows generic error toast on 403 accept", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, () =>
        new HttpResponse(null, { status: 403 })
      ),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Accept"));
    expect((await screen.findAllByText("Failed to accept invite.")).length).toBeGreaterThan(0);
  });

  it("shows generic error toast on 404 decline", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/decline`, () =>
        new HttpResponse(null, { status: 404 })
      ),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Decline"));
    expect((await screen.findAllByText("Failed to decline invite.")).length).toBeGreaterThan(0);
  });

  it("invalidates familyInvites, families, and lists/family queries on decline", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/decline`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const declineBtn = await screen.findByText("Decline");
    await userEvent.click(declineBtn);

    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map((c) => c[0]);
      const keys = calls.map((c) => (c as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["familyInvites"]);
      expect(keys).toContainEqual(["families"]);
      expect(keys).toContainEqual(["lists", "family"]);
    });
  });

  it("invalidates familyInvites, families, and lists/family queries on accept", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, () =>
        HttpResponse.json({ family: testInvite.family, role: "member" })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map((c) => c[0]);
      const keys = calls.map((c) => (c as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["familyInvites"]);
      expect(keys).toContainEqual(["families"]);
      expect(keys).toContainEqual(["lists", "family"]);
    });
  });

  it("disables both Accept and Decline buttons while a mutation is in-flight", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, async () => {
        await delay("infinite");
        return HttpResponse.json({ family: testInvite.family, role: "member" });
      }),
    );

    renderComponent();
    const acceptBtn = await screen.findByText("Accept");
    // Fire without awaiting so the mutation starts but does not resolve
    userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText("Accept")).toBeDisabled();
      expect(screen.getByText("Decline")).toBeDisabled();
    });
  });
});
