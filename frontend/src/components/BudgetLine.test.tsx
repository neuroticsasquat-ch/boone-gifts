import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { BudgetLine, GifteeBudgetLine } from "./BudgetLine";
import { shoppingKey, type ShoppingScope } from "../lib/shopping";
import type { BudgetRollup, Giftee, ShoppingPayload } from "../types";

const API = "https://boone-gifts-api.localhost";

/** A rollup with nothing allocated beneath it: `target` and `unallocated`
 *  follow `amount`, so the pre-NEU-1326 cases read exactly as they did. */
function rollup(overrides: Partial<BudgetRollup> = {}): BudgetRollup {
  const amount = overrides.amount === undefined ? "200.00" : overrides.amount;
  return {
    amount,
    spent: "142.00",
    remaining: "58.00",
    bought_count: 3,
    total_count: 7,
    unpriced_count: 0,
    allocated: "0.00",
    unallocated: amount,
    target: amount,
    allocation_count: 0,
    ...overrides,
  };
}

function giftee(overrides: Partial<Giftee> = {}): Giftee {
  return {
    key: "owner:7",
    kind: "owner",
    name: "Gran",
    keeper: null,
    list_count: 1,
    budget: rollup({ amount: null, spent: "0.00", remaining: null, bought_count: 0, total_count: 0 }),
    ...overrides,
  };
}

/** A giftee line over a cache entry holding the whole payload, so a write can
 *  be seen landing in both halves of it. */
function renderGifteeLine({
  giftee: line = giftee(),
  overall = rollup(),
  scope = { kind: "occasion", id: 3 } as ShoppingScope,
}: { giftee?: Giftee; overall?: BudgetRollup; scope?: ShoppingScope } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<ShoppingPayload>(shoppingKey(scope), {
    budget: overall,
    giftees: [line],
    items: [],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <GifteeBudgetLine giftee={line} overall={overall} scope={scope} />
    </QueryClientProvider>,
  );
  return queryClient;
}

function renderBudget({
  budget = rollup(),
  scope = { kind: "occasion", id: 3 } as ShoppingScope,
}: { budget?: BudgetRollup; scope?: ShoppingScope } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BudgetLine budget={budget} scope={scope} />
    </QueryClientProvider>,
  );
}

/** A write has landed once the editor has closed behind it. */
function editorClosed() {
  return waitFor(() => expect(screen.queryByLabelText("Budget")).not.toBeInTheDocument());
}

