import { useId, useState } from "react";
import { Modal } from "./Modal";

/**
 * The chrome every sharing dialog wears: the `lg` modal, its title, the one
 * filter box and its state, the summary line, the scrolling column of rows and
 * the `Done` footer.
 *
 * Two callers shape it, which is the only reason it exists — ADR 0008's
 * argument about `Modal` applies here word for word: *"a shell primitive
 * designed against one caller is a guess […] it can be extracted then, with two
 * callers to shape it."* `SharingModal` is list mode (families and people) and
 * `OccasionSharingModal` is occasion mode (the viewer's own lists, into one
 * fixed occasion). They share the chrome and **nothing else** — different reads,
 * different rows, different writes — so what is stated once here is the input,
 * its label, the scroll column, the no-match wording's home and the footer.
 *
 * The filter reaches the rows as an argument rather than through a context or a
 * prop drilled from the caller: `children` is `(filter: string) => ReactNode`,
 * so the text stays where CONTEXT.md rule 8 puts it — component state inside
 * the dialog, out of the URL — while every section still filters on it.
 *
 * Focus lands on the filter input on open, because `Modal` focuses the first
 * tabbable element and the filter is first in this markup. That is a property
 * of the order below, so keep the input ahead of the rows.
 */
export function SharingShell({
  title,
  filterLabel,
  summary,
  children,
  onClose,
}: {
  title: string;
  /** The filter box's accessible name, doubling as its placeholder with an
   *  ellipsis. One box per dialog, and it says what it filters. */
  filterLabel: string;
  /** The line that makes the state legible without reading every checkbox.
   *  A node rather than a string: each mode has its own loading and failed
   *  wording, and neither may read as "shared with nobody". */
  summary: React.ReactNode;
  children: (filter: string) => React.ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  // Scratch input inside a dialog that pops out of existence, so it stays out
  // of the URL — the genuine exception to CONTEXT.md rule 8, which the rule now
  // names. Nobody links to a half-typed filter, and one `replaceState` per
  // keystroke across 50 rows can reach Safari's ~100-per-30s throttle.
  const [filter, setFilter] = useState("");

  return (
    <Modal open labelledBy={titleId} size="lg" onClose={onClose}>
      {/* Fixed: the filter box, the summary and Done stay in reach however far
          the rows scroll. */}
      <div className="space-y-3 border-b border-gray-200 p-4">
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        {/* Rendered unconditionally — a control that appears once you cross
            some row count is one nobody learns. */}
        <input
          type="search"
          aria-label={filterLabel}
          placeholder={`${filterLabel}…`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {summary}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children(filter)}</div>

      <div className="flex justify-end border-t border-gray-200 p-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

/** The shell's summary line, so both modes say their sentence in one voice. */
export function SharingSummaryLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-gray-900">{children}</p>;
}
