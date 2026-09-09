import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { updateClaim } from "../api/claims";
import { getFolderShopping } from "../api/folders";
import { getOccasionShopping } from "../api/occasions";
import { purchaseGift, unpurchaseGift } from "../api/gifts";
import { formatMoney } from "../lib/money";
import { shoppingKey, type ShoppingScope } from "../lib/shopping";
import { BudgetLine } from "./BudgetLine";
import { Spinner } from "./Spinner";
import type { ShoppingItem } from "../types";

/** Nothing-here reads differently per scope, because *why* it is empty differs:
 *  an occasion holds claims filed under it, a folder holds claims on the lists
 *  it collects. A single message would be wrong on one of them. */
const EMPTY: Record<ShoppingScope["kind"], string> = {
  occasion: "You haven't claimed anything for this occasion yet.",
  folder: "You haven't claimed anything from the lists in this folder yet.",
};

/**
 * The **My shopping** tab, shared by the occasion page and the folder page
 * (project spec §9.2, §9.3): the viewer's own claims, grouped by list, with the
 * purchase tick and what they paid.
 *
 * **Only ever the viewer's own claims** — no aggregate here reaches anyone
 * else's, at any time (`CONTEXT.md` rule 2). The endpoints carry no parameter
 * that could widen it, so this is structural rather than a filter applied here.
 */
