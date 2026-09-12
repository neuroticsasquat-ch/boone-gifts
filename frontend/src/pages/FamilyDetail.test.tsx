import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  memberToken,
  organizerToken,
  renderFamilyDetail,
  sampleFamily,
} from "./family-detail/harness";

const API = "https://boone-gifts-api.localhost";

/** The zone headings, in the order the page lays them out. */
function zoneHeadings(): string[] {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent ?? "");
}

describe("FamilyDetail", () => {
  // react-hot-toast keeps its queue at module level, so a toast raised by one
  // test outlives `cleanup()` and shows up in the next one.
  beforeEach(() => toast.remove());

  it("renders the family name", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });
  });

  it("an organizer sees four zones, in order", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    expect(zoneHeadings()).toEqual([
      "Members",
      "Occasions",
      "Family settings",
      "Leave Family",
    ]);
  });

  it("a plain member sees the same order without Family settings", async () => {
    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    // Role changes what renders, never where: the surviving three keep their
    // places rather than the page reshuffling around a demotion.
    expect(zoneHeadings()).toEqual(["Members", "Occasions", "Leave Family"]);
  });

  it("leave: the dialog names the family, and cancelling sends nothing", async () => {
    let called = false;
    server.use(
      http.delete(`${API}/families/1/members/2`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Leave Family" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Leave Boone Family?")).toBeInTheDocument();
    // Bare and conditional — no count, no gift, no claimer (`CONTEXT.md` rule 2).
    expect(
      within(dialog).getByText(/any gifts you've claimed here will be released/)
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Boone Family")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("leave: confirming calls DELETE /families/:id/members/:userId → navigates to /people", async () => {
    server.use(
      http.delete(`${API}/families/1/members/2`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Leave Family" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(screen.getByText("People Page")).toBeInTheDocument();
    });
  });

  it("409 on leave closes the dialog and shows the last-organizer message inside the Leave Family zone", async () => {
    server.use(
      http.delete(`${API}/families/1/members/1`, () =>
        HttpResponse.json({ detail: "Cannot remove last organizer" }, { status: 409 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    const zone = screen.getByRole("heading", { level: 2, name: "Leave Family" })
      .closest("section") as HTMLElement;
    await userEvent.click(within(zone).getByRole("button", { name: "Leave Family" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    // Beside the control that provoked it, not scrolled away into another zone
    // — and with the dialog out of the way, because the fix is promoting
    // another organizer in the Members section behind it.
    await waitFor(() => {
      expect(
        within(zone).getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // A reachability failure keeps its own arm (CONTEXT.md rule 7), but the arm
  // still needs a way back, and it gets the same one the page has.
  it("the not-found arm names People too, and points at /people", async () => {
    renderFamilyDetail(organizerToken, "9", () =>
      HttpResponse.json({ detail: "Not found" }, { status: 404 })
    );

    await waitFor(() => {
      expect(screen.getByText("Family not found.")).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: /Back to People/i });
    expect(backLink).toHaveTextContent("\u2190 Back to People");
    expect(backLink).toHaveAttribute("href", "/people");
  });

  // Deep-linked: nothing behind it, so it is a real link to the named parent —
  // one a viewer can cmd-click like any other.
  it("names People when it was deep-linked into", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText(/Back to People/i)).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: /Back to People/i });
    expect(backLink).toHaveTextContent("\u2190 Back to People");
    expect(backLink).toHaveAttribute("href", "/people");
  });

  // Arrived from a list rather than from /people: a button, because there is no
  // address to put in a status bar, and Back means the list.
  it("returns to the page it was opened from, and says only Back", async () => {
    renderFamilyDetail(organizerToken, "1", () => HttpResponse.json(sampleFamily), {
      arriveFrom: "/lists/1",
    });

    await userEvent.click(screen.getByRole("button", { name: "arrive" }));
    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /Back to People/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "\u2190 Back" }));

    expect(screen.getByRole("button", { name: "arrive" })).toBeInTheDocument();
  });
});
