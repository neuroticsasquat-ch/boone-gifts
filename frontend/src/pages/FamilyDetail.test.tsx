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

  it("leave: click Leave Family → calls DELETE /families/:id/members/:userId → navigates to /people", async () => {
    server.use(
      http.delete(`${API}/families/1/members/2`, () => new HttpResponse(null, { status: 204 })),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Boone Family")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Leave Family" }));

    await waitFor(() => {
      expect(screen.getByText("People Page")).toBeInTheDocument();
    });
  });

  it("409 on leave shows the last-organizer message inside the Leave Family zone", async () => {
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

    // Beside the control that provoked it, not scrolled away into another zone.
    await waitFor(() => {
      expect(
        within(zone).getByText("Promote another organizer first, or delete the family.")
      ).toBeInTheDocument();
    });
  });

  it("the not-found arm reads Back to People too, and points at /people", async () => {
    // The other half of criterion 8. The arm's own copy is the only thing this
    // ticket touches in it.
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

  it("shows a back link reading Back to People, pointing at /people", async () => {
    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText(/Back to People/i)).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: /Back to People/i });
    expect(backLink).toHaveTextContent("\u2190 Back to People");
    expect(backLink).toHaveAttribute("href", "/people");
  });
});
