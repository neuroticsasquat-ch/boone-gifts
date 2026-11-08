/* eslint-disable react/only-export-components -- `matchesFilter` is the one
   predicate both dialogs filter on, and it belongs beside the rows it filters:
   splitting it into a third module to satisfy fast refresh would put the rule
   and the rows that obey it in different files. Same escape hatch, same reason,
   as `BackControl.tsx`. */
import { Link } from "react-router";

/**
 * The row primitives every sharing section is built from, in one module so the
 * two modes cannot drift.
 *
 * Extracted from `SharingModal.tsx` by NEU-1308, unchanged in behaviour. There
 * are now two dialogs — the list's own (families and people) and the
 * occasion's (the viewer's own lists) — and `No lists match "zzz"` must read
 * exactly like `No people match "zzz"` because they are the same sentence about
 * the same box.
 */

/**
 * The one predicate, applied identically to every row in every section.
 *
 * A disabled row is never *specially* dropped and never *specially* kept.
 * "The filter must not hide disabled rows" has a literal reading that defeats
 * the feature — at 8 families and 20 covered people the list would never get
 * short — and the contract is the narrow one: "why can't I share with Gran?"
 * is answered by typing "gran" and seeing Gran, greyed, with the reason
 * (CONTEXT.md rule 6).
 *
 * Occasion names are deliberately not among the fields any caller passes: an
 * occasion is not the row's identity, the `<select>` already lists them, and a
 * family row matching on text inside a collapsed control the viewer cannot see
 * is worse than one that does not appear at all. Occasion mode passes list
 * names alone for the same reason — a list's recipient line is rendered by
 * `ListAttribution` and is not the row's identity.
 */
export function matchesFilter(filter: string, ...fields: (string | undefined)[]): boolean {
  const query = filter.trim().toLowerCase();
  if (query === "") return true;
  return fields.some((field) => field !== undefined && field.toLowerCase().includes(query));
}

/** What a query for nothing looks like, said apart from having nothing to
 *  query: showing "add a connection" to someone with forty of them is a lie. */
export function NoMatches({ noun, filter }: { noun: string; filter: string }) {
  return <Hint>{`No ${noun} match "${filter.trim()}"`}</Hint>;
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

/**
 * An empty section's sentence, and — only where following a link costs the
 * viewer nothing — the way out of it.
 *
 * `to` is a prop rather than the `/people` literal it was inside `SharingModal`:
 * the occasion dialog's empty population leads to `/lists/new`, and the two
 * emptinesses are the same shape pointing at different doors.
 */
export function EmptyGroup({
  title,
  children,
  link,
  to,
  linkAway,
}: {
  title: string;
  children: React.ReactNode;
  link: string;
  to: string;
  linkAway: boolean;
}) {
  return (
    <Group title={title}>
      <Hint>
        {children}
        {linkAway && (
          <>
            {" "}
            <Link to={to} className="text-blue-600 hover:underline">
              {link}
            </Link>
          </>
        )}
      </Hint>
    </Group>
  );
}

/** One row: a name, optional detail line, and the checkbox that grants access. */
export function ShareRow({
  name,
  detail,
  checked,
  disabled,
  toggleLabel,
  onToggle,
}: {
  name: string;
  detail?: string;
  checked: boolean;
  disabled: boolean;
  /** What the checkbox is called, where `Share with {name}` would not parse.
   *  A family and a person are shared *with*; a list is shared, so occasion
   *  mode says `Share {name}` and the two modes keep one row component. */
  toggleLabel?: string;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">{name}</p>
        {detail && <p className="text-sm text-gray-500">{detail}</p>}
      </div>
      <label className="flex items-center gap-2">
        <span className="sr-only">{toggleLabel ?? `Share with ${name}`}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
        />
      </label>
    </li>
  );
}
