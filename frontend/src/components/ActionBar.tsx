import { useState } from "react";
import { ACTION_TONE_CLASSES, type Tone } from "./tone";
import { useMediaQuery } from "../hooks/useMediaQuery";

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
 * Tailwind v4's `md`, and the width `ListHeader` and `FolderDetail` already
 * stack at. Not a prop: a call site choosing its own breakpoint would be a
 * second way to say the thing this constant says.
 */
const MD = "(min-width: 768px)";

/**
 * Every action on the thing a page header or a list row is about, as visible
 * controls (`CONTEXT.md` rule 12, ADR 0009). It replaced a `⋯` overflow menu
 * that nobody read as a menu — two of whose four call sites held a single item.
 *
 * `collapseOnMobile` is that rule's one exception, and it is a width exception
 * rather than a taste one (ADR 0010): below `md` a bar that opts in renders a
 * labelled disclosure instead of its buttons, because a header carrying a
 * heading *and* a group of actions has no room for either on a phone. It is
 * granted to two call sites — the occasion header and a list owner's — and a
 * header holding a single action never gets it, since there is nothing there to
 * group and hiding it would rebuild the exact fault ADR 0009 was filed against.
 *
 * The disclosure is a word carrying `aria-expanded`, never a glyph, and it
 * expands **in place** — so `HeaderMenu`'s outside-click effect and its
 * focus-restore dance stay deleted. That dance returned focus to the trigger
 * *before* running an action, since choosing an item unmounted the trigger and a
 * `ConfirmDialog` opened by that action captures whatever is focused as the
 * element to restore to. Here the button is still mounted and still focused
 * after it is pressed, because triggering an action does not close the panel.
 */
export function ActionBar({
  items,
  collapseOnMobile = false,
}: {
  items: ActionBarItem[];
  collapseOnMobile?: boolean;
}) {
  const isWide = useMediaQuery(MD);
  const [open, setOpen] = useState(false);

  // Danger last, which is what `HeaderMenu`'s `separatorBefore` always meant:
  // it was set once, to fence Delete off from the rest.
  const isDanger = (item: ActionBarItem) => item.tone === "danger";
  const ordered = [...items.filter((item) => !isDanger(item)), ...items.filter(isDanger)];
  const firstDanger = ordered.find(isDanger);

  // One mutation in flight stops the whole bar. The menu got this free — with
  // it shut, disabling the trigger disabled everything — and four separately
  // clickable buttons do not. Two mutations must never race on the same object.
  const busy = items.some((item) => item.pending);

  const buttons = (
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

  if (!collapseOnMobile || isWide) return buttons;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-expanded={open}
        // Disabled with the rest of the bar: reaching a second mutation through
        // the trigger is still reaching it.
        disabled={busy}
        onClick={() => setOpen((isOpen) => !isOpen)}
        // No `aria-controls`. The panel immediately follows its trigger, which
        // is what a disclosure needs and all it needs.
        className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${ACTION_TONE_CLASSES.neutral}`}
      >
        Actions
      </button>
      {open && buttons}
    </div>
  );
}
