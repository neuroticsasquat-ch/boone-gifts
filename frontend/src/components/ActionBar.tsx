import { ACTION_TONE_CLASSES, type Tone } from "./tone";

export type ActionBarItem = {
  label: string;
  onClick: () => void;
  /** How loud this action is. `ConfirmDialog`'s vocabulary, not a second one. */
  tone?: Tone;
  /** This item's mutation is in flight. */
  pending?: boolean;
  /** What the item says while it works; defaults to `${label}…`. */
  pendingLabel?: string;
  /**
   * Overrides the accessible name, so a row's action can name its subject while
   * its visible text stays short. Rows only — a page heading already says which
   * list or occasion a header's actions are about.
   */
  ariaLabel?: string;
};

/**
 * Every action on the thing a page header or a list row is about, as visible
 * controls (`CONTEXT.md` rule 12, ADR 0009). It replaced a `⋯` overflow menu
 * that nobody read as a menu — two of whose four call sites held a single item.
 *
 * There is no `open` state, no outside-click effect and no `aria-expanded`,
 * because there is nothing to reveal. Nor is there the focus dance the menu
 * needed: it returned focus to the trigger *before* running an action, since
 * choosing an item unmounted the trigger and a `ConfirmDialog` opened by that
 * action captures whatever is focused as the element to restore to. A visible
 * button is already the focused element when clicked.
 */
export function ActionBar({ items }: { items: ActionBarItem[] }) {
  // Danger last, which is what `HeaderMenu`'s `separatorBefore` always meant:
  // it was set once, to fence Delete off from the rest.
  const isDanger = (item: ActionBarItem) => item.tone === "danger";
  const ordered = [...items.filter((item) => !isDanger(item)), ...items.filter(isDanger)];
  const firstDanger = ordered.find(isDanger);

  // One mutation in flight stops the whole bar. The menu got this free — with
  // it shut, disabling the trigger disabled everything — and four separately
  // clickable buttons do not. Two mutations must never race on the same object.
  const busy = items.some((item) => item.pending);

  return (
    // Wraps; never scrolls and never truncates. The owner's list header is
    // wider than a 375px viewport, and a horizontal scroll strip would push
    // actions past the visible edge — this ticket's complaint in a new costume.
    <div className="flex flex-wrap items-center gap-2">
      {ordered.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          disabled={busy}
          // Stays put while the item works, so it still names the subject that
          // the busy label cannot. WCAG 2.5.3 wants the accessible name to
          // contain the visible label, and "Removing…" is not inside "Remove
          // Jane Boone" — but that mismatch exists only while `pending` holds,
          // and `pending` disables every button in the bar. A disabled control
          // is operable by neither voice nor pointer, so there is no activation
          // for the criterion to protect. At rest the two agree.
          aria-label={item.ariaLabel}
          className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
            item === firstDanger ? "ml-2 " : ""
          }${ACTION_TONE_CLASSES[item.tone ?? "neutral"]}`}
        >
          {item.pending ? (item.pendingLabel ?? `${item.label}…`) : item.label}
        </button>
      ))}
    </div>
  );
}
