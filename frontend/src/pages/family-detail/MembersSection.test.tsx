import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { memberToken, organizerToken, renderFamilyDetail, sampleFamily } from "./harness";

const API = "https://boone-gifts-api.localhost";

/** Both members are organizers, so demoting or removing either can 409. */
const twoOrganizers = {
  ...sampleFamily,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "organizer" },
  ],
};

/** The Members zone, so a control or an error can be attributed to it. */
function membersZone(): HTMLElement {
  return screen
    .getByRole("heading", { level: 2, name: "Members" })
    .closest("section") as HTMLElement;
}

describe("MembersSection", () => {
  beforeEach(() => toast.remove());

  it("renders members with roles", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    const zone = membersZone();
    expect(within(zone).getByText("Alice")).toBeInTheDocument();
    expect(within(zone).getByText("Bob")).toBeInTheDocument();
    expect(within(zone).getByText("organizer")).toBeInTheDocument();
    expect(within(zone).getByText("member")).toBeInTheDocument();
  });

  it("organizer sees promote/demote and remove for other members, not for themselves", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    // Alice is the viewer; the only controls on the page are Bob's row.
    const zone = membersZone();
    expect(within(zone).getAllByRole("button", { name: "Make Organizer" })).toHaveLength(1);
    expect(within(zone).getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    const aliceRow = within(zone).getByText("Alice").closest("li") as HTMLElement;
    expect(within(aliceRow).queryByRole("button")).not.toBeInTheDocument();
  });

  it("plain member sees neither promote/demote nor remove", async () => {
    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    expect(screen.queryByText("Make Organizer")).not.toBeInTheDocument();
    expect(screen.queryByText("Make Member")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("demote: clicking Make Member sends role: member to PUT /families/:id/members/:userId/role", async () => {
    let capturedBody: unknown;
    server.use(
      http.put(`${API}/families/1/members/2/role`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...twoOrganizers.members[1], role: "member" });
      }),
    );

    renderFamilyDetail(organizerToken, "1", () => HttpResponse.json(twoOrganizers));

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Make Member" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ role: "member" });
    });
  });

  it("remove: the dialog names the member and the family, and cancelling sends nothing", async () => {
    let called = false;
    server.use(
      http.delete(`${API}/families/1/members/2`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(within(membersZone()).getByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove Bob from Boone Family?")).toBeInTheDocument();
    // Conditional and bare: no count, no gift, no claimer, and no assertion
    // that a claim exists (`CONTEXT.md` rule 2).
    expect(
      within(dialog).getByText(/any gifts claimed between you will be released/)
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("remove: confirming sends DELETE /families/:id/members/:userId", async () => {
    let called = false;
    server.use(
      http.delete(`${API}/families/1/members/2`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(within(membersZone()).getByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(called).toBe(true);
    });
  });

  it("409 on remove closes the dialog and shows the last-organizer message inside the Members zone", async () => {
    server.use(
      http.delete(`${API}/families/1/members/2`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken, "1", () => HttpResponse.json(twoOrganizers));

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(within(membersZone()).getByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    // The fix is promoting another organizer, in this same section behind the
    // modal — so the dialog gets out of the way and the message lands in the
    // zone's own error line.
    await waitFor(() => {
      expect(
        within(membersZone()).getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("409 on demote shows the last-organizer message inside the Members zone", async () => {
    server.use(
      http.put(`${API}/families/1/members/2/role`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken, "1", () => HttpResponse.json(twoOrganizers));

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    // Bob is an organizer; "Make Member" demotes him → 409.
    const zone = membersZone();
    await userEvent.click(within(zone).getByRole("button", { name: "Make Member" }));

    await waitFor(() => {
      expect(
        within(zone).getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
  });
});
