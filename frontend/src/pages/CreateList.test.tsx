import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import toast, { Toaster } from "react-hot-toast";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { ArrivedFrom } from "../test/arrived-from";
import { CreateList } from "./CreateList";

const API = "https://boone-gifts-api.localhost";

function token(claims: Record<string, unknown>) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999, ...claims })),
    "fake-signature",
  ].join(".");
}

const authToken = token({});

const families = [
  { id: 7, name: "The Boones", role: "organizer", member_count: 3 },
  { id: 8, name: "The Smiths", role: "member", member_count: 2 },
];

/** An occasion as `GET /occasions` indexes it — the read the sharing dialog
 *  shapes a draft's family rows from. */
function indexed(id: number, familyId: number, name: string) {
  return {
    id,
    family_id: familyId,
    family_name: families.find((f) => f.id === familyId)?.name ?? "",
    name,
    is_archived: false,
    created_by_id: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    list_count: 0,
    my_claimed_count: 0,
    my_bought_count: 0,
    last_activity_at: "2026-01-01",
  };
}

/** Both families have **exactly one** active occasion — the shape the retired
 *  pre-check ticked on sight, so a test that finds nothing ticked here is the
 *  assertion this ticket asks for by name. */
const occasionIndex = [indexed(70, 7, "Christmas 2026"), indexed(80, 8, "Smith Christmas")];

const connections = [
  {
    id: 5,
    status: "accepted",
    user: { id: 2, name: "Alice", email: "alice@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
  {
    id: 6,
    status: "accepted",
    user: { id: 3, name: "Gran Boone", email: "gran@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
];

function serveFamilies(list = families, index = occasionIndex, people = connections) {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json(list)),
    http.get(`${API}/occasions`, () => HttpResponse.json(index)),
    http.get(`${API}/connections`, () => HttpResponse.json(people)),
  );
}

function serveCreate() {
  const posted = vi.fn();
  server.use(
    http.post(`${API}/lists`, async ({ request }) => {
      posted(await request.json());
      return HttpResponse.json({ id: 1 }, { status: 201 });
    }),
  );
  return posted;
}

/** The address, so `?share=open` can be read, and a Back button to pop it. */
function Address() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <p>{`address: ${location.pathname}${location.search}`}</p>
      <button onClick={() => navigate(-1)}>go back</button>
    </>
  );
}

/** `arriveFrom` starts the session elsewhere and pushes into the form from it,
 *  so the sharing dialog's close has somewhere of ours to pop back to. */
function renderCreateList(
  authToken: string,
  { entries = ["/lists/new"], arriveFrom }: { entries?: string[]; arriveFrom?: string } = {},
) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={arriveFrom ? [arriveFrom] : entries}
          initialIndex={arriveFrom ? 0 : entries.length - 1}
        >
          <NavigationDepthProvider>
            <Routes>
              <Route path="/lists/new" element={<CreateList />} />
              <Route path="/folders/:id" element={<ArrivedFrom to="/lists/new" />} />
              <Route path="*" element={null} />
            </Routes>
          </NavigationDepthProvider>
          <Address />
          <Toaster />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** The form's own section, and the way into the dialog the list page mounts. */
const sharingSection = () => screen.getByRole("button", { name: /choose…/i });
const sharingDialog = () => screen.queryByRole("dialog", { name: "Who can see this list" });

async function openSharing() {
  await userEvent.click(sharingSection());
  return screen.findByRole("dialog", { name: "Who can see this list" });
}

