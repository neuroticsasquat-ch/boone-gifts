import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import toast, { Toaster } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { AuthProvider } from "../../contexts/AuthContext";
import { FamilyDetail } from "../FamilyDetail";

const API = "https://boone-gifts-api.localhost";

// JWT for user id=1 (organizer)
const organizerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "organizer@test.com", name: "Alice", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

// JWT for user id=2 (plain member)
const memberToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "member@test.com", name: "Bob", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const sampleFamily = {
  id: 1,
  name: "Boone Family",
  created_by_id: 1,
  members: [
    { user_id: 1, name: "Alice", role: "organizer" },
    { user_id: 2, name: "Bob", role: "member" },
  ],
};

function occasion(id: number, name: string, isArchived = false) {
  return {
    id,
    family_id: 1,
    name,
    is_archived: isArchived,
    created_by_id: 1,
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

function renderFamilyDetail(token: string) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
    http.get(`${API}/families/1`, () => HttpResponse.json(sampleFamily)),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/people/families/1"]}>
          <Routes>
            <Route path="/people/families/:id" element={<FamilyDetail />} />
            <Route path="/people" element={<div>People Page</div>} />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
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
        screen.getByText("Only an organizer can rename or archive an occasion.")
      ).toBeInTheDocument();
    });
  });

  it("the archive entry point swaps the section for the archived occasions", async () => {
    server.use(
      serveOccasions([occasion(3, "Christmas 2026")], [occasion(2, "Christmas 2025", true)]),
    );

    renderFamilyDetail(memberToken);

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "View archived occasions" }));

    await waitFor(() => {
      expect(screen.getByText("Christmas 2025")).toBeInTheDocument();
    });
    expect(screen.queryByText("Christmas 2026")).not.toBeInTheDocument();
    // Nothing archived is created into, and nothing archived is edited here.
    expect(screen.queryByRole("button", { name: "Create Occasion" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View active occasions" }));
    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
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

  it("an organizer can unarchive from the archived list, so Archive is not a one-way door", async () => {
    let capturedBody: unknown;
    server.use(
      serveOccasions([], [occasion(2, "Christmas 2025", true)]),
      http.put(`${API}/occasions/2`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(occasion(2, "Christmas 2025"));
      }),
    );

    renderFamilyDetail(organizerToken);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "View archived occasions" })
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "View archived occasions" }));

    await waitFor(() => {
      expect(screen.getByText("Christmas 2025")).toBeInTheDocument();
    });
    // The archived list carries its inverse and nothing else.
    const row = within(rowFor("Christmas 2025"));
    expect(row.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    await userEvent.click(row.getByRole("button", { name: "Unarchive" }));

    await waitFor(() => {
      expect(capturedBody).toEqual({ is_archived: false });
    });
  });
});
