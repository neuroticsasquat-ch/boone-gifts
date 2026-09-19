import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  clearFolderBudget,
  clearFolderGifteeBudget,
  setFolderBudget,
  setFolderGifteeBudget,
} from "../api/folders";
import {
  clearOccasionBudget,
  clearOccasionGifteeBudget,
  setOccasionBudget,
  setOccasionGifteeBudget,
} from "../api/occasions";
import { allocationSentence } from "../lib/giftees";
import { formatMoney } from "../lib/money";
// The key is defined once, beside the scope it is built from, so this component
// cannot drift from the cache entry the tab reads.
import { shoppingKey, type ShoppingScope } from "../lib/shopping";
import type { BudgetBlock, BudgetRollup, Giftee, ShoppingPayload } from "../types";

/**
 * What `BudgetWrite` accepts on the wire: a non-negative amount, at most two
 * decimal places, `max_digits=10` — so eight digits before the point.
 *
 * The field refuses exactly what the server refuses. A looser check here would
 * promise more than it can keep and turn a typo like `199.999` into a generic
 * "failed to save" toast instead of an answerable message.
 */
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;
const INVALID = "Enter a dollar amount, like 200 or 199.99.";

/**
 * The editor beneath a budget line — the field, its validation, Save / Cancel
 * / Remove, and what happens when a write fails — parameterised by the two
 * writes it makes and what to do with what they return (NEU-1326 decision 10).
 * The overall line and each giftee's line mount it with their own endpoints;
 * the summary and tally above the field are theirs to say.
 *
 * `amount` is the target already set, or null — the one predicate for offering
 * *set* versus *edit*, and for offering removal at all: clearing is its own
 * request and the backend answers 404 when there is nothing to remove.
 */