describe("CreateList — who can see this list", () => {
  // react-hot-toast keeps its queue at module level, so a toast raised by one
  // test outlives `cleanup()` and shows up in the next one.
  beforeEach(() => toast.remove());

  // The assertion the ticket asks for by name. Someone who learned to rely on
  // the pre-check creates their next list unshared — deliberately, because
  // "uncheck any you'd rather keep it from" is the wrong direction for a
  // sharing control (project spec §12).
  it("arrives with nothing checked, and says so", async () => {
    serveFamilies();

    renderCreateList(authToken);

    expect(await screen.findByText("This list isn't shared with anyone.")).toBeInTheDocument();

    const dialog = await openSharing();
    // Both halves, so the assertion cannot pass on a paint that has the family
    // rows and not the people.
    await within(dialog).findByRole("checkbox", { name: /share with gran boone/i });
    within(dialog).getByRole("checkbox", { name: /share with the boones/i });
    for (const box of within(dialog).getAllByRole("checkbox")) expect(box).not.toBeChecked();
  });

  it("mounts the list page's own dialog, people and all", async () => {
    // The same component, so creation gains the people picker, the one filter
    // box and every disabled-with-reason rule without restating any of them.
    serveFamilies();

    renderCreateList(authToken);

    const dialog = await openSharing();
    expect(
      within(dialog).getByRole("searchbox", { name: /filter people and families/i }),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("checkbox", { name: /share with gran boone/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: /share with the boones/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Families", "People"]);
  });

  it("pushes ?share=open, and Back closes it with the form intact", async () => {
    serveFamilies();

    renderCreateList(authToken, { arriveFrom: "/folders/5" });
    await userEvent.click(screen.getByRole("button", { name: "arrive" }));

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Birthday");
    await userEvent.type(screen.getByRole("textbox", { name: /description/i }), "Ideas");
    await openSharing();
    expect(await screen.findByText("address: /lists/new?share=open")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /share with the boones/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "go back" }));

    expect(await screen.findByText("address: /lists/new")).toBeInTheDocument();
    expect(sharingDialog()).not.toBeInTheDocument();
    // The form is unmounted by neither, so what was typed and what was ticked
    // both survive the close.
    expect(screen.getByRole("textbox", { name: /^name/i })).toHaveValue("Birthday");
    expect(screen.getByRole("textbox", { name: /description/i })).toHaveValue("Ideas");
    expect(screen.getByText("Shared with 1 family")).toBeInTheDocument();

    // Done popped the entry the app pushed, so the next Back leaves the page
    // rather than reopening the dialog.
    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /folders/5")).toBeInTheDocument();
  });

  it("strips ?share without navigating when nothing was pushed", async () => {
    serveFamilies();

    renderCreateList(authToken, { entries: ["/lists", "/lists/new?share=open"] });

    await userEvent.click(await screen.findByRole("button", { name: /^done$/i }));

    expect(await screen.findByText("address: /lists/new")).toBeInTheDocument();
    expect(sharingDialog()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(await screen.findByText("address: /lists")).toBeInTheDocument();
  });

  it("posts no occasions when the sharing section is never opened", async () => {
    serveFamilies();
    const posted = serveCreate();

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Private");
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ name: "Private", occasion_ids: [] });
  });

  it("posts the occasion of each family ticked, and nothing else", async () => {
    serveFamilies();
    const posted = serveCreate();

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Birthday");
    await openSharing();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /share with the smiths/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ occasion_ids: [80] });
  });

  it("shares with the people ticked — the picker the form never had", async () => {
    serveFamilies();
    const posted = serveCreate();
    const shared = vi.fn();
    server.use(
      http.post(`${API}/lists/1/shares`, async ({ request }) => {
        shared(await request.json());
        return HttpResponse.json({ id: 1, list_id: 1, user_id: 3, created_at: "2026-01-01" }, { status: 201 });
      }),
    );

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Birthday");
    await openSharing();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /share with gran boone/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    // `POST /lists` has no `user_ids`, so the people ticked are follow-up calls
    // made once the list exists.
    await waitFor(() => expect(shared).toHaveBeenCalledWith({ user_id: 3 }));
  });

  it("keeps the list and names who it could not be shared with", async () => {
    // The list exists, and the page being navigated to is exactly where the
    // failure is fixed: one Change, one tick.
    serveFamilies();
    serveCreate();
    server.use(
      http.post(`${API}/lists/1/shares`, async ({ request }) => {
        const body = (await request.json()) as { user_id: number };
        return body.user_id === 3
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ id: 1, list_id: 1, user_id: body.user_id, created_at: "2026-01-01" }, { status: 201 });
      }),
    );

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Birthday");
    await openSharing();
    await userEvent.click(await screen.findByRole("checkbox", { name: /share with alice/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /share with gran boone/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    expect(await screen.findByText(/couldn't share it with Gran Boone/i)).toBeInTheDocument();
    // Navigation happens either way — the list was created.
    expect(await screen.findByText("address: /lists/1")).toBeInTheDocument();
  });

  it("can be submitted before the families and occasions have answered", async () => {
    // The guard that used to block this existed to stop a submission silently
    // skipping the pre-check. With nothing pre-checked, a submission made early
    // shares with nobody — precisely what it asked for.
    const posted = serveCreate();
    server.use(
      http.get(`${API}/families`, () => new Promise(() => {})),
      http.get(`${API}/occasions`, () => new Promise(() => {})),
      http.get(`${API}/connections`, () => new Promise(() => {})),
    );

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Private");
    expect(screen.getByRole("button", { name: /create list/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: /create list/i }));
    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ occasion_ids: [] });
  });

  it("keeps its section when the user belongs to no families", async () => {
    // People are shareable even when families are not, and the section is where
    // the form says what the list will and will not reach.
    serveFamilies([]);

    renderCreateList(authToken);

    expect(await screen.findByText("This list isn't shared with anyone.")).toBeInTheDocument();
    expect(sharingSection()).toBeInTheDocument();

    const dialog = await openSharing();
    expect(await within(dialog).findByText(/don't belong to any families yet/i)).toBeInTheDocument();
    // And no way off a half-typed form, even out of an empty section.
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(
      await within(dialog).findByRole("checkbox", { name: /share with gran boone/i }),
    ).toBeInTheDocument();
  });

  it("retires the sentence this ticket exists to delete, and keeps the other half", async () => {
    serveFamilies();

    renderCreateList(authToken);

    await screen.findByRole("button", { name: /create list/i });
    expect(screen.queryByText(/uncheck any you'd rather keep it from/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Share with families")).not.toBeInTheDocument();
    expect(
      screen.getByText("You can change this later from the list itself."),
    ).toBeInTheDocument();
  });

  it("says what to do when an occasion is archived between load and submit", async () => {
    serveFamilies();
    server.use(
      http.post(`${API}/lists`, () =>
        HttpResponse.json(
          { detail: "This occasion is archived and can no longer be shared to." },
          { status: 409 },
        )
      ),
    );

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Birthday");
    await openSharing();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /share with the boones/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    // "Try again" would be a lie — the same submission keeps failing until the
    // owner changes what it asks for.
    expect(await screen.findByText(/has been archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/please try again/i)).not.toBeInTheDocument();
  });
});

describe("CreateList — list recipients", () => {
  function postSpy() {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    return posted;
  }

  const disclosure = () =>
    screen.getByRole("checkbox", { name: "This list is for someone else" });

  it("keeps the form unchanged until the disclosure is checked", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(authToken);

    await screen.findByRole("button", { name: /create list/i });
    expect(disclosure()).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /who is this list for/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    // The warning is unconditional inside the disclosure (NEU-1241), so the
    // closed checkbox is the only thing keeping it off an ordinary self-list.
    expect(screen.queryByText(/can't claim anything on it yourself/i))
      .not.toBeInTheDocument();
  });

  it("reveals the name field and the keeper's warning when checked", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(authToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));

    expect(screen.getByRole("textbox", { name: /who is this list for/i }))
      .toBeInTheDocument();
    // "Someone else" means a person with no account and nothing else (NEU-1241),
    // so the warning is unconditional and there is no radio left to answer.
    expect(screen.getByText(/can't claim anything on it yourself/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("uses the typed name in the keeper's warning", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(authToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));
    expect(screen.getByText(/planning to get them/i)).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );

    expect(screen.getByText(/planning to get Beth/i)).toBeInTheDocument();
  });

  it("posts the recipient name", async () => {
    const posted = postSpy();

    renderCreateList(authToken);

    await userEvent.type(
      await screen.findByRole("textbox", { name: /^name/i }),
      "Christmas Ideas",
    );
    await userEvent.click(disclosure());
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      name: "Christmas Ideas",
      recipient_name: "Beth",
    });
  });

  it("posts null when the disclosure is unchecked again", async () => {
    const posted = postSpy();

    renderCreateList(authToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Mine");
    await userEvent.click(disclosure());
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );
    await userEvent.click(disclosure());
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ recipient_name: null });
  });

  it("cannot be submitted with the disclosure open and the name left blank", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(authToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));

    // Submitting here would send null, silently discarding the disclosure and
    // creating an ordinary self-list.
    expect(screen.getByRole("button", { name: /create list/i })).toBeDisabled();
  });
});