describe("BudgetLine", () => {
  it("states the spend, the target and what is left", () => {
    renderBudget();

    expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
  });

  // An overspend is a state worth showing plainly, not an error: no red, no
  // warning icon, just the number.
  it("says how far over a budget is, plainly", () => {
    renderBudget({ budget: rollup({ amount: "200.00", spent: "212.00", remaining: "-12.00" }) });

    expect(screen.getByText("$212.00 of $200.00 spent · $12.00 over")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("counts a budget met exactly as neither left nor over", () => {
    renderBudget({ budget: rollup({ amount: "200.00", spent: "200.00", remaining: "0.00" }) });

    expect(screen.getByText("$200.00 of $200.00 spent · $0.00 left")).toBeInTheDocument();
  });

  it("offers to set a budget when there is none, and still shows the tally", () => {
    renderBudget({ budget: rollup({ amount: null, remaining: null }) });

    expect(screen.getByText("$142.00 spent · no budget set")).toBeInTheDocument();
    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit budget" })).not.toBeInTheDocument();
  });

  // The honesty requirement (project spec §7): an understated total must read
  // as an understatement, never as fact.
  it("discloses purchases with no amount recorded whenever there are any", () => {
    renderBudget({ budget: rollup({ unpriced_count: 2 }) });

    expect(
      screen.getByText("3 of 7 bought · 2 purchases with no amount recorded"),
    ).toBeInTheDocument();
  });

  it("says it in the singular for one such purchase", () => {
    renderBudget({ budget: rollup({ unpriced_count: 1 }) });

    expect(
      screen.getByText("3 of 7 bought · 1 purchase with no amount recorded"),
    ).toBeInTheDocument();
  });

  it("leaves the disclosure off only when the count is zero", () => {
    renderBudget({ budget: rollup({ unpriced_count: 0 }) });

    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
    expect(screen.queryByText(/no amount recorded/)).not.toBeInTheDocument();
  });

  describe("setting and editing", () => {
    it("sets a budget on the occasion the tab is scoped to", async () => {
      let body: unknown;
      server.use(
        http.put(`${API}/occasions/3/budget`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(rollup({ amount: "300.00", remaining: "158.00" }));
        }),
      );
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
      await userEvent.type(screen.getByLabelText("Budget"), "300");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await editorClosed();
      expect(body).toEqual({ amount: "300" });
    });

    it("writes a folder's budget to the folder endpoint", async () => {
      let called = false;
      server.use(
        http.put(`${API}/folders/5/budget`, () => {
          called = true;
          return HttpResponse.json(rollup());
        }),
      );
      renderBudget({ scope: { kind: "folder", id: 5 } });

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await editorClosed();
      expect(called).toBe(true);
    });

    // Seeded from the target already set, so editing one is a correction and
    // not a retype.
    it("opens the editor on the budget already set", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));

      expect(screen.getByLabelText("Budget")).toHaveValue("200.00");
    });

    it("opens an empty editor when no budget is set", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.getByLabelText("Budget")).toHaveValue("");
    });

    it("leaves the budget alone on cancel", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "999");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByLabelText("Budget")).not.toBeInTheDocument();
      expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    });

    it("refuses an amount that is not a number, and says why", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "lots");

      expect(screen.getByText("Enter a dollar amount, like 200 or 199.99.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("refuses a negative budget", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "-5");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    // `BudgetWrite` is `decimal_places=2`, so a third decimal is a 422 the user
    // can do nothing with. The field refuses what the server refuses.
    it("refuses more precision than a dollar amount has", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "199.999");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    // Zero is a real target — "I mean to spend nothing here" — and the backend
    // accepts it, so the field must not treat it as empty.
    it("accepts a budget of zero", async () => {
      let body: unknown;
      server.use(
        http.put(`${API}/occasions/3/budget`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(rollup({ amount: "0.00" }));
        }),
      );
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
      await userEvent.type(screen.getByLabelText("Budget"), "0");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await editorClosed();
      expect(body).toEqual({ amount: "0" });
    });

    it("cannot save an empty field", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(
        screen.queryByText("Enter a dollar amount, like 200 or 199.99."),
      ).not.toBeInTheDocument();
    });

    it("reports a write that fails and keeps the editor open", async () => {
      server.use(
        http.put(`${API}/occasions/3/budget`, () => new HttpResponse(null, { status: 500 })),
      );
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.getByLabelText("Budget")).toBeInTheDocument());
      expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    });

    // The wire carries whatever the arithmetic produced, not whatever the
    // column's scale happened to round-trip — a subtraction landing on `58.5`
    // is the case `lib/money.ts` exists for (ADR 0003).
    it("pads a wire value that arrived short of two decimals", () => {
      renderBudget({ budget: rollup({ amount: "200", spent: "141.5", remaining: "58.5" }) });

      expect(screen.getByText("$141.50 of $200.00 spent · $58.50 left")).toBeInTheDocument();
    });
  });

  describe("clearing", () => {
    it("removes the budget and leaves the counts standing", async () => {
      let called = false;
      server.use(
        http.delete(`${API}/occasions/3/budget`, () => {
          called = true;
          return HttpResponse.json(rollup({ amount: null, remaining: null }));
        }),
      );
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

      await editorClosed();
      expect(called).toBe(true);
    });

    it("removes a folder's budget through the folder endpoint", async () => {
      let called = false;
      server.use(
        http.delete(`${API}/folders/5/budget`, () => {
          called = true;
          return HttpResponse.json(rollup({ amount: null, remaining: null }));
        }),
      );
      renderBudget({ scope: { kind: "folder", id: 5 } });

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

      await editorClosed();
      expect(called).toBe(true);
    });

    // A clear answers 404 when someone already removed it elsewhere, so the
    // editor stays open rather than reporting a removal that did not happen.
    it("reports a removal that fails and keeps the editor open", async () => {
      server.use(
        http.delete(`${API}/occasions/3/budget`, () => new HttpResponse(null, { status: 404 })),
      );
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

      await waitFor(() => expect(screen.getByLabelText("Budget")).toBeInTheDocument());
      expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    });

    // There is nothing to remove, and the backend answers 404 to the attempt.
    it("does not offer removal when no budget is set", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.queryByRole("button", { name: "Remove budget" })).not.toBeInTheDocument();
    });
  });
});

