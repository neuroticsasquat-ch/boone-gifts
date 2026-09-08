import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { http, HttpResponse, delay } from "msw";
import { server } from "../test/mocks/server";
import { ActionableBanner } from "./ActionableBanner";

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

const testRequest = {
  id: 7,
  status: "pending",
  user: { id: 3, name: "Dave Boone", email: "dave@test.com" },
  created_at: "2026-01-01T00:00:00Z",
  accepted_at: null,
};

/** Only incoming family invites pending. */
function onlyInvites() {
  server.use(
    http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
  );
}

/** Only incoming connection requests pending. */
function onlyRequests() {
  server.use(
    http.get(`${API}/families/invites`, () => HttpResponse.json([])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
  );
}

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <ActionableBanner />
    </QueryClientProvider>
  )};
}

const banner = () => screen.queryByRole("region", { name: "Waiting on you" });

describe("ActionableBanner", () => {
  it("renders incoming invites with family name and inviter name", async () => {
    onlyInvites();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("The Smiths")).toBeInTheDocument();
    });
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("renders incoming connection requests in plain language", async () => {
    onlyRequests();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Dave Boone")).toBeInTheDocument();
    });
    expect(screen.getByText(/wants to connect/)).toBeInTheDocument();
    expect(screen.getByText("dave@test.com")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("renders requests and invites together in one region", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderComponent();

    expect(
      await screen.findByLabelText("Accept connection request from Dave Boone")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Accept invite to The Smiths")).toBeInTheDocument();
    // One region, not one per item type — this is a single banner.
    expect(screen.getAllByRole("region", { name: "Waiting on you" })).toHaveLength(1);
  });

  it("renders nothing when there is nothing pending", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    const { queryClient } = renderComponent();

    // Wait for both queries to actually settle so the negative assertion proves
    // "empty data → null", not "still loading → not rendered yet".
    await waitFor(() => {
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
      expect(queryClient.getQueryState(["connectionRequests"])?.status).toBe("success");
    });
    expect(banner()).not.toBeInTheDocument();
  });

  it("fires POST /families/invites/{token}/accept when Accept is clicked", async () => {
    const acceptHandler = vi.fn();

    onlyInvites();
    server.use(
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

    onlyInvites();
    server.use(
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

  it("fires POST /connections/{id}/accept when Accept is clicked", async () => {
    const acceptHandler = vi.fn();

    onlyRequests();
    server.use(
      http.post(`${API}/connections/:id/accept`, ({ params }) => {
        acceptHandler(params.id);
        return HttpResponse.json({ ...testRequest, status: "accepted" });
      }),
    );

    renderComponent();

    await userEvent.click(await screen.findByText("Accept"));

    await waitFor(() => {
      expect(acceptHandler).toHaveBeenCalledWith("7");
    });
  });

  it("fires DELETE /connections/{id} when Decline is clicked", async () => {
    const declineHandler = vi.fn();

    onlyRequests();
    server.use(
      http.delete(`${API}/connections/:id`, ({ params }) => {
        declineHandler(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderComponent();

    await userEvent.click(await screen.findByText("Decline"));

    await waitFor(() => {
      expect(declineHandler).toHaveBeenCalledWith("7");
    });
  });

  it("invalidates familyInvites and shows stale-invite toast on 409 accept", async () => {
    onlyInvites();
    server.use(
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
    onlyInvites();
    server.use(
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

  it("shows generic error toast on 403 invite accept", async () => {
    onlyInvites();
    server.use(
      http.post(`${API}/families/invites/:token/accept`, () =>
        new HttpResponse(null, { status: 403 })
      ),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Accept"));
    expect((await screen.findAllByText("Failed to accept invite.")).length).toBeGreaterThan(0);
  });

  it("shows generic error toast on 404 invite decline", async () => {
    onlyInvites();
    server.use(
      http.post(`${API}/families/invites/:token/decline`, () =>
        new HttpResponse(null, { status: 404 })
      ),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Decline"));
    expect((await screen.findAllByText("Failed to decline invite.")).length).toBeGreaterThan(0);
  });

  it("shows an error toast when accepting a connection request fails", async () => {
    onlyRequests();
    server.use(
      http.post(`${API}/connections/:id/accept`, () => new HttpResponse(null, { status: 500 })),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Accept"));
    expect((await screen.findAllByText("Failed to accept request.")).length).toBeGreaterThan(0);
  });

  it("shows an error toast when declining a connection request fails", async () => {
    onlyRequests();
    server.use(
      http.delete(`${API}/connections/:id`, () => new HttpResponse(null, { status: 500 })),
    );

    renderComponent();
    await userEvent.click(await screen.findByText("Decline"));
    expect((await screen.findAllByText("Failed to decline request.")).length).toBeGreaterThan(0);
  });

  it("invalidates familyInvites, families, and lists/shared queries on invite decline", async () => {
    onlyInvites();
    server.use(
      http.post(`${API}/families/invites/:token/decline`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const declineBtn = await screen.findByText("Decline");
    await userEvent.click(declineBtn);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["familyInvites"]);
      expect(keys).toContainEqual(["families"]);
      expect(keys).toContainEqual(["lists", "shared"]);
    });
  });

  it("invalidates familyInvites, families, and lists/shared queries on invite accept", async () => {
    onlyInvites();
    server.use(
      http.post(`${API}/families/invites/:token/accept`, () =>
        HttpResponse.json({ family: testInvite.family, role: "member" })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["familyInvites"]);
      expect(keys).toContainEqual(["families"]);
      expect(keys).toContainEqual(["lists", "shared"]);
    });
  });

  it("refreshes the People badge query when a connection request is accepted", async () => {
    onlyRequests();
    server.use(
      http.post(`${API}/connections/:id/accept`, () =>
        HttpResponse.json({ ...testRequest, status: "accepted" })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.click(await screen.findByText("Accept"));

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["connectionRequests"]);
      expect(keys).toContainEqual(["connections"]);
      expect(keys).toContainEqual(["lists", "shared"]);
      expect(keys).toContainEqual(["occasions"]);
    });
  });

  it("drops the acted-on row and hides the banner once nothing is left", async () => {
    let accepted = false;
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () =>
        HttpResponse.json(accepted ? [] : [testRequest])
      ),
      http.post(`${API}/connections/:id/accept`, () => {
        accepted = true;
        return HttpResponse.json({ ...testRequest, status: "accepted" });
      }),
    );

    renderComponent();

    await userEvent.click(await screen.findByText("Accept"));

    await waitFor(() => {
      expect(banner()).not.toBeInTheDocument();
    });
  });

  it("disables both Accept and Decline buttons while a mutation is in-flight", async () => {
    onlyInvites();
    server.use(
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