export function BudgetEditor<T>({
  scope,
  label,
  fieldId,
  amount,
  placeholder,
  hint,
  summary,
  tally,
  save,
  clear,
  onSaved,
}: {
  scope: ShoppingScope;
  label: string;
  fieldId: string;
  amount: string | null;
  placeholder?: string;
  /** A muted line beside the Set / Edit control — what an unbudgeted giftee is
   *  told about the overall (decision 12). */
  hint?: string | null;
  summary: string;
  tally: string;
  save: (amount: string) => Promise<T>;
  clear: () => Promise<T>;
  onSaved: (result: T) => void;
}) {
  const queryClient = useQueryClient();
  const hasBudget = amount !== null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  /** Both writes answer with recomputed figures, so the line is one round trip
   *  and not a write followed by a re-read. */
  function applyResult(result: T) {
    setEditing(false);
    onSaved(result);
  }

  /** The editor stays open — the amount they typed is still in it, and closing
   *  would make them retype it to find out whether it took. The payload is
   *  re-read because the line may now be asserting a budget that is gone: a
   *  clear answers 404 when someone already removed it elsewhere. */
  function reportFailure(message: string) {
    toast.error(message);
    queryClient.invalidateQueries({ queryKey: shoppingKey(scope) });
  }

  const setMutation = useMutation({
    mutationFn: save,
    onSuccess: applyResult,
    onError: () => reportFailure("Failed to save the budget."),
  });

  const clearMutation = useMutation({
    mutationFn: clear,
    onSuccess: applyResult,
    onError: () => reportFailure("Failed to remove the budget."),
  });

  const isSaving = setMutation.isPending || clearMutation.isPending;

  const trimmed = draft.trim();
  // Zero is a real target — "I mean to spend nothing here" — so it is the empty
  // field, and not a falsy value, that counts as nothing to save.
  const isValid = AMOUNT.test(trimmed);

  function openEditor() {
    // Seeded from the target already set, so editing one is a correction rather
    // than a retype. Empty when there is none, because there is nothing honest
    // to pre-fill it with — the spend so far is a fact about the past, not a
    // proposal for the target, and what is left to allocate is exactly the
    // number the user did not choose (decision 12). A placeholder may *show*
    // that figure; it is never the value.
    setDraft(amount ?? "");
    setEditing(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-gray-900">{summary}</p>
        <span className="flex flex-wrap items-center gap-x-3">
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
          {!editing && (
            <button
            type="button"
            onClick={openEditor}
            className="text-sm text-blue-600 hover:underline"
          >
            {hasBudget ? "Edit budget" : "Set budget"}
          </button>
          )}
        </span>
      </div>

      {/* Always rendered, budget or no budget: the tally describes the viewer's
          shopping either way, and the unpriced count is what keeps an
          understated total from reading as fact (project spec §7). */}
      <p className="mt-0.5 text-xs text-gray-500">{tally}</p>

      {editing && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <label htmlFor={fieldId} className="block text-xs text-gray-600">
            {label}
          </label>
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {trimmed !== "" && !isValid && <p className="text-xs text-red-600">{INVALID}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMutation.mutate(trimmed)}
              disabled={!isValid || isSaving}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {setMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isSaving}
              className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            {/* Clearing is its own button rather than an empty save: the write
                that clears is a different request, and the backend answers 404
                when there is no budget to remove — so it is offered only when
                there is one. */}
            {hasBudget && (
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={isSaving}
                className="rounded px-2 py-0.5 text-xs font-medium text-gray-600 hover:text-red-600 disabled:opacity-50"
              >
                {clearMutation.isPending ? "Removing…" : "Remove budget"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The line at the top of every **My shopping** tab: what the viewer has spent,
 * the target they set for themselves — or the sum of what they allocated to
 * people, when they set none — and how the two compare (project spec §7, §9.2).
 *
 * **Every figure here is the viewer's own.** Nothing on this surface is
 * attributed to, or aggregated across, another person — organizers set an
 * occasion's name and never see any money (`CONTEXT.md` rule 5).
 */
export function BudgetLine({ budget, scope }: { budget: BudgetRollup; scope: ShoppingScope }) {
  const queryClient = useQueryClient();

  /** Only the budget half of the payload moves: a target changing cannot
   *  change which gifts are claimed, nor any giftee's own line. */
  function applyRollup(rollup: BudgetRollup) {
    queryClient.setQueryData<ShoppingPayload>(shoppingKey(scope), (previous) =>
      previous ? { ...previous, budget: rollup } : previous,
    );
  }

  return (
    <div className="rounded-lg bg-white px-4 py-3 shadow">
      <BudgetEditor<BudgetRollup>
        scope={scope}
        label="Budget"
        fieldId="budget-amount"
        amount={budget.amount}
        summary={summarize(budget)}
        tally={tally(budget)}
        save={(amount) =>
          scope.kind === "occasion"
            ? setOccasionBudget(scope.id, amount)
            : setFolderBudget(scope.id, amount)
        }
        clear={() =>
          scope.kind === "occasion" ? clearOccasionBudget(scope.id) : clearFolderBudget(scope.id)
        }
        onSaved={applyRollup}
      />
    </div>
  );
}

/**
 * One giftee's budget line, at the head of their group on the tab: the same
 * money line and tally as the overall's, over that giftee's lists alone, and
 * the same editor writing through the giftee endpoints (NEU-1326 decision 10).
 *
 * A giftee write answers with the whole block — this giftee's line moved, and
 * so did the overall's `allocated` and `target` — so both halves are written
 * into the cache entry, and the items are left alone.
 */
export function GifteeBudgetLine({
  giftee,
  overall,
  scope,
}: {
  giftee: Giftee;
  overall: BudgetRollup;
  scope: ShoppingScope;
}) {
  const queryClient = useQueryClient();
  const hint = unallocatedHint(giftee.budget, overall);

  function applyBlock(block: BudgetBlock) {
    queryClient.setQueryData<ShoppingPayload>(shoppingKey(scope), (previous) =>
      previous ? { ...previous, budget: block.budget, giftees: block.giftees } : previous,
    );
  }

  return (
    <BudgetEditor<BudgetBlock>
      scope={scope}
      label={`Budget for ${giftee.name}`}
      fieldId={`budget-amount-${giftee.key}`}
      amount={giftee.budget.amount}
      placeholder={hint.placeholder}
      hint={hint.text}
      summary={summarize(giftee.budget)}
      tally={tally(giftee.budget)}
      save={(amount) =>
        scope.kind === "occasion"
          ? setOccasionGifteeBudget(scope.id, giftee.key, amount)
          : setFolderGifteeBudget(scope.id, giftee.key, amount)
      }
      clear={() =>
        scope.kind === "occasion"
          ? clearOccasionGifteeBudget(scope.id, giftee.key)
          : clearFolderGifteeBudget(scope.id, giftee.key)
      }
      onSaved={applyBlock}
    />
  );
}

/**
 * What an unbudgeted giftee is told about the overall (decision 12): how much
 * of it is not yet allocated, as a muted line beside Set budget and as the
 * field's placeholder — or, once the allocation is already over, that it is,
 * with no placeholder. Nothing at all when this giftee has a budget, or when
 * there is no overall to allocate from.
 *
 * The placeholder is never copied into the value: a proposal to give one
 * person everything left is exactly the number the user did not choose. Nor
 * is `$0.00` offered as one when nothing is left — a placeholder proposes,
 * and there is nothing to propose.
 */
function unallocatedHint(
  budget: BudgetRollup,
  overall: BudgetRollup,
): { text: string | null; placeholder: string | undefined } {
  const none = { text: null, placeholder: undefined };
  if (budget.amount !== null || overall.amount === null || overall.unallocated === null) {
    return none;
  }
  if (Number(overall.unallocated) < 0) {
    const over = formatMoney(overall.unallocated.slice(1));
    return over === null ? none : { text: `${over} over your budget`, placeholder: undefined };
  }
  const unallocated = formatMoney(overall.unallocated);
  const amount = formatMoney(overall.amount);
  if (unallocated === null || amount === null) return none;
  return {
    text: `${unallocated} of your ${amount} not yet allocated`,
    placeholder: Number(overall.unallocated) > 0 ? unallocated : undefined,
  };
}

/**
 * The money line: `$142.00 of $200.00 spent · $58.00 left`.
 *
 * Measured against `target`, not `amount`: an overall the viewer never set
 * still has a figure once they have allocated to people, and the line reads
 * exactly as a set budget would — the tally beneath says where it came from.
 *
 * Going over is said plainly — `$12.00 over` — and not as an error: a budget is
 * a target, not a limit, and a line that scolds is one people stop setting.
 *
 * With no target at all, the spend still shows. It is the viewer's own figure
 * and hiding it until they commit to a number would be tidier and less honest.
 *
 * **Every clause is built from a formatted value and dropped when that value
 * will not format** (ADR 0003). Nothing here falls back to the raw wire string
 * under a bare `$`, and nothing substitutes a zero for an amount that is
 * missing — those are the two accidents the shared formatter exists to end.
 */
function summarize(budget: BudgetRollup): string {
  const spent = formatMoney(budget.spent);
  const target = budget.target === null ? null : formatMoney(budget.target);

  const clauses: string[] = [];
  if (spent !== null) clauses.push(target === null ? `${spent} spent` : `${spent} of ${target} spent`);

  if (budget.target === null) {
    clauses.push("no budget set");
  } else if (budget.remaining !== null) {
    const isOver = Number(budget.remaining) < 0;
    // The formatter would render an overspend as `-$12.00`; the line says
    // `$12.00 over` instead, so the sign moves into the word while the
    // magnitude still goes through the one formatter — dropping the leading
    // `-` rather than round-tripping the value through `Number`.
    const magnitude = formatMoney(isOver ? budget.remaining.slice(1) : budget.remaining);
    if (magnitude !== null) clauses.push(`${magnitude} ${isOver ? "over" : "left"}`);
  }

  return clauses.join(" · ");
}

/**
 * The tally beneath it: `3 of 7 bought · 2 purchases with no amount recorded ·
 * $150.00 of $200.00 allocated to people`.
 *
 * **The disclosure renders whenever the count is non-zero.** A purchase with no
 * amount is counted as bought and excluded from the money total, so without
 * this clause the line above reads as fact when it is an understatement. It is
 * not a detail to drop for a tidier layout (project spec §7).
 *
 * The allocation clause (decision 11) says how much of a set overall has gone
 * to people, or how far the allocation exceeds it, or — when no overall is set
 * — that the figure above is the sum of the people's budgets. Nothing when
 * nothing is allocated, which is also every giftee's own line.
 */
function tally(budget: BudgetRollup): string {
  const clauses = [`${budget.bought_count} of ${budget.total_count} bought`];
  if (budget.unpriced_count > 0) {
    const noun = budget.unpriced_count === 1 ? "purchase" : "purchases";
    clauses.push(`${budget.unpriced_count} ${noun} with no amount recorded`);
  }
  const allocation = allocationClause(budget);
  if (allocation !== null) clauses.push(allocation);
  return clauses.join(" · ");
}

function allocationClause(budget: BudgetRollup): string | null {
  if (budget.allocation_count === 0) return null;
  if (budget.amount === null) return allocationSentence(budget.allocation_count);
  const allocated = formatMoney(budget.allocated);
  if (allocated === null || budget.unallocated === null) return null;
  if (Number(budget.unallocated) < 0) {
    const over = formatMoney(budget.unallocated.slice(1));
    return over === null ? null : `${allocated} allocated · ${over} over your budget`;
  }
  const amount = formatMoney(budget.amount);
  return amount === null ? null : `${allocated} of ${amount} allocated to people`;
}
