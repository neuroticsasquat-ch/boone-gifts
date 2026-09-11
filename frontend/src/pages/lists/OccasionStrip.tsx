import { useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getOccasionIndex } from "../../api/occasions";
import { useSearchParamState } from "../../hooks/useSearchParamState";
import { useNavigationDepth } from "../../contexts/NavigationDepthContext";
import { OccasionSharingModal } from "../../components/OccasionSharingModal";
import { ShareIntoOccasionButton } from "../../components/ShareIntoOccasionButton";
import type { OccasionSummary } from "../../types";

/** How many cards the collapsed strip shows. A cap on what is *rendered*, not
 *  a promise about how many sit on a line — the grid below wraps. */
const COLLAPSED_COUNT = 4;

/** The expanded value of the `occasions` param. Its presence is the whole
 *  state; the value only has to be stable and readable in a shared URL. */
const EXPANDED = "all";

/**
 * The row of occasion cards at the top of `/lists`: every non-archived occasion
 * in every family the viewer belongs to, most recently active first, four at a
 * time.
 *
 * `/occasions/:id` holds the viewer's budget and their shopping tab and is the
 * hardest page in the app to reach — People, then a family, then its Occasions
 * section. Nobody looks for Christmas under "People" (ADR 0007). This is the
 * way in, on the page the app opens on.
 *
 * Renders **nothing at all** when the viewer has no occasions — no empty card,
 * no heading — the same shape as `ActionableBanner` directly above it. It also
 * renders nothing while the query is pending and nothing when it fails, and
 * deliberately does not join the Lists page's own pending gate: holding the
 * viewer's own lists behind a request that exists to show occasions is exactly
 * the burial this strip was built to undo.
 *
 * **No money, anywhere.** The budget line stays on the occasion page: `/lists`
 * is the first screen the app shows, and a figure here puts the viewer's
 * Christmas spend in front of whoever is standing behind them — including the
 * people they are buying for.
 */
