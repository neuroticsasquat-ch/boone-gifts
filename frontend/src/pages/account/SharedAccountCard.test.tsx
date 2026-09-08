import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SharedAccountCard } from "./SharedAccountCard";
import type { Account, AccountUpdate } from "../../types";

const API = "https://boone-gifts-api.localhost";

const gran = { id: 1, name: "Gran" };
const grandpa = { id: 2, name: "Grandpa" };
const sharedAccount: Account = { is_shared_account: true, people: [gran, grandpa] };
const soloAccount: Account = { is_shared_account: false, people: [] };

/** Every `PUT /account` the card made, in order, with the `?confirm` it carried. */
interface Put {
  body: AccountUpdate;
  confirm: boolean;
}

let puts: Put[];

function account(state: Account) {
  server.use(http.get(`${API}/account`, () => HttpResponse.json(state)));
}

/** `PUT /account` answering with `reply`, which may vary by attempt — the
 *  confirmation flow needs a 409 first and a 200 second. */
function onPut(reply: (put: Put) => Response | Promise<Response>) {
  server.use(
    http.put(`${API}/account`, async ({ request }) => {
      const put: Put = {
        body: (await request.json()) as AccountUpdate,
        confirm: new URL(request.url).searchParams.get("confirm") === "true",
      };
      puts.push(put);
      return reply(put);
    }),
  );
}

/** The happy path: the API accepts whatever it is sent and echoes it back. */
function acceptPuts() {
  onPut((put) =>
    HttpResponse.json({
      is_shared_account: put.body.is_shared_account,
      people: put.body.people.map((person, index) => ({ id: person.id ?? 100 + index, name: person.name })),
    }),
  );
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SharedAccountCard />
    </QueryClientProvider>,
  );
}

