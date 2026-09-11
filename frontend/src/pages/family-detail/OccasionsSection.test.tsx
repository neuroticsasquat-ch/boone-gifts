import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { memberToken, organizerToken, renderFamilyDetail } from "./harness";

const API = "https://boone-gifts-api.localhost";

function occasion(id: number, name: string, isArchived = false, createdById = 1) {
  return {
    id,
    family_id: 1,
    name,
    is_archived: isArchived,
    created_by_id: createdById,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}

/** Serve the active and archived lists the `?archived=` param asks for. */
function serveOccasions(active: ReturnType<typeof occasion>[], archived: ReturnType<typeof occasion>[] = []) {
  return http.get(`${API}/families/1/occasions`, ({ request }) => {
    const wantsArchived = new URL(request.url).searchParams.get("archived") === "true";
    return HttpResponse.json(wantsArchived ? archived : active);
  });
}

/** The <li> for one occasion, so per-row controls can be queried unambiguously. */
function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("OccasionsSection", () => {
  // react-hot-toast keeps its queue at module level, so a toast raised by one
  // test outlives `cleanup()` and shows up in the next one.
  beforeEach(() => toast.remove());

  it("lists the family's active occasions, each linking to its occasion page", async () => {
    server.use(serveOccasions([occasion(3, "Christmas 2026"), occasion(4, "Gran's 80th")]));

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Christmas 2026" })).toHaveAttribute(
      "href",
      "/occasions/3"
    );
    expect(screen.getByRole("link", { name: "Gran's 80th" })).toHaveAttribute(
      "href",
      "/occasions/4"
    );
  });

  it("a family with no active occasion says so, and says it cannot be shared to", async () => {
    server.use(serveOccasions([]));

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(
        screen.getByText("Boone Family has no active occasion, so no list can be shared with it.")
      ).toBeInTheDocument();
    });
  });

  it("any member can create the first occasion — no warning, POST goes straight out", async () => {
    let capturedBody: unknown;
    server.use(
      serveOccasions([]),
      http.post(`${API}/families/1/occasions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { ...occasion(3, "Christmas 2026"), has_other_active: false },
          { status: 201 }
        );
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Occasion name/)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Christmas 2026");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ name: "Christmas 2026" });
    });
    expect(screen.queryByRole("button", { name: "Create Anyway" })).not.toBeInTheDocument();
  });

  it("warns before creating a second active occasion, naming the one that exists", async () => {
    let posted = false;
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.post(`${API}/families/1/occasions`, () => {
        posted = true;
        return HttpResponse.json(
          { ...occasion(4, "Gran's 80th"), has_other_active: true },
          { status: 201 }
        );
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Gran's 80th");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));

    expect(
      screen.getByText(
        "Boone Family already has an active occasion, Christmas 2026. Create another?"
      )
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("the warning does not block — Create Anyway posts", async () => {
    let capturedBody: unknown;
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.post(`${API}/families/1/occasions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { ...occasion(4, "Gran's 80th"), has_other_active: true },
          { status: 201 }
        );
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Gran's 80th");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Anyway" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ name: "Gran's 80th" });
    });
  });

  it("cancelling the warning creates nothing and keeps the typed name", async () => {
    let posted = false;
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.post(`${API}/families/1/occasions`, () => {
        posted = true;
        return HttpResponse.json({ ...occasion(4, "x"), has_other_active: true }, { status: 201 });
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Gran's 80th");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));
    await userEvent.click(
      within(screen.getByText(/already has an active occasion/).closest("div") as HTMLElement)
        .getByRole("button", { name: "Cancel" })
    );

    expect(posted).toBe(false);
    expect(screen.getByPlaceholderText(/Occasion name/)).toHaveValue("Gran's 80th");
  });

  it("organizer sees rename and archive on each occasion; a member sees neither", async () => {
    server.use(serveOccasions([occasion(3, "Christmas 2026")]));

    const organizerView = renderFamilyDetail(organizerToken);
    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    const organizerRow = within(rowFor("Christmas 2026"));
    expect(organizerRow.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(organizerRow.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    organizerView.unmount();

    renderFamilyDetail(memberToken);
    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    const memberRow = within(rowFor("Christmas 2026"));
    expect(memberRow.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    expect(memberRow.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("rename sends the new name to PUT /occasions/:id", async () => {
    let capturedBody: unknown;
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.put(`${API}/occasions/3`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(occasion(3, "Christmas 2027"));
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(within(rowFor("Christmas 2026")).getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Occasion name");
    await userEvent.clear(input);
    await userEvent.type(input, "Christmas 2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ name: "Christmas 2027" });
    });
  });

  it("archive sends is_archived and drops the occasion from the active list", async () => {
    let capturedBody: unknown;
    let archived = false;
    server.use(
      http.get(`${API}/families/1/occasions`, ({ request }) => {
        const wantsArchived = new URL(request.url).searchParams.get("archived") === "true";
        if (wantsArchived) return HttpResponse.json(archived ? [occasion(3, "Christmas 2026", true)] : []);
        return HttpResponse.json(archived ? [] : [occasion(3, "Christmas 2026")]);
      }),
      http.put(`${API}/occasions/3`, async ({ request }) => {
        capturedBody = await request.json();
        archived = true;
        return HttpResponse.json(occasion(3, "Christmas 2026", true));
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(within(rowFor("Christmas 2026")).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ is_archived: true });
    });
    await waitFor(() => {
      expect(screen.queryByText("Christmas 2026")).not.toBeInTheDocument();
    });
  });

  // Archiving is gated per field by the backend (NEU-1294 decision 4), so the
  // member who created an occasion keeps the control the nudge will send them to
  // — and still cannot rename it.
  it("a member who created an occasion sees Archive on it and not Rename", async () => {
    server.use(serveOccasions([occasion(3, "Christmas 2026", false, 2), occasion(4, "Gran's 80th")]));

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    const ownRow = within(rowFor("Christmas 2026"));
    expect(ownRow.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(ownRow.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();

    // Somebody else's occasion in the same family is unchanged.
    const otherRow = within(rowFor("Gran's 80th"));
    expect(otherRow.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("a 403 on archive names the archive rule, which the rename rule no longer covers", async () => {
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.put(`${API}/occasions/3`, () =>
        HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(within(rowFor("Christmas 2026")).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Only an organizer or the person who created this occasion can archive it.",
        )
      ).toBeInTheDocument();
    });
  });

  it("a 403 on rename says the control was organizer-only after all", async () => {
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.put(`${API}/occasions/3`, () =>
        HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      ),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(within(rowFor("Christmas 2026")).getByRole("button", { name: "Rename" }));
    await userEvent.type(screen.getByLabelText("Occasion name"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByText("Only an organizer can rename an occasion.")
      ).toBeInTheDocument();
    });
  });

  // The section is the family's *active* occasions and has no archived state to
  // be put into: the archive is a page of its own now (NEU-1278).
  it("the archive entry point is a link to the family's archive, not a toggle", async () => {
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")], [occasion(2, "Christmas 2025", true)]),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "View archive" })).toHaveAttribute(
      "href",
      "/people/families/1/archive",
    );
    expect(
      screen.queryByRole("button", { name: "View archived occasions" })
    ).not.toBeInTheDocument();
  });

  // Nothing archived reaches the family page — not through a toggle, and not by
  // the section quietly asking for it.
  it("only ever asks for the active occasions", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(`${API}/families/1/occasions`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("archived"));
        return HttpResponse.json([occasion(3, "Christmas 2026")]);
      }),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(asked).not.toContain("true");
    expect(screen.queryByText("Christmas 2025")).not.toBeInTheDocument();
  });

  it("a stale list is back-stopped: has_other_active on the create response says so afterwards", async () => {
    server.use(
      // The page loads an empty list, so nothing warns before the write — but
      // another member created one in the meantime.
      serveOccasions([]),
      http.post(`${API}/families/1/occasions`, () =>
        HttpResponse.json(
          { ...occasion(4, "Gran's 80th"), has_other_active: true },
          { status: 201 }
        )
      ),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Occasion name/)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Gran's 80th");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));

    await waitFor(() => {
      expect(
        screen.getByText("Boone Family already had an active occasion. It now has more than one.")
      ).toBeInTheDocument();
    });
  });

  it("no back-stop notice when the warning was already shown and accepted", async () => {
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")]),
      http.post(`${API}/families/1/occasions`, () =>
        HttpResponse.json(
          { ...occasion(4, "Gran's 80th"), has_other_active: true },
          { status: 201 }
        )
      ),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Occasion name/), "Gran's 80th");
    await userEvent.click(screen.getByRole("button", { name: "Create Occasion" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Anyway" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Occasion name/)).toHaveValue("");
    });
    expect(screen.queryByText(/already had an active occasion/)).not.toBeInTheDocument();
  });
});