describe("CreateList — who is this list for (shared account)", () => {
  const sharedAccount = {
    is_shared_account: true,
    people: [
      { id: 4, name: "Gran" },
      { id: 5, name: "Grandpa" },
    ],
  };

  function sharedAccountForm() {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.get(`${API}/account`, () => HttpResponse.json(sharedAccount)),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    renderCreateList(authToken);
    return posted;
  }

  it("asks who the list is for, naming the account's people", async () => {
    sharedAccountForm();

    expect(await screen.findByRole("radio", { name: "Gran" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Grandpa" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Both of us" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Someone else" })).not.toBeChecked();
    // The picker replaces the standalone disclosure — "Someone else" is one of
    // its answers, not a checkbox beside it.
    expect(
      screen.queryByRole("checkbox", { name: "This list is for someone else" }),
    ).not.toBeInTheDocument();
  });

  it("cannot be submitted until the question is answered", async () => {
    sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Christmas");
    await screen.findByRole("radio", { name: "Gran" });
    expect(screen.getByRole("button", { name: /create list/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Gran" }));
    expect(screen.getByRole("button", { name: /create list/i })).toBeEnabled();
  });

  it("posts the chosen person and no recipient", async () => {
    const posted = sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Gran's List");
    await userEvent.click(await screen.findByRole("radio", { name: "Gran" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      name: "Gran's List",
      account_person_id: 4,
      recipient_name: null,
    });
  });

  it("posts nulls for 'Both of us' — a household list", async () => {
    const posted = sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Ours");
    await userEvent.click(await screen.findByRole("radio", { name: "Both of us" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      account_person_id: null,
      recipient_name: null,
    });
  });

  it("shows the keeper's warning under 'Someone else' and nowhere else", async () => {
    sharedAccountForm();

    await userEvent.click(await screen.findByRole("radio", { name: "Gran" }));
    expect(screen.queryByText(/can't claim anything on it yourself/i))
      .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Both of us" }));
    expect(screen.queryByText(/can't claim anything on it yourself/i))
      .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Someone else" }));
    expect(screen.getByText(/can't claim anything on it yourself/i)).toBeInTheDocument();
  });

  it("reveals the recipient fields under 'Someone else' and posts the name alone", async () => {
    const posted = sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Beth's List");
    expect(screen.queryByRole("textbox", { name: /their name/i })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("radio", { name: "Someone else" }));
    // The name is still blank at the moment "Someone else" is chosen, so the
    // form is blocked until it is typed.
    expect(screen.getByRole("button", { name: /create list/i })).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: /their name/i }), "Beth");
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      recipient_name: "Beth",
      account_person_id: null,
    });
  });

  it("clears the typed recipient when a person is chosen instead", async () => {
    const posted = sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Mine");
    await userEvent.click(await screen.findByRole("radio", { name: "Someone else" }));
    await userEvent.type(screen.getByRole("textbox", { name: /their name/i }), "Beth");
    await userEvent.click(screen.getByRole("radio", { name: "Grandpa" }));

    expect(screen.queryByRole("textbox", { name: /their name/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create list/i }));
    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      account_person_id: 5,
      recipient_name: null,
    });
  });

  it("shows no picker at all on a non-shared account", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(authToken);

    expect(
      await screen.findByRole("checkbox", { name: "This list is for someone else" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Both of us" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Someone else" })).not.toBeInTheDocument();
  });
});