describe("BudgetLine with giftee budgets beneath it", () => {
  // Decision 11: the money line measures against `target`, and with no overall
  // set the tally says where the figure came from. The button still offers
  // *Set*, because `amount` is still null.
  it("measures against a derived target and says it is the sum of people's budgets", () => {
    renderBudget({
      budget: rollup({
        amount: null,
        remaining: "88.00",
        target: "230.00",
        allocated: "230.00",
        unallocated: null,
        allocation_count: 3,
      }),
    });

    expect(screen.getByText("$142.00 of $230.00 spent · $88.00 left")).toBeInTheDocument();
    expect(
      screen.getByText("3 of 7 bought · budget is the sum of 3 people's budgets"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
  });

  it("says it in the singular for one person's budget", () => {
    renderBudget({
      budget: rollup({
        amount: null,
        remaining: "88.00",
        target: "230.00",
        allocated: "230.00",
        unallocated: null,
        allocation_count: 1,
      }),
    });

    expect(
      screen.getByText("3 of 7 bought · budget is the sum of 1 person's budget"),
    ).toBeInTheDocument();
  });

  it("says how much of a set budget is allocated to people", () => {
    renderBudget({
      budget: rollup({ allocated: "150.00", unallocated: "50.00", allocation_count: 2 }),
    });

    expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    expect(
      screen.getByText("3 of 7 bought · $150.00 of $200.00 allocated to people"),
    ).toBeInTheDocument();
  });

  // Over-allocation is stated, never refused — the same rule as an overspend.
  it("says how far the allocation exceeds a set budget, plainly", () => {
    renderBudget({
      budget: rollup({ allocated: "230.00", unallocated: "-30.00", allocation_count: 2 }),
    });

    expect(
      screen.getByText("3 of 7 bought · $230.00 allocated · $30.00 over your budget"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("carries no allocation clause when nothing is allocated", () => {
    renderBudget({ budget: rollup({ unpriced_count: 2 }) });

    expect(
      screen.getByText("3 of 7 bought · 2 purchases with no amount recorded"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/allocated/)).not.toBeInTheDocument();
  });

  // The seeded editor is unchanged by a derived target: the figure was never
  // chosen, so there is nothing honest to pre-fill.
  it("opens an empty editor on a derived target", async () => {
    renderBudget({
      budget: rollup({ amount: null, target: "230.00", allocated: "230.00", allocation_count: 2 }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

    expect(screen.getByLabelText("Budget")).toHaveValue("");
  });
});

describe("GifteeBudgetLine", () => {
  it("renders the giftee's own line in the same shape as the overall's", () => {
    renderGifteeLine({
      giftee: giftee({
        budget: rollup({ amount: "150.00", spent: "42.00", remaining: "108.00", bought_count: 1, total_count: 2 }),
      }),
    });

    expect(screen.getByText("$42.00 of $150.00 spent · $108.00 left")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 bought")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit budget" })).toBeInTheDocument();
  });

  // Decision 12: an unbudgeted giftee is told what is left of the overall, as
  // a hint and as the field's placeholder — and never as its value.
  it("tells an unbudgeted giftee what is left to allocate, without typing it in", async () => {
    renderGifteeLine({ overall: rollup({ allocated: "150.00", unallocated: "50.00", allocation_count: 1 }) });

    expect(screen.getByText("$50.00 of your $200.00 not yet allocated")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 bought")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

    const field = screen.getByLabelText("Budget for Gran");
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "$50.00");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says the allocation is already over, with no placeholder", async () => {
    renderGifteeLine({ overall: rollup({ allocated: "230.00", unallocated: "-30.00", allocation_count: 2 }) });

    expect(screen.getByText("$30.00 over your budget")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

    expect(screen.getByLabelText("Budget for Gran")).not.toHaveAttribute("placeholder");
  });

  // Nothing left is not a proposal: the line still says so, the field offers
  // nothing.
  it("offers no placeholder when nothing is left to allocate", async () => {
    renderGifteeLine({ overall: rollup({ allocated: "200.00", unallocated: "0.00", allocation_count: 2 }) });

    expect(screen.getByText("$0.00 of your $200.00 not yet allocated")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

    expect(screen.getByLabelText("Budget for Gran")).not.toHaveAttribute("placeholder");
  });

  it("shows no hint and no placeholder when there is no overall to allocate from", async () => {
    renderGifteeLine({ overall: rollup({ amount: null, remaining: null }) });

    expect(screen.getByText("0 of 0 bought")).toBeInTheDocument();
    expect(screen.queryByText(/allocated/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

    expect(screen.getByLabelText("Budget for Gran")).not.toHaveAttribute("placeholder");
  });

  it("shows no hint once the giftee has a budget of their own", () => {
    renderGifteeLine({
      giftee: giftee({ budget: rollup({ amount: "100.00", spent: "0.00", remaining: "100.00", bought_count: 0, total_count: 0 }) }),
      overall: rollup({ allocated: "100.00", unallocated: "100.00", allocation_count: 1 }),
    });

    expect(screen.queryByText(/not yet allocated/)).not.toBeInTheDocument();
  });

  // Criterion 21: the write goes to the giftee endpoint on the tab's scope, and
  // the returned block moves this line *and* the overall's without a refetch.
  it("sets a giftee budget on the occasion and writes the block into the cache", async () => {
    let body: unknown;
    const block = {
      budget: rollup({ allocated: "150.00", unallocated: "50.00", allocation_count: 1 }),
      giftees: [giftee({ budget: rollup({ amount: "150.00", spent: "0.00", remaining: "150.00", bought_count: 0, total_count: 0 }) })],
    };
    server.use(
      http.put(`${API}/occasions/3/giftees/owner:7/budget`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(block);
      }),
    );
    const queryClient = renderGifteeLine();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
    await userEvent.type(screen.getByLabelText("Budget for Gran"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Budget for Gran")).not.toBeInTheDocument(),
    );
    expect(body).toEqual({ amount: "150" });
    const cached = queryClient.getQueryData<ShoppingPayload>(shoppingKey({ kind: "occasion", id: 3 }));
    expect(cached?.budget.allocated).toBe("150.00");
    expect(cached?.giftees[0].budget.amount).toBe("150.00");
    expect(cached?.items).toEqual([]);
  });

  it("writes a folder giftee's budget to the folder endpoint", async () => {
    let called = false;
    server.use(
      http.put(`${API}/folders/5/giftees/owner:7/budget`, () => {
        called = true;
        return HttpResponse.json({ budget: rollup(), giftees: [giftee()] });
      }),
    );
    renderGifteeLine({ scope: { kind: "folder", id: 5 } });

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
    await userEvent.type(screen.getByLabelText("Budget for Gran"), "60");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("removes a folder giftee's budget through the folder endpoint", async () => {
    let called = false;
    server.use(
      http.delete(`${API}/folders/5/giftees/owner:7/budget`, () => {
        called = true;
        return HttpResponse.json({ budget: rollup(), giftees: [giftee()] });
      }),
    );
    renderGifteeLine({
      scope: { kind: "folder", id: 5 },
      giftee: giftee({ budget: rollup({ amount: "60.00", spent: "0.00", remaining: "60.00", bought_count: 0, total_count: 0 }) }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("removes a giftee budget through the giftee endpoint", async () => {
    let called = false;
    server.use(
      http.delete(`${API}/occasions/3/giftees/owner:7/budget`, () => {
        called = true;
        return HttpResponse.json({ budget: rollup(), giftees: [giftee()] });
      }),
    );
    const queryClient = renderGifteeLine({
      giftee: giftee({ budget: rollup({ amount: "150.00", spent: "0.00", remaining: "150.00", bought_count: 0, total_count: 0 }) }),
      overall: rollup({ allocated: "150.00", unallocated: "50.00", allocation_count: 1 }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

    await waitFor(() => expect(called).toBe(true));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ShoppingPayload>(shoppingKey({ kind: "occasion", id: 3 }))?.budget
          .allocated,
      ).toBe("0.00"),
    );
  });

  it("keeps the editor open and re-reads the tab when a giftee write fails", async () => {
    server.use(
      http.put(`${API}/occasions/3/giftees/owner:7/budget`, () => new HttpResponse(null, { status: 404 })),
    );
    renderGifteeLine();

    await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
    await userEvent.type(screen.getByLabelText("Budget for Gran"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Budget for Gran")).toBeInTheDocument());
  });
});
