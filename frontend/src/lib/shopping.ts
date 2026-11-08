/**
 * What bounds a shopping tab, and where its payload lives in the query cache.
 *
 * Both live here rather than beside the tab because two components need them —
 * `MyShopping` reads the payload, `BudgetLine` writes the budget half back into
 * it — and a query key restated in a second file is a cache bug waiting to
 * happen. (Keeping them out of a component module also leaves Fast Refresh
 * working: a file that exports a component may export nothing else.)
 */

/**
 * An occasion the claims are *filed under*, or a folder the claimed-from lists
 * are *in*. The two reads return the same shape from the same backend query and
 * differ only in that scope, which is why one component serves both pages
 * rather than each growing its own copy.
 */
export type ShoppingScope =
  | { kind: "occasion"; id: number }
  | { kind: "folder"; id: number };

/** The cache entry holding a scope's whole shopping payload — the claims and
 *  the budget line above them, which arrive together and must agree. */
export function shoppingKey(scope: ShoppingScope) {
  return ["shopping", scope.kind, scope.id];
}