export function OccasionStrip() {
  const occasions = useQuery({
    // The literal "index" segment keeps this clear of the per-family
    // ["occasions", familyId] entries while sharing their ["occasions"]
    // prefix, so one prefix sweep invalidates both.
    queryKey: ["occasions", "index", { archived: false }],
    queryFn: () => getOccasionIndex(false),
  });

  // A viewer with occasions who sees no strip otherwise has no way to tell a
  // failure from having none, so the absence is explained rather than silent.
  const loadFailed = occasions.isError;
  useEffect(() => {
    if (loadFailed) toast.error("Couldn't load your occasions.");
  }, [loadFailed]);

  // The expansion is a *preference* about a page the viewer is already on, not
  // a place: Back should leave /lists rather than collapse the strip.
  const [expansion, setExpansion] = useSearchParamState("occasions", { mode: "replace" });
  const expanded = expansion === EXPANDED;

  // An open dialog is a *place*, so it pushes — and on this page the value has
  // to say **which** occasion, because the strip can hold fifteen cards and
  // `open` would not. `useEnumSearchParam` cannot carry it: its heal fires
  // whenever the raw value is not in `values`, and the occasion index is async,
  // so `?share=7` would be scrubbed from the address on the first render,
  // before the query that could recognise `7` has answered.
  const [share, setShare] = useSearchParamState("share", { mode: "push" });
  const depth = useNavigationDepth();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const stripShare = useCallback(() => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete("share");
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const all = occasions.data ?? [];
  // So the heal happens **once the index resolves** — the same shape
  // `ListDetail` uses for a non-owner's `?share=open`, and for the same reason:
  // ownership, like membership, is not known until a query answers. An id that
  // is not among the viewer's occasions is replace-stripped and no dialog
  // mounts; `?share=banana` goes the same way.
  const sharing = all.find((occasion) => String(occasion.id) === share) ?? null;
  const unknownShare = occasions.isSuccess && share !== null && sharing === null;
  useEffect(() => {
    if (unknownShare) stripShare();
  }, [unknownShare, stripShare]);

  // One close path, depth-aware, mirroring `ListDetail` (CONTEXT.md rule 8).
  function closeSharing() {
    if (depth > 0) navigate(-1);
    else stripShare();
  }

  if (all.length === 0) return null;

  // The server's order is the order (`last_activity_at DESC, id DESC`).
  const shown = expanded ? all : all.slice(0, COLLAPSED_COUNT);
  const canExpand = all.length > COLLAPSED_COUNT;

  return (
    <section aria-label="Occasions">
      <h2 className="text-lg font-semibold text-gray-900">Occasions</h2>

      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {shown.map((occasion) => (
          <li key={occasion.id}>
            <OccasionCard occasion={occasion} onShare={() => setShare(String(occasion.id))} />
          </li>
        ))}
      </ul>

      {/* The strip mounts it, never the card. A successful share takes that
          occasion's list_count from 0 to 1, which is exactly what makes the
          card's body slot — and the button inside it — stop rendering; a dialog
          owned by the card would unmount under the viewer's cursor, filter
          text and all, the moment their first tick landed. */}
      {sharing && (
        <OccasionSharingModal
          occasionId={sharing.id}
          occasionName={sharing.name}
          onClose={closeSharing}
        />
      )}

      {/* One control in one place, in both states. An expansion the viewer can
          set and cannot unset is a trap, and on a phone showing fifteen cards
          collapsing is the first thing they will want. */}
      {canExpand && (
        <p className="mt-3 text-right">
          <button
            onClick={() => setExpansion(expanded ? null : EXPANDED)}
            className="text-sm text-blue-600 hover:underline"
          >
            {expanded ? "Show fewer" : `See all ${all.length}`}
          </button>
        </p>
      )}
    </section>
  );
}

/**
 * A card is a plain container holding a link region and a body slot beneath it
 * — not one large `<Link>` around the whole card. M3 (NEU-1308) puts a
 * `<button>` in that body, and a `<button>` inside an `<a>` is invalid HTML; a
 * whole-card anchor would force that ticket either to restructure the card or
 * to give empty occasions a second shape. The trade is that the click target is
 * the card's upper region rather than its whole area.
 *
 * **Every** occasion keeps its route to `/occasions/:id`, the empty ones
 * included — that page holds the budget and the shopping tab, which is the
 * whole argument of ADR 0007.
 */
function OccasionCard({
  occasion,
  onShare,
}: {
  occasion: OccasionSummary;
  onShare: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-white p-4 shadow">
      <Link to={`/occasions/${occasion.id}`} className="-m-2 rounded p-2 hover:bg-gray-50">
        <p className="font-medium text-gray-900">{occasion.name}</p>
        {/* Not decoration: two families routinely both call an occasion
            "Christmas 2026", and the name alone does not identify one. */}
        <p className="text-sm text-gray-500">{occasion.family_name}</p>
        {/* Suppressed at zero: the body slot below already states that
            condition, and "0 lists" above "No lists yet" says it twice. */}
        {occasion.list_count > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {occasion.list_count} {occasion.list_count === 1 ? "list" : "lists"}
          </p>
        )}
        <BoughtLine occasion={occasion} />
      </Link>

      {/* The body slot, and what it was shaped for: the control that shares one
          of the viewer's own lists into this occasion, replacing the "No lists
          yet" sentence rather than sitting under it. Only on an empty card —
          a non-empty one has no body slot, and giving it one would mean either
          restructuring the card or a second card shape. The occasion page is
          one tap away and carries the control in both states.

          The strip excludes archived occasions, so no card here is ever the
          disabled branch. */}
      {occasion.list_count === 0 && (
        <div className="mt-2">
          <ShareIntoOccasionButton onOpen={onShare} />
        </div>
      )}
    </div>
  );
}

/**
 * `N of M bought` — the viewer's **own** claims in this occasion, and the ones
 * they have bought.
 *
 * Suppressed entirely when the viewer has claimed nothing, so an untouched
 * occasion reads as empty rather than as "0 of 0 bought" (§5.2). Zero bought
 * out of three claimed still renders: "0 of 3 bought" is a real state.
 *
 * A claim filed under an occasion survives its list being unshared, so an
 * occasion can legitimately show 0 lists and a non-zero bought line. The card
 * renders both without comment.
 */
function BoughtLine({ occasion }: { occasion: OccasionSummary }) {
  if (occasion.my_claimed_count === 0) return null;
  return (
    <p className="mt-1 text-xs font-medium text-blue-600">
      {occasion.my_bought_count} of {occasion.my_claimed_count} bought
    </p>
  );
}
