/**
 * The one statement of the sharing control's three-state rule (project spec
 * §5.2), so the panel and the create form cannot drift apart on it.
 *
 * A list is shared to an occasion, never to a family, which leaves a family row
 * in one of exactly three shapes depending on how many active occasions it has.
 */

/** An occasion as either sharing surface holds it: enough to name and pick one. */
export interface ChoosableOccasion {
  id: number;
  name: string;
}

export type OccasionChoice<T extends ChoosableOccasion> =
  /** No active occasion: the row is rendered, disabled, with the reason given.
   *  Nothing grants a list to such a family, so it cannot be shared to at all. */
  | { kind: "none" }
  /** The common case. Ticking shares to it; the name is displayed for
   *  transparency but is not a control, so sharing stays one click. */
  | { kind: "one"; occasion: T }
  /** Several: the checkbox is accompanied by a select, and ticking without
   *  choosing is refused — here and on the server. */
  | { kind: "many"; occasions: T[] };

/** Why a family with no active occasion cannot be shared to. Said in full on
 *  the row itself, because it is the whole reason the row is disabled. */
export const NO_ACTIVE_OCCASION = "No active occasion — a member needs to create one";

/**
 * Which of the three shapes a family's occasions put its row in.
 *
 * Archived occasions are not choices: archiving blocks new shares and only that
 * (project spec §5.4), so one still reaches this function — a share made before
 * it was archived keeps its name displayable — but never as something to tick.
 */
export function occasionChoice<T extends ChoosableOccasion & { is_archived?: boolean }>(
  occasions: T[],
): OccasionChoice<T> {
  const active = occasions.filter((o) => o.is_archived !== true);
  if (active.length === 0) return { kind: "none" };
  if (active.length === 1) return { kind: "one", occasion: active[0] };
  return { kind: "many", occasions: active };
}