export function MyShopping({ scope }: { scope: ShoppingScope }) {
  const queryClient = useQueryClient();

  const shopping = useQuery({
    queryKey: shoppingKey(scope),
    queryFn: () =>
      scope.kind === "occasion" ? getOccasionShopping(scope.id) : getFolderShopping(scope.id),
  });

  function handleChanged(listId: number) {
    // A purchase moves the budget's `spent` and its counts as well as the row,
    // and the two arrive in one payload — so a single invalidation refreshes
    // the claims and the line above them together, and they cannot disagree.
    queryClient.invalidateQueries({ queryKey: shoppingKey(scope) });
    // The same claim is what list detail renders, so its page is refreshed too
    // rather than left showing yesterday's answer.
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
  }

  if (shopping.isPending) return <Spinner />;
  if (shopping.isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600">Couldn&apos;t load your shopping.</p>
        <button
          onClick={() => shopping.refetch()}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // The budget line sits directly above the groups (project spec §9.2), and it
  // is rendered whether or not there is anything claimed yet: the tally
  // describes the viewer's shopping either way, and a budget is something they
  // may well want to set before they have bought anything.
  const { budget, items } = shopping.data;

  return (
    <div className="space-y-4">
      <BudgetLine budget={budget} scope={scope} />
      {items.length === 0 ? (
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p className="text-gray-500">{EMPTY[scope.kind]}</p>
          <p className="mt-1 text-sm text-gray-400">
            Claim a gift from a shared list and it shows up here.
          </p>
        </div>
      ) : (
        groupByList(items).map((group) => (
          <div key={group.listId} className="overflow-hidden rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-700">{group.listName}</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {group.items.map((item) => (
                <ShoppingRow
                  key={item.claim_id}
                  item={item}
                  onChanged={() => handleChanged(item.list_id)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Claims in the order the backend sent them, gathered under their list.
 *
 * Grouped on `list_id` and never on `list_name`: two lists routinely share a
 * name — a "Christmas list" per person is the ordinary case — and grouping on
 * the name silently merges them into one heading.
 */
function groupByList(items: ShoppingItem[]) {
  const groups = new Map<number, { listId: number; listName: string; items: ShoppingItem[] }>();
  for (const item of items) {
    const group = groups.get(item.list_id);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(item.list_id, {
        listId: item.list_id,
        listName: item.list_name,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

/**
 * One claimed gift: the tick, the owner's asking price, and what the claimer
 * paid.
 *
 * Two amount paths, deliberately not one:
 *
 * - **Ticking reveals a prompt** — Save and Skip commit it, exactly as list
 *   detail's `PurchaseControl` does, so an amount someone meant to type is
 *   never lost to a tick they wandered away from and Skip stays one click.
 * - **A recorded amount is corrected in place**, through `PATCH /claims/{id}`.
 *   This is the tab that can: it carries the claim id, which the list-detail
 *   payload does not (project spec §6.2). Editing must not go back through
 *   `POST /purchase`, which re-stamps `purchased_at` to today and would walk
 *   the purchase across an occasion boundary to fix a typo.
 */
function ShoppingRow({ item, onChanged }: { item: ShoppingItem; onChanged: () => void }) {
  const isPurchased = item.purchased_at !== null;
  const [prompting, setPrompting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");

  // Ticked as far as the control is concerned: a revealed prompt has already
  // moved the box, and taking the tick back is what abandons it.
  const isTicked = isPurchased || prompting;

  const purchaseMutation = useMutation({
    // `undefined` is Skip: the field goes unset and the server leaves any
    // amount already recorded alone. That is what makes unticking and
    // re-ticking non-destructive, so the two must not collapse into one.
    mutationFn: (amountPaid: string | null | undefined) =>
      purchaseGift(item.list_id, item.gift_id, amountPaid),
    onSuccess: () => {
      setPrompting(false);
      onChanged();
    },
    onError: () => toast.error("Failed to record the purchase."),
  });

  const unpurchaseMutation = useMutation({
    mutationFn: () => unpurchaseGift(item.list_id, item.gift_id),
    onSuccess: onChanged,
    onError: () => toast.error("Failed to update the purchase."),
  });

  const amountMutation = useMutation({
    mutationFn: (amountPaid: string | null) => updateClaim(item.claim_id, { amount_paid: amountPaid }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: () => toast.error("Failed to save the amount."),
  });

  const isSaving =
    purchaseMutation.isPending || unpurchaseMutation.isPending || amountMutation.isPending;

  function handleToggle() {
    // Unticking an unanswered prompt abandons it: the tick recorded nothing, so
    // there is nothing to undo on the server.
    if (prompting) {
      setPrompting(false);
    } else if (isPurchased) {
      setEditing(false);
      unpurchaseMutation.mutate();
    } else {
      // Seeded from the claimer's **own** recorded amount and nothing else —
      // which is empty on a claim they have never priced, and is what they last
      // typed on one they unticked. Unticking deliberately leaves `amount_paid`
      // standing so re-ticking need not retype it (project spec §10.4); seeding
      // blank here would send an explicit null on Save and quietly destroy it.
      //
      // The owner's asking price is never what fills this field: it sits beside
      // it as a hint, because a budget pre-filled from someone else's wishlist
      // price looks precise and is a guess (project spec §6.3).
      setAmount(item.amount_paid ?? "");
      setPrompting(true);
    }
  }

  function openEditor() {
    // Seeded from what the claimer themselves recorded, which is the one number
    // it is honest to pre-fill with.
    setAmount(item.amount_paid ?? "");
    setEditing(true);
  }

  /** A blank field is a deliberate "no amount", not a no-op: it records the
   *  purchase without one when prompting, and clears a recorded one when
   *  editing. Cancel is how an editor leaves without changing anything. */
  function handleSave() {
    const trimmed = amount.trim();
    const value = trimmed === "" ? null : trimmed;
    if (editing) {
      amountMutation.mutate(value);
    } else {
      purchaseMutation.mutate(value);
    }
  }

  const fieldId = `shopping-amount-${item.claim_id}`;
  const paidText = formatMoney(item.amount_paid);
  const priceText = formatMoney(item.price);

  return (
    <li className={`px-4 py-3 ${isPurchased ? "bg-gray-50" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isTicked}
          onChange={handleToggle}
          disabled={isSaving}
          aria-label={`Mark "${item.name}" as ${isTicked ? "not bought" : "bought"}`}
          className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 disabled:cursor-not-allowed"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-medium text-blue-600 hover:underline ${isPurchased ? "text-gray-400 line-through" : ""}`}
              >
                {item.name}
              </a>
            ) : (
              <span
                className={`font-medium ${isPurchased ? "text-gray-400 line-through" : "text-gray-900"}`}
              >
                {item.name}
              </span>
            )}
            {/* The owner's asking price, never the claimer's spend. */}
            {priceText && <span className="text-xs text-gray-400">listed at {priceText}</span>}
          </div>

          {item.description && (
            <p className={`mt-0.5 text-sm ${isPurchased ? "text-gray-400" : "text-gray-500"}`}>
              {item.description}
            </p>
          )}

          {isPurchased && !editing && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {paidText ? (
                <span className="text-xs text-gray-600">you paid {paidText}</span>
              ) : (
                // An understated total must read as an understatement, never as
                // fact (project spec §7) — so a purchase with no amount says so
                // rather than showing nothing.
                <span className="text-xs text-gray-400">no amount recorded</span>
              )}
              <button
                type="button"
                onClick={openEditor}
                disabled={isSaving}
                aria-label={`${paidText ? "Edit" : "Add"} amount for "${item.name}"`}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {paidText ? "Edit" : "Add amount"}
              </button>
            </div>
          )}

          {(prompting || editing) && (
            <div className="mt-1 space-y-1">
              <label htmlFor={fieldId} className="block text-xs text-gray-600">
                What did you pay?
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={fieldId}
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                {priceText && <span className="text-xs text-gray-400">listed at {priceText}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {purchaseMutation.isPending || amountMutation.isPending ? "Saving…" : "Save"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={isSaving}
                    className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => purchaseMutation.mutate(undefined)}
                    disabled={isSaving}
                    className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
