import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { BudgetLine } from "./BudgetLine";
import type { ShoppingScope } from "../lib/shopping";
import type { BudgetRollup } from "../types";

const API = "https://boone-gifts-api.localhost";

function rollup(overrides: Partial<BudgetRollup> = {}): BudgetRollup {
  return {
    amount: "200.00",
    spent: "142.00",
    remaining: "58.00",
    bought_count: 3,
    total_count: 7,
    unpriced_count: 0,
    ...overrides,
  };
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
