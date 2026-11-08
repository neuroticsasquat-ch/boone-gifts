import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { memberToken, organizerToken, renderFamilyDetail } from "./harness";

const API = "https://boone-gifts-api.localhost";

const pendingInvite = {
  id: 10,
  family_id: 1,
  email: "newperson@example.com",
  role: "member",
  token: "abc123",
  invited_by_id: 1,
  expires_at: "2099-01-01T00:00:00Z",
  accepted_at: null,
  declined_at: null,
  created_at: "2026-06-28T00:00:00Z",
  status: "pending" as const,
};

describe("FamilySettingsSection", () => {
  beforeEach(() => toast.remove());

  it("invite success: organizer submits email → POST /families/1/invites called → new invite row appears", async () => {
    server.use(
      http.post(`${API}/families/1/invites`, () => HttpResponse.json(pendingInvite, { status: 201 })),
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([pendingInvite])),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText("Email address");
    await userEvent.type(emailInput, "newperson@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(screen.getByText("newperson@example.com")).toBeInTheDocument();
    });
    expect(emailInput).toHaveValue("");
  });

  it("default invite: POST body carries the email and the member role", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API}/families/1/invites`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 10 }, { status: 201 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ email: "new@example.com", role: "member" });
    });
  });

  it("role dropdown: organizer selected → POST body carries role organizer, resets to member after send", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API}/families/1/invites`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 10 }, { status: 201 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    const roleSelect = screen.getByRole("combobox", { name: /Role/i });
    expect(roleSelect).toHaveValue("member");

    await userEvent.type(screen.getByPlaceholderText("Email address"), "chief@example.com");
    await userEvent.selectOptions(roleSelect, "organizer");
    await userEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ email: "chief@example.com", role: "organizer" });
    });
    await waitFor(() => {
      expect(roleSelect).toHaveValue("member");
    });
  });

  it("invite rows show the status and the role", async () => {
    const base = {
      family_id: 1,
      token: "abc123",
      invited_by_id: 1,
      expires_at: "2099-01-01T00:00:00Z",
      accepted_at: null,
      declined_at: null,
      created_at: "2026-06-28T00:00:00Z",
      status: "pending" as const,
    };

    server.use(
      http.get(`${API}/families/1/invites`, () =>
        HttpResponse.json([
          { ...base, id: 10, email: "plain@example.com", role: "member" },
          { ...base, id: 12, email: "chief@example.com", role: "organizer" },
        ])
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("plain@example.com")).toBeInTheDocument();
    });

    const rowMeta = (email: string) =>
      screen.getByText(email).parentElement?.querySelector("p:nth-of-type(2)")?.textContent;

    expect(rowMeta("plain@example.com")).toBe("pending · Member");
    expect(rowMeta("chief@example.com")).toBe("pending · Organizer");
  });

  it("revoke: pending invite shown, organizer clicks Revoke → row disappears", async () => {
    let inviteDeleted = false;
    server.use(
      http.get(`${API}/families/1/invites`, () =>
        HttpResponse.json(inviteDeleted ? [] : [{ ...pendingInvite, email: "pending@example.com" }])
      ),
      http.delete(`${API}/families/1/invites/10`, () => {
        inviteDeleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
    });
  });

  it("revoke: the dialog names the invite it was raised from, and cancelling sends nothing", async () => {
    let called = false;
    server.use(
      http.get(`${API}/families/1/invites`, () =>
        HttpResponse.json([
          { ...pendingInvite, id: 10, email: "first@example.com" },
          { ...pendingInvite, id: 11, email: "second@example.com" },
        ])
      ),
      http.delete(`${API}/families/1/invites/:inviteId`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("second@example.com")).toBeInTheDocument();
    });

    const secondRow = screen.getByText("second@example.com").closest("li") as HTMLElement;
    await userEvent.click(within(secondRow).getByRole("button", { name: "Revoke" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Revoke the invite to second@example.com?")
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("409 duplicate invite shows inline error message", async () => {
    server.use(
      http.post(`${API}/families/1/invites`, () =>
        HttpResponse.json({ detail: "Duplicate" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "dup@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(
        screen.getByText("A pending invite for that email already exists.")
      ).toBeInTheDocument();
    });
  });

  it("400 bad email shows backend detail message", async () => {
    server.use(
      http.post(`${API}/families/1/invites`, () =>
        HttpResponse.json({ detail: "Invalid email" }, { status: 400 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "bad@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });
  });

  it("rename: fill input and submit calls PUT /families/:id", async () => {
    server.use(
      http.put(`${API}/families/1`, () =>
        HttpResponse.json({ id: 1, name: "The Boone Family", created_by_id: 1, members: [] })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    // The rename input is placeheld with the family's current name.
    const input = screen.getByPlaceholderText("Boone Family");
    await userEvent.type(input, "The Boone Family");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(screen.queryByText("Failed to rename family.")).not.toBeInTheDocument();
      expect(input).toHaveValue("");
    });
  });

  it("delete: click Delete Family then confirm in the dialog → navigates to /people", async () => {
    server.use(
      http.delete(`${API}/families/1`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete Family" }));
    // The trigger and the dialog's action share a label, so the second click is
    // scoped to the dialog.
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Family" }));

    await waitFor(() => {
      expect(screen.getByText("People Page")).toBeInTheDocument();
    });
  });

  it("delete: the dialog stays open with every button disabled while deleting", async () => {
    let release: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.delete(`${API}/families/1`, async () => {
        await inFlight;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete Family" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Family" }));

    // The two-step this replaced stayed up with its confirm button disabled;
    // the dialog does the same rather than vanishing mid-request.
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Delete Family" })).toBeDisabled();
    });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    release();
    await waitFor(() => {
      expect(screen.getByText("People Page")).toBeInTheDocument();
    });
  });

  it("organizer gating: a plain member sees no settings zone at all", async () => {
    server.use(
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([pendingInvite])),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    // The zone is unmounted, so its invites query never runs — the gate moved up
    // to the parent rather than disappearing.
    expect(screen.queryByText("Family settings")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email address")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send Invite" })).not.toBeInTheDocument();
    expect(screen.queryByText("Invites")).not.toBeInTheDocument();
    expect(screen.queryByText("newperson@example.com")).not.toBeInTheDocument();
  });

  it("the four settings controls are h3s inside the Family settings zone", async () => {
    server.use(
      http.get(`${API}/families/1/invites`, () => HttpResponse.json([pendingInvite])),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    const zone = screen
      .getByRole("heading", { level: 2, name: "Family settings" })
      .closest("section") as HTMLElement;

    // Invites is still conditional on there being any, so wait for the query.
    await waitFor(() => {
      expect(
        within(zone).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
      ).toEqual(["Invite to Family", "Invites", "Rename Family", "Delete Family"]);
    });
  });
});
