import { OCCASION_ARCHIVED } from "../lib/sharing-summary";

/** The words, in all three places it appears — including the two empty states,
 *  where the condition ("No lists yet") is what the control replaces rather
 *  than something it repeats. */
const LABEL = "Share a list";

/**
 * The one control that opens occasion mode, in all three places it is offered
 * (NEU-1308, decision 4):
 *
 * | Where | Shape |
 * |---|---|
 * | `/occasions/:id` Lists tab, **no lists** | the empty state's body *is* this button |
 * | `/occasions/:id` Lists tab, **with lists** | above the list rows |
 * | `/lists` strip, **empty card** | the body slot `OccasionStrip` built for it |
 *
 * One component rather than three call sites, so the copy and the disabled
 * reason are stated once. It **only opens** the dialog — it never mounts one:
 * a successful share takes a card's `list_count` from 0 to 1, which is exactly
 * what makes that card's body slot stop rendering, so a dialog mounted here
 * would unmount under the viewer's cursor the moment their first tick landed
 * (decision 6).
 *
 * An archived occasion renders it **disabled, with the reason** — rule 6's
 * "listed, disabled, reason given" shape, and unlike a placeholder for a
 * milestone that has not shipped, a reason the viewer can act on. Dropping the
 * control silently would take away something the viewer sees on every other
 * occasion and say nothing; leaving it live would offer a click that can never
 * succeed.
 */
export function ShareIntoOccasionButton({
  isArchived = false,
  onOpen,
}: {
  isArchived?: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isArchived}
        onClick={onOpen}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {LABEL}
      </button>
      {isArchived && <span className="text-sm text-gray-500">{OCCASION_ARCHIVED}</span>}
    </div>
  );
}
