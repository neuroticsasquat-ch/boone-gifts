import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
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

const testPrompt = {
  id: 25,
  name: "Christmas 2025",
  family_id: 10,
  family_name: "Boone Family",
};

const otherPrompt = {
  id: 26,
  name: "Easter 2026",
  family_id: 10,
  family_name: "Boone Family",
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

/** Only archive prompts pending — the given ones, and nothing else. Loosely
 *  typed so a test can serve a *wider* payload than the contract, which is what
 *  the rule 2 guard below needs to be worth asserting. */
function onlyPrompts(prompts: Record<string, unknown>[] = [testPrompt]) {
  server.use(
    http.get(`${API}/families/invites`, () => HttpResponse.json([])),
    http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    http.get(`${API}/occasions/archive-prompts`, () => HttpResponse.json(prompts)),
  );
}

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Toaster />
        <ActionableBanner />
      </MemoryRouter>
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

    // Wait for all three queries to actually settle so the negative assertion
    // proves "empty data → null", not "still loading → not rendered yet".
    await waitFor(() => {
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
      expect(queryClient.getQueryState(["connectionRequests"])?.status).toBe("success");
      expect(queryClient.getQueryState(["occasions", "archive-prompts"])?.status).toBe("success");
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
      expect(keys).toContainEqual(["folders"]);
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

  describe("archive prompts", () => {
    it("names the occasion and its family and nothing else", async () => {
      // The payload the backend *could* have served if `ArchivePrompt` had been
      // built off `OccasionRead` — this occasion has lists shared into it and
      // claims filed under it. The row must print none of it.
      onlyPrompts([
        {
          ...testPrompt,
          list_count: 4,
          my_claimed_count: 2,
          last_activity_at: "2026-03-01T00:00:00Z",
        },
      ]);

      renderComponent();

      const link = await screen.findByRole("link", { name: "Christmas 2025" });
      expect(link).toHaveAttribute("href", "/occasions/25");
      // The whole line, asserted as a whole string rather than through
      // `toHaveTextContent`, which matches on substring: rule 2 is a claim about
      // what is *absent* — no counts, no claimers, no gifts, no dates — so a
      // fifth thing appended to the line has to fail this.
      expect(link.closest("p")?.textContent).toBe(
        "Christmas 2025 · Boone Family has been quiet for a while",
      );
      // The family is a prefix that identifies which occasion, not a destination.
      expect(screen.queryByRole("link", { name: /Boone Family/ })).not.toBeInTheDocument();
    });

    it("renders prompt rows after the requests and the invites", async () => {
      server.use(
        http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
        http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
        http.get(`${API}/occasions/archive-prompts`, () => HttpResponse.json([testPrompt])),
      );

      renderComponent();

      await screen.findByRole("link", { name: "Christmas 2025" });
      const rows = within(banner()!).getAllByRole("listitem");
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent("Dave Boone");
      expect(rows[1]).toHaveTextContent("The Smiths");
      expect(rows[2]).toHaveTextContent("Christmas 2025");
    });

    it("renders the banner for prompts alone", async () => {
      onlyPrompts();

      renderComponent();

      expect(await screen.findByRole("link", { name: "Christmas 2025" })).toBeInTheDocument();
      expect(banner()).toBeInTheDocument();
    });

    it("opens a confirm dialog naming the occasion, and fires no PUT on Cancel", async () => {
      const putHandler = vi.fn();
      onlyPrompts();
      server.use(
        http.put(`${API}/occasions/:id`, ({ params }) => {
          putHandler(params.id);
          return HttpResponse.json({});
        }),
      );

      renderComponent();

      await userEvent.click(
        await screen.findByLabelText("Archive Christmas 2025 in Boone Family"),
      );

      expect(await screen.findByText("Archive Christmas 2025?")).toBeInTheDocument();
      expect(
        screen.getByText(/archiving only stops new ones. Your shopping for it stays where it is/i),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Archive Christmas 2025?")).not.toBeInTheDocument();
      expect(putHandler).not.toHaveBeenCalled();
      // Cancelling archives nothing and leaves the row.
      expect(screen.getByRole("link", { name: "Christmas 2025" })).toBeInTheDocument();
    });

    it("archives the occasion on confirm and clears the row", async () => {
      let archived = false;
      const putBody = vi.fn();
      server.use(
        http.get(`${API}/families/invites`, () => HttpResponse.json([])),
        http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
        http.get(`${API}/occasions/archive-prompts`, () =>
          HttpResponse.json(archived ? [] : [testPrompt]),
        ),
        http.put(`${API}/occasions/:id`, async ({ params, request }) => {
          putBody(params.id, await request.json());
          archived = true;
          return HttpResponse.json({});
        }),
      );

      renderComponent();

      await userEvent.click(
        await screen.findByLabelText("Archive Christmas 2025 in Boone Family"),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      await waitFor(() => {
        expect(putBody).toHaveBeenCalledWith("25", { is_archived: true });
      });
      await waitFor(() => {
        expect(banner()).not.toBeInTheDocument();
      });
    });

    it("keeps the dialog open with its buttons disabled while the archive is in flight", async () => {
      onlyPrompts();
      server.use(
        http.put(`${API}/occasions/:id`, async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      );

      renderComponent();

      await userEvent.click(
        await screen.findByLabelText("Archive Christmas 2025 in Boone Family"),
      );
      const confirmBtn = await screen.findByRole("button", { name: "Archive" });
      // Fire without awaiting so the mutation starts but does not resolve.
      userEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
      });
      // Still open — the dialog does not vanish mid-mutation.
      expect(screen.getByText("Archive Christmas 2025?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });

    it("fires the dismiss POST on Not yet and clears the row", async () => {
      let dismissed = false;
      const dismissHandler = vi.fn();
      server.use(
        http.get(`${API}/families/invites`, () => HttpResponse.json([])),
        http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
        http.get(`${API}/occasions/archive-prompts`, () =>
          HttpResponse.json(dismissed ? [] : [testPrompt]),
        ),
        http.post(`${API}/occasions/:id/archive-prompt/dismiss`, ({ params }) => {
          dismissHandler(params.id);
          dismissed = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderComponent();

      await userEvent.click(
        await screen.findByLabelText("Dismiss the prompt to archive Christmas 2025 in Boone Family"),
      );

      await waitFor(() => {
        expect(dismissHandler).toHaveBeenCalledWith("25");
      });
      await waitFor(() => {
        expect(banner()).not.toBeInTheDocument();
      });
    });

    // The one that matters: the two mutations differ only in what they sweep,
    // and on screen the difference is invisible.
    it("sweeps only the prompts key on Not yet, and the occasion prefix on archive", async () => {
      onlyPrompts();
      server.use(
        http.post(`${API}/occasions/:id/archive-prompt/dismiss`, () =>
          new HttpResponse(null, { status: 204 }),
        ),
      );

      const { queryClient } = renderComponent();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await userEvent.click(
        await screen.findByLabelText("Dismiss the prompt to archive Christmas 2025 in Boone Family"),
      );

      await waitFor(() => {
        const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
        expect(keys).toContainEqual(["occasions", "archive-prompts"]);
      });
      const dismissKeys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown }).queryKey,
      );
      // A snooze hides one row for one viewer: the strip and every family's
      // occasion list are untouched.
      expect(dismissKeys).not.toContainEqual(["occasions"]);
    });

    it("sweeps the occasion prefix and the share targets on archive", async () => {
      onlyPrompts();
      server.use(http.put(`${API}/occasions/:id`, () => HttpResponse.json({})));

      const { queryClient } = renderComponent();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await userEvent.click(
        await screen.findByLabelText("Archive Christmas 2025 in Boone Family"),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      await waitFor(() => {
        const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
        expect(keys).toContainEqual(["occasions"]);
        expect(keys).toContainEqual(["share-targets"]);
      });
    });

    it("disables only the answered row's buttons while its call is in flight", async () => {
      onlyPrompts([testPrompt, otherPrompt]);
      server.use(
        http.post(`${API}/occasions/:id/archive-prompt/dismiss`, async () => {
          await delay("infinite");
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderComponent();

      const notYet = await screen.findByLabelText(
        "Dismiss the prompt to archive Christmas 2025 in Boone Family",
      );
      userEvent.click(notYet);

      await waitFor(() => {
        expect(
          screen.getByLabelText("Dismiss the prompt to archive Christmas 2025 in Boone Family"),
        ).toBeDisabled();
      });
      expect(screen.getByLabelText("Archive Christmas 2025 in Boone Family")).toBeDisabled();
      // The other row stays live — the guard is against answering one row twice.
      expect(screen.getByLabelText("Archive Easter 2026 in Boone Family")).toBeEnabled();
      expect(
        screen.getByLabelText("Dismiss the prompt to archive Easter 2026 in Boone Family"),
      ).toBeEnabled();
    });

    it("says nothing when the prompts query fails, while a failed invites query still toasts", async () => {
      server.use(
        http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
        http.get(`${API}/occasions/archive-prompts`, () =>
          new HttpResponse(null, { status: 500 }),
        ),
        http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      );

      const { queryClient } = renderComponent();

      await screen.findByLabelText("Accept invite to The Smiths");
      await waitFor(() => {
        expect(queryClient.getQueryState(["occasions", "archive-prompts"])?.status).toBe("error");
      });
      // No row, and nothing said about it.
      expect(screen.queryByText(/quiet for a while/)).not.toBeInTheDocument();
      expect(screen.queryByText(/prompt/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText("Failed to load pending requests and invites."),
      ).not.toBeInTheDocument();

      // The other arm, asserted alongside it, because the point is that they differ.
      server.use(
        http.get(`${API}/families/invites`, () => new HttpResponse(null, { status: 500 })),
      );
      await queryClient.refetchQueries({ queryKey: ["familyInvites"] });

      expect(
        (await screen.findAllByText("Failed to load pending requests and invites.")).length,
      ).toBeGreaterThan(0);
    });
  });
});