const toggle = () => screen.getByRole("checkbox", { name: /more than one person uses this account/i });
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("SharedAccountCard", () => {
  beforeEach(() => {
    puts = [];
  });

  it("offers the setting, off and with no names, on an account nobody shares", async () => {
    account(soloAccount);
    renderCard();

    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(screen.queryByLabelText(/person 1 name/i)).not.toBeInTheDocument();
  });

  it("never suggests the other person gets their own login or any privacy", async () => {
    account(sharedAccount);
    renderCard();

    const blurb = await screen.findByText(/everyone named here shares this one login/i);
    expect(blurb).toHaveTextContent(
      "Everyone named here shares this one login and sees everything on it. " +
        "The names are labels, so you can mark which lists are whose.",
    );
  });

  it("asks for two names as soon as the setting is turned on", async () => {
    account(soloAccount);
    renderCard();
    await waitFor(() => expect(toggle()).not.toBeChecked());

    await userEvent.click(toggle());

    expect(screen.getByLabelText(/person 1 name/i)).toHaveValue("");
    expect(screen.getByLabelText(/person 2 name/i)).toHaveValue("");
  });

  it("refuses to save a shared account with only one name", async () => {
    account(soloAccount);
    acceptPuts();
    renderCard();
    await waitFor(() => expect(toggle()).not.toBeChecked());

    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(/person 1 name/i), "Gran");
    await userEvent.click(screen.getByRole("button", { name: /remove person 2/i }));
    await userEvent.click(saveButton());

    expect(screen.getByText(/name at least two people/i)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it("refuses to save a person with no name", async () => {
    account(soloAccount);
    acceptPuts();
    renderCard();
    await waitFor(() => expect(toggle()).not.toBeChecked());

    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(/person 1 name/i), "Gran");
    await userEvent.click(saveButton());

    expect(screen.getByText(/every person needs a name/i)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it("turns the setting on with two names", async () => {
    account(soloAccount);
    acceptPuts();
    renderCard();
    await waitFor(() => expect(toggle()).not.toBeChecked());

    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(/person 1 name/i), "Gran");
    await userEvent.type(screen.getByLabelText(/person 2 name/i), "Grandpa");
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({
      is_shared_account: true,
      people: [{ name: "Gran" }, { name: "Grandpa" }],
    });
    expect(await screen.findByText(/account updated/i)).toBeInTheDocument();
  });

  it("renames a person in place, keeping their id", async () => {
    account(sharedAccount);
    acceptPuts();
    renderCard();

    const field = await screen.findByDisplayValue("Gran");
    await userEvent.clear(field);
    await userEvent.type(field, "Nana");
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.people).toEqual([
      { id: 1, name: "Nana" },
      { id: 2, name: "Grandpa" },
    ]);
  });

  it("adds a person", async () => {
    account(sharedAccount);
    acceptPuts();
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(screen.getByRole("button", { name: /add another person/i }));
    await userEvent.type(screen.getByLabelText(/person 3 name/i), "Uncle Bob");
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.people).toEqual([
      { id: 1, name: "Gran" },
      { id: 2, name: "Grandpa" },
      { name: "Uncle Bob" },
    ]);
  });

  it("removes a person by leaving them out of the saved state", async () => {
    account({ is_shared_account: true, people: [gran, grandpa, { id: 3, name: "Uncle Bob" }] });
    acceptPuts();
    renderCard();
    await screen.findByDisplayValue("Uncle Bob");

    await userEvent.click(screen.getByRole("button", { name: /remove uncle bob/i }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.people).toEqual([
      { id: 1, name: "Gran" },
      { id: 2, name: "Grandpa" },
    ]);
  });

  it("reorders people, because the array order is the display order", async () => {
    account(sharedAccount);
    acceptPuts();
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(screen.getByRole("button", { name: /move grandpa up/i }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.people).toEqual([
      { id: 2, name: "Grandpa" },
      { id: 1, name: "Gran" },
    ]);
  });

  it("confirms turning the setting off, with the count of lists that lose a label", async () => {
    account(sharedAccount);
    onPut((put) =>
      put.confirm
        ? HttpResponse.json(soloAccount)
        : HttpResponse.json({ affected_lists: 3 }, { status: 409 }),
    );
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(toggle());
    await userEvent.click(saveButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "3 lists are marked for Gran or Grandpa. Turning this off removes those labels. " +
        "The lists themselves are kept.",
    );

    await userEvent.click(screen.getByRole("button", { name: /turn it off/i }));

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({
      confirm: true,
      body: { is_shared_account: false, people: [] },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toggle()).not.toBeChecked();
  });

  it("counts a single affected list in the singular", async () => {
    account(sharedAccount);
    onPut(() => HttpResponse.json({ affected_lists: 1 }, { status: 409 }));
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(toggle());
    await userEvent.click(saveButton());

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "1 list is marked for Gran or Grandpa.",
    );
  });

  it("leaves everything untouched when the confirmation is cancelled", async () => {
    account(sharedAccount);
    onPut(() => HttpResponse.json({ affected_lists: 3 }, { status: 409 }));
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(toggle());
    await userEvent.click(saveButton());
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Nothing was committed: the one PUT was the 409 probe, and the card is back
    // to the account it loaded.
    expect(puts).toHaveLength(1);
    expect(toggle()).toBeChecked();
    expect(screen.getByDisplayValue("Gran")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Grandpa")).toBeInTheDocument();
  });

  it("confirms removing a person whose lists carry their label", async () => {
    account({ is_shared_account: true, people: [gran, grandpa, { id: 3, name: "Uncle Bob" }] });
    onPut((put) =>
      put.confirm
        ? HttpResponse.json(sharedAccount)
        : HttpResponse.json({ affected_lists: 2 }, { status: 409 }),
    );
    renderCard();
    await screen.findByDisplayValue("Uncle Bob");

    await userEvent.click(screen.getByRole("button", { name: "Remove Uncle Bob" }));
    await userEvent.click(saveButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "2 lists are marked for Uncle Bob. Removing them removes those labels. " +
        "The lists themselves are kept.",
    );

    await userEvent.click(screen.getByRole("button", { name: /remove them/i }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].confirm).toBe(true);
  });

  it("will not let the last-but-one person be removed by hand", async () => {
    // The API would auto-unmark the account here; the form asks for the explicit
    // choice instead, so the mode never changes as a side effect of a removal.
    account(sharedAccount);
    acceptPuts();
    renderCard();
    await screen.findByDisplayValue("Gran");

    await userEvent.click(screen.getByRole("button", { name: "Remove Gran" }));
    await userEvent.click(saveButton());

    expect(screen.getByText(/name at least two people, or turn this off/i)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it("says what turning it off costs before it is turned off", async () => {
    // The API only confirms a turn-off that strips a label off a list, so an
    // account whose lists carry none gets no dialog at all — the card says it.
    account(sharedAccount);
    renderCard();
    await screen.findByDisplayValue("Gran");
    expect(screen.queryByText(/turning this off removes/i)).not.toBeInTheDocument();

    await userEvent.click(toggle());

    expect(screen.getByText(/turning this off removes/i)).toHaveTextContent(
      "Turning this off removes Gran and Grandpa from this account. " +
        "Lists marked for them are kept, without the label.",
    );
  });

  it("treats two names differing only in case as two people, as the API does", async () => {
    account(sharedAccount);
    acceptPuts();
    renderCard();

    const field = await screen.findByDisplayValue("Grandpa");
    await userEvent.clear(field);
    await userEvent.type(field, "gran");
    await userEvent.click(saveButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.people).toEqual([
      { id: 1, name: "Gran" },
      { id: 2, name: "gran" },
    ]);
  });

  it("surfaces what the API rejected", async () => {
    account(sharedAccount);
    onPut(() =>
      HttpResponse.json({ detail: "Two people on one account cannot share a name." }, { status: 400 }),
    );
    renderCard();

    const field = await screen.findByDisplayValue("Gran");
    await userEvent.clear(field);
    await userEvent.type(field, "Grandad");
    await userEvent.click(saveButton());

    expect(await screen.findByText(/cannot share a name/i)).toBeInTheDocument();
  });
});
