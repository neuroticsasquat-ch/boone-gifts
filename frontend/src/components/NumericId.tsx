/* eslint-disable react/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { Link, useParams } from "react-router";

const NumericIdContext = createContext<number | null>(null);

/**
 * The `:id` of the route this component sits under, already parsed and already
 * known to be a real id — `<NumericId>` renders the bad-address arm instead of
 * its children when it isn't, so a page that mounts never has to ask.
 *
 * Throws outside a wrapper rather than yielding `NaN`, which is the failure the
 * six pages used to carry: `Number(useParams().id)` is a `number` whatever the
 * address says, and the mistake only surfaced later, at the backend or in a
 * spinner that never stopped.
 */
export function useNumericId(): number {
  const id = useContext(NumericIdContext);
  if (id === null) {
    throw new Error("useNumericId must be used inside <NumericId>");
  }
  return id;
}

/**
 * The question is whether the *address* is well-formed, so it is asked of the
 * address text and not of whatever `Number()` coerces it into. `Number.isFinite`
 * on the coerced value accepted `0x10` as 16 and `1e3` as 1000 — the URL bar
 * saying one thing while the page loaded another. Ids start at 1, so `0` is a
 * wrong address rather than a missing row.
 */
function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^[0-9]+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `/people` → `People`. The destinations are top-level sections, so the last
 *  segment is already the name the nav gives them. */
function sectionName(back: string): string {
  const segment = back.split("/").filter(Boolean).at(-1) ?? "";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Validates a route's numeric `:id` before its page is allowed to mount
 * (`docs/adr/0006-route-ids-are-validated-at-the-route.md`).
 *
 * A malformed id is not a slow read and not a 404 the server was ever asked
 * about — it is a wrong address, and it says so, with a way back and no retry,
 * because retrying a wrong address cannot help. Wrapping the route rather than
 * guarding in each page is what lets every page below take its id as a plain
 * `number`: `enabled:` id guards are gone from all six, because a page that
 * renders has a real id by construction.
 *
 * `back` is the section to return to — `/lists` or `/people`.
 */
export function NumericId({ back, children }: { back: string; children: ReactNode }) {
  const { id } = useParams();
  const parsed = parseId(id);

  if (parsed === null) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">This page&apos;s address isn&apos;t valid.</p>
        <Link to={back} className="mt-2 inline-block text-sm text-blue-600 hover:underline">
          ← Back to {sectionName(back)}
        </Link>
      </div>
    );
  }

  return <NumericIdContext.Provider value={parsed}>{children}</NumericIdContext.Provider>;
}
