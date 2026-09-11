/* eslint-disable react/only-export-components */
import { Link, useNavigate } from "react-router";
import { useNavigationDepth } from "../contexts/NavigationDepthContext";

/** Where a page goes back to when the app doesn't know where you came from,
 *  and the one word it calls that place. */
export interface BackDestination {
  readonly to: string;
  readonly label: string;
}

// One constant per destination rather than a string literal per page: seven
// literals is exactly how the seven phrasings this replaces happened, and a
// shared constant means an eighth page has to invent a new word rather than
// copy one. `Lists` and `People` are the words `Layout.tsx`'s one `tabs` array
// already uses, so the app has one name per section end to end.
export const BACK_TO_LISTS: BackDestination = { to: "/lists", label: "Back to Lists" };
export const BACK_TO_PEOPLE: BackDestination = { to: "/people", label: "Back to People" };

/**
 * A family, named. The destination is known before the name is — from the route
 * on the archive page, from the loaded occasion on the occasion page — so the
 * link points at the right family immediately and only the word is pending. It
 * reads `Family` until the name arrives, and stays `Family` if the fetch fails:
 * showing `Back to People` meanwhile would change the *destination* mid-render,
 * so a viewer who clicked during the fetch would land somewhere different from
 * one who waited, which is the "sometimes a lie" this control exists to remove.
 */
export function backToFamily(id: number, name: string | undefined): BackDestination {
  return { to: `/people/families/${id}`, label: name ?? "Family" };
}

const BASE_CLASS = "text-sm text-blue-600 hover:underline";

/**
 * The one back control. A generic label that is always true beats a specific one
 * that is sometimes a lie (CONTEXT.md rule 9).
 *
 * At depth > 0 the previous entry is one the app pushed, so Back returns you to
 * the page you actually came from and says only `← Back`. At depth 0 — a deep
 * link, a new tab, a reload — there is nothing behind us to return to, so it
 * goes to the page's one named parent and says its name.
 *
 * Each depth renders the element that tells the truth: a `<button>` for an
 * action with no destination, a `<Link>` for a real address, which then
 * cmd-clicks and shows a status bar like any link. Rendering a `<Link>` at both
 * depths and intercepting the click would put `/lists` in the status bar and the
 * context menu while activation went elsewhere.
 */
export function BackControl({
  fallback,
  className,
}: {
  fallback: BackDestination;
  className?: string;
}) {
  const depth = useNavigationDepth();
  const navigate = useNavigate();
  const classes = className ? `${BASE_CLASS} ${className}` : BASE_CLASS;

  if (depth > 0) {
    return (
      <button type="button" onClick={() => navigate(-1)} className={classes}>
        &larr; Back
      </button>
    );
  }

  return (
    <Link to={fallback.to} className={classes}>
      &larr; {fallback.label}
    </Link>
  );
}
