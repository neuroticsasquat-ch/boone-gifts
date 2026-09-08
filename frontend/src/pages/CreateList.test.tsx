import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { CreateList } from "./CreateList";

const API = "https://boone-gifts-api.localhost";

function token(claims: Record<string, unknown>) {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999, ...claims })),
    "fake-signature",
  ].join(".");
}

const fullModeToken = token({});
const simpleModeToken = token({ simple_mode: true });

const families = [
  { id: 7, name: "The Boones", role: "organizer", member_count: 3 },
  { id: 8, name: "The Smiths", role: "member", member_count: 2 },
];

function renderCreateList(authToken: string) {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: authToken, token_type: "bearer" })
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <CreateList />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("CreateList — family sharing", () => {
  it("lists the user's families as unchecked checkboxes in full mode", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json(families)));

    renderCreateList(fullModeToken);

    const boones = await screen.findByRole("checkbox", { name: "The Boones" });
    expect(boones).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "The Smiths" })).not.toBeChecked();
  });

  it("posts family_ids for exactly the families checked", async () => {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json(families)),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    renderCreateList(fullModeToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /name/i }), "Birthday");
    await userEvent.click(screen.getByRole("checkbox", { name: "The Boones" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ name: "Birthday", family_ids: [7] });
  });

  it("posts an empty family_ids when nothing is checked", async () => {
    const posted = vi.fn();
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json(families)),
      http.post(`${API}/lists`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    renderCreateList(fullModeToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /name/i }), "Private");
    await screen.findByRole("checkbox", { name: "The Boones" });
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({ family_ids: [] });
  });

  it("hides the section in simple mode — the backend shares with all families anyway", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json(families)));

    renderCreateList(simpleModeToken);

    await screen.findByRole("button", { name: /create list/i });
    expect(screen.queryByText("Share with families")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "The Boones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "The Smiths" })).not.toBeInTheDocument();
  });

  it("hides the section when the user belongs to no families", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await screen.findByRole("button", { name: /create list/i });
    await waitFor(() =>
      expect(screen.queryByText("Share with families")).not.toBeInTheDocument()
    );
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

    renderCreateList(simpleModeToken);

    await screen.findByRole("button", { name: /create list/i });
    expect(disclosure()).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /who is this list for/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("reveals the name field and the radio pair when checked", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));

    expect(screen.getByRole("textbox", { name: /who is this list for/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "They use this app" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "They don't use this app" }))
      .not.toBeChecked();
  });

  it("uses the typed name in the radio labels", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );

    expect(screen.getByRole("radio", { name: "Beth uses this app" }))
      .toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beth doesn't use this app" }))
      .toBeInTheDocument();
  });

  it("cannot be submitted while the disclosure is open and no radio is chosen", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );
    expect(screen.getByRole("button", { name: /create list/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Beth uses this app" }));
    expect(screen.getByRole("button", { name: /create list/i })).toBeEnabled();
  });

  it("warns the keeper only when the recipient doesn't use the app", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );

    await userEvent.click(screen.getByRole("radio", { name: "Beth uses this app" }));
    expect(screen.queryByText(/can't claim anything on it yourself/i))
      .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Beth doesn't use this app" }));
    expect(screen.getByText(/can't claim anything on it yourself/i)).toBeInTheDocument();
    expect(screen.getByText(/planning to get Beth/i)).toBeInTheDocument();
  });

  it("posts both recipient fields", async () => {
    const posted = postSpy();

    renderCreateList(fullModeToken);

    await userEvent.type(
      await screen.findByRole("textbox", { name: /^name/i }),
      "Christmas Ideas",
    );
    await userEvent.click(disclosure());
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Beth doesn't use this app" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      name: "Christmas Ideas",
      recipient_name: "Beth",
      recipient_has_account: false,
    });
  });

  it("posts null for both fields when the disclosure is unchecked again", async () => {
    const posted = postSpy();

    renderCreateList(fullModeToken);

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Mine");
    await userEvent.click(disclosure());
    await userEvent.type(
      screen.getByRole("textbox", { name: /who is this list for/i }),
      "Beth",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Beth doesn't use this app" }));
    await userEvent.click(disclosure());
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      recipient_name: null,
      recipient_has_account: null,
    });
  });

  it("cannot be submitted with the disclosure open and the name left blank", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    await userEvent.click(await screen.findByRole("checkbox", {
      name: "This list is for someone else",
    }));
    await userEvent.click(screen.getByRole("radio", { name: "They use this app" }));

    // Submitting here would send null for both fields, silently discarding the
    // answer and creating an ordinary self-list.
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

  function sharedAccountForm(authToken = fullModeToken) {
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
      recipient_has_account: null,
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
      recipient_has_account: null,
    });
  });

  it("reveals the recipient fields under 'Someone else' and posts the name alone", async () => {
    const posted = sharedAccountForm();

    await userEvent.type(await screen.findByRole("textbox", { name: /^name/i }), "Beth's List");
    expect(screen.queryByRole("textbox", { name: /their name/i })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("radio", { name: "Someone else" }));
    await userEvent.type(screen.getByRole("textbox", { name: /their name/i }), "Beth");
    // Its own question is still unanswered, so the form is still blocked.
    expect(screen.getByRole("button", { name: /create list/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Beth doesn't use this app" }));
    await userEvent.click(screen.getByRole("button", { name: /create list/i }));

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      recipient_name: "Beth",
      recipient_has_account: false,
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

  it("asks the same question in simple mode — a shared household is its audience", async () => {
    sharedAccountForm(simpleModeToken);

    expect(await screen.findByRole("radio", { name: "Gran" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Both of us" })).toBeInTheDocument();
  });

  it("shows no picker at all on a non-shared account", async () => {
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderCreateList(fullModeToken);

    expect(
      await screen.findByRole("checkbox", { name: "This list is for someone else" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Both of us" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Someone else" })).not.toBeInTheDocument();
  });
});
