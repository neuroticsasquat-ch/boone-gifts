import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getOccasion, getOccasionLists, updateOccasion } from "../api/occasions";
import { getFamily } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { useNumericId } from "../components/NumericId";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { ActionBar } from "../components/ActionBar";
import { BackControl, BACK_TO_PEOPLE, backToFamily } from "../components/BackControl";
import { ListAttributionLine, RecipientLine } from "../components/ListAttribution";
import { MyShopping } from "../components/MyShopping";
import { TabBar } from "../components/TabBar";
import { useEnumSearchParam } from "../hooks/useSearchParamState";
import { useNavigationDepth } from "../contexts/NavigationDepthContext";
import { ConfirmDialog, type ConfirmAction } from "../components/ConfirmDialog";
import { OccasionSharingModal } from "../components/OccasionSharingModal";
import { ShareIntoOccasionButton } from "../components/ShareIntoOccasionButton";
// `OccasionDetail` is aliased because this module already exports a component
// of that name — the page — and the type is the payload it renders. `Occasion`
// stays alongside it: only the header and the back control need the family, and
// `ListsTab` below is honest about needing no more than the base shape.
import type { Occasion, OccasionDetail as OccasionDetailPayload } from "../types";

/**
 * The tabs the occasion page carries (project spec §9.2). The bar is driven by
 * this array and the body by the active key, which is what made **My shopping**
 * an entry here plus its panel rather than a reshaping of the page.
 */
const TABS = [
  { key: "lists", label: "Lists" },
  { key: "shopping", label: "My shopping" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEYS = TABS.map((tab) => tab.key);

// One message per field, because the backend gates per field (NEU-1294
// decision 4): a member who created an occasion may archive it and may not
// rename it, and a single sentence covering both is now false by half.
const RENAME_ONLY = "Only an organizer can rename an occasion.";
const ARCHIVE_ONLY =
  "Only an organizer or the person who created this occasion can archive it.";

/** An open modal is a place you can be, so `?share=open` is the whole state and
 *  a shut one leaves no trace: setting the fallback writes `null`. The path
 *  already names the occasion, so `open` is unambiguous here — the `/lists`
 *  strip, which can hold fifteen cards, carries the id as the value instead. */
const SHARE_VALUES = ["open", "closed"] as const;

/**
 * A family occasion — "Boone Family · Christmas 2026" — and the lists shared to
 * it (project spec §9.2). The route the nav project retired, reintroduced with
 * the family meaning of the word (`docs/adr/0002-occasion-and-folder.md`).
 *
 * An **archived** occasion renders exactly like an active one. Archiving blocks
 * new shares and nothing else (project spec §5.4): its lists stay viewable and
 * its page stays a page — archiving only takes it out of the default views.
 */
export function OccasionDetail() {
  const occasionId = useNumericId();

  const occasion = useQuery({
    queryKey: ["occasion", occasionId],
    queryFn: () => getOccasion(occasionId),
  });

  // The family qualifies the tab too, so two families' Christmas 2026 stop
  // being indistinguishable in a row of tabs (NEU-1321). The fallback is
  // load-bearing: this sits above the pending guard.
  useTitle(
    occasion.data ? `${occasion.data.family_name} · ${occasion.data.name}` : "Occasion",
  );

  if (occasion.isPending) return <Spinner />;
  if (occasion.isError) {
    // 403 and 404 are the same answer to the viewer — the backend will not say
    // which, and neither will this. "Try again" is only offered where trying
    // again could work, because on those two it never will.
    const status = isAxiosError(occasion.error) ? occasion.error.response?.status : undefined;
    const unreachable = status === 403 || status === 404;
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">
          {unreachable
            ? "This occasion doesn't exist, or it belongs to a family you're not in."
            : "Failed to load occasion."}
        </p>
        {unreachable ? (
          <BackControl fallback={BACK_TO_PEOPLE} className="mt-2 inline-block" />
        ) : (
          <button
            onClick={() => occasion.refetch()}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return <OccasionPage occasion={occasion.data} />;
}

function OccasionPage({ occasion }: { occasion: OccasionDetailPayload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const depth = useNavigationDepth();
  const [, setSearchParams] = useSearchParams();
  // A tab is a **place**, so it pushes: "My shopping for Christmas 2026" has an
  // address, and Back closes it rather than undoing a dropdown (spec §6.3).
  const [tab, setTab] = useEnumSearchParam<TabKey>("tab", {
    mode: "push",
    values: TAB_KEYS,
    fallback: TABS[0].key,
  });
  // So is an open modal. Read as an enum so `?share=banana` heals away through
  // the wrapper's mount-time scrub instead of sitting in the address with the
  // dialog shut.
  const [share, setShare] = useEnumSearchParam("share", {
    mode: "push",
    values: SHARE_VALUES,
    fallback: "closed",
  });

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

  // One close path, depth-aware, mirroring `ListDetail` and `BackControl`
  // (CONTEXT.md rules 8 and 9). The app pushed the open entry, so popping lands
  // exactly where the viewer was; writing `closed` through the push-mode hook
  // would add *another* entry, and Back after Done would reopen the dialog. At
  // depth 0 — a deep link straight to `/occasions/7?share=open` — there is
  // nothing of ours behind us, so strip instead.
  const closeSharing = useCallback(() => {
    if (depth > 0) {
      navigate(-1);
      return;
    }
    stripShare();
  }, [depth, navigate, stripShare]);

  // The control is dead on an archived occasion, but `?share=open` can be
  // pasted, bookmarked, or reached by Back from a session that opened the dialog
  // before an organizer archived it. Mounting it anyway would leave the 409 as
  // the only refusal — the "click that can never succeed" decision 7 rejected —
  // so the param is stripped instead and the address agrees with the page
  // (rule 8). Same shape as `ListDetail`'s non-owner strip.
  const archived = occasion.is_archived;
  useEffect(() => {
    if (share === "open" && archived) stripShare();
  }, [share, archived, stripShare]);

  // The family behind the occasion, for its **members** and the organizer gate
  // alone — the name now arrives on the occasion itself. Still required:
  // `canRename` and `canArchive` are computed from this. Keyed as the family
  // page keys it, so arriving from there costs no request.
  const family = useQuery({
    queryKey: ["family", occasion.family_id],
    queryFn: () => getFamily(occasion.family_id),
  });

  const isOrganizer =
    family.data?.members.find((m) => m.user_id === user?.id)?.role === "organizer";

  // Renaming is the family's business; archiving is also the occasion's, and
  // the person who created it already had the authority to make it. The archive
  // nudge (NEU-1315) routinely sends a plain member here, so organizer-only
  // would be an invitation followed by a 403.
  const canRename = isOrganizer;
  const canArchive = isOrganizer || occasion.created_by_id === user?.id;

  return (
    <div className="space-y-6">
      {/* `occasion.family_name`, not `family.data?.name`: the family query below
          does not resolve until after this has painted, so reading it here would
          show the `Family` placeholder for a round trip, every visit (NEU-1321
          decision 7). `FamilyArchive` still needs that placeholder and keeps it. */}
      <BackControl fallback={backToFamily(occasion.family_id, occasion.family_name)} />

      <OccasionHeader occasion={occasion} canRename={canRename} canArchive={canArchive} />

      <TabBar tabs={TABS} active={tab} onSelect={setTab} label="Occasion sections" />

      {tab === "lists" ? (
        <ListsTab occasion={occasion} onShare={() => setShare("open")} />
      ) : (
        <MyShopping scope={{ kind: "occasion", id: occasion.id }} />
      )}

      {/* Mounted at page level, not inside the tab: the Lists tab's empty state
          is one of the things a successful share replaces, and a dialog owned by
          it would unmount under the viewer's cursor on their first tick. */}
      {share === "open" && !archived && (
        <OccasionSharingModal
          occasionId={occasion.id}
          occasionName={occasion.name}
          onClose={closeSharing}
        />
      )}
    </div>
  );
}

const ARCHIVE_ACTIONS: ConfirmAction[] = [{ id: "archive", label: "Archive", tone: "danger" }];

/**
 * What archiving an occasion does to the lists already shared into it, said
 * once. Two sites ask the question — here, and the family page's per-row
 * Archive (`family-detail/OccasionsSection`) — and one sentence answering it
 * must not be able to drift into two answers (NEU-1319).
 *
 * `ActionableBanner`'s nudge deliberately does **not** use this: its body
 * argues the case for archiving something that has gone quiet, which is a
 * different sentence doing a different job.
 */
export const ARCHIVE_OCCASION_BODY = "Lists already shared to it stay shared.";

/**
 * The occasion's name, whether it is archived, and the controls for changing
 * either.
 *
 * The two controls are gated **separately**, because the backend gates the
 * fields separately: renaming is an organizer's, archiving is an organizer's or
 * the creator's. Both are enforced server-side regardless, which is why a 403
 * still has a message to show — one message each, now that the answers differ.
 */
function OccasionHeader({
  occasion,
  canRename,
  canArchive,
}: {
  occasion: OccasionDetailPayload;
  canRename: boolean;
  canArchive: boolean;
}) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(occasion.name);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  // The page's own copy, and the family page's list it was reached from —
  // prefix match on the latter, so the active and archived lists both refetch.
  // `share-targets` goes too: a rename changes a label list detail's sharing
  // summary prints ("Boone Family · Christmas 2026"), and archiving changes
  // whether that occasion can still be shared to at all.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["occasion", occasion.id] });
    // The bare prefix rather than this family's: it reaches the family page's
    // active and archived lists and the /lists occasion strip's index entry
    // alike, and a rename or an archive moves a card on both.
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
    queryClient.invalidateQueries({ queryKey: ["share-targets"] });
  };

  // The 403 message names the rule for *this* field — the two rules differ, and
  // a viewer refused a rename has not been refused an archive.
  function handleError(err: unknown, forbidden: string, fallback: string) {
    if (isAxiosError(err) && err.response?.status === 403) {
      setActionError(forbidden);
    } else {
      toast.error(fallback);
    }
  }

  const renameMutation = useMutation({
    mutationFn: (newName: string) => updateOccasion(occasion.id, { name: newName }),
    onSuccess: () => {
      invalidate();
      setRenaming(false);
      setActionError(null);
    },
    onError: (err) => handleError(err, RENAME_ONLY, "Failed to rename the occasion."),
  });

  const setArchivedMutation = useMutation({
    mutationFn: (isArchived: boolean) => updateOccasion(occasion.id, { is_archived: isArchived }),
    onSuccess: (_data, isArchived) => {
      invalidate();
      setActionError(null);
      toast.success(isArchived ? "Occasion archived." : "Occasion unarchived.");
    },
    onError: (err) => handleError(err, ARCHIVE_ONLY, "Failed to archive the occasion."),
  });

  function handleRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    renameMutation.mutate(trimmed);
  }

  // Archiving takes the occasion out of every default view, for every member
  // of the family and not just the viewer, so it is confirmed (`CONTEXT.md`
  // rule 11). Unarchiving puts it back and asks nothing.
  function handleArchiveToggle() {
    if (occasion.is_archived) {
      setArchivedMutation.mutate(false);
    } else {
      setConfirmingArchive(true);
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      {renaming ? (
        <form onSubmit={handleRename} className="flex items-center gap-2">
          {/* The form replaces the whole heading row, so without this the family
              would leave the page the moment an organizer started typing — this
              ticket's own bug in a transient state, and at depth > 0 the control
              above reads only "← Back". Static, because the rename covers the
              occasion half of the heading and not the family. */}
          <span className="shrink-0 text-sm text-gray-500">{occasion.family_name} &middot;</span>
          <label className="sr-only" htmlFor="occasion-name">
            Occasion name
          </label>
          <input
            id="occasion-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={renameMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setRenaming(false);
              setName(occasion.name);
            }}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {/* One <h1>, announced whole as "Boone Family · Christmas 2026" —
                the family is what identifies *this* Christmas 2026 among
                several. Unlinked and subordinate: the family's destination on
                this page is the back control above (CONTEXT.md rule 3). */}
            <h1 className="text-2xl font-bold text-gray-900">
              {/* The space between the two halves is its own node: the accessible
                  name trims each element child, so a trailing space inside the
                  span is dropped and the heading announces as one run-on word. */}
              <span className="font-normal text-gray-500">{occasion.family_name} &middot;</span>{" "}
              {occasion.name}
            </h1>
            {occasion.is_archived && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Archived
              </span>
            )}
          </div>
          {/* The bar itself appears for anyone who can do *something* with it,
              and carries only what they can do — a creator who is not an
              organizer gets Archive alone rather than a Rename that 403s. */}
          {(canRename || canArchive) && (
            <ActionBar
              items={[
                ...(canRename
                  ? [
                      {
                        label: "Rename",
                        onClick: () => {
                          setName(occasion.name);
                          setRenaming(true);
                        },
                        pending: renameMutation.isPending,
                      },
                    ]
                  : []),
                ...(canArchive
                  ? [
                      {
                        label: occasion.is_archived ? "Unarchive" : "Archive",
                        onClick: handleArchiveToggle,
                        pending: setArchivedMutation.isPending,
                        pendingLabel: occasion.is_archived ? "Unarchiving…" : "Archiving…",
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

      <ConfirmDialog
        open={confirmingArchive}
        title="Archive this occasion?"
        body={ARCHIVE_OCCASION_BODY}
        actions={ARCHIVE_ACTIONS}
        onResolve={(id) => {
          if (id === "archive") setArchivedMutation.mutate(true);
          setConfirmingArchive(false);
        }}
      />
    </div>
  );
}

/**
 * Every list shared to this occasion that the viewer can see, and the control
 * that adds one of the viewer's own.
 *
 * The control is here in **both** states (NEU-1308, decision 4). With no lists
 * the empty state's body *is* the button — the page whose whole purpose is
 * collecting lists used to say "No lists are shared to this occasion yet." and
 * offer nothing. With lists it sits above the rows, which is story NEU-1304's
 * second criterion.
 *
 * It is not organizer-gated, and deliberately: sharing your own list into an
 * occasion was never an organizer power, and the `OwnedList` gate behind the
 * write is the same one that always enforced it.
 */
function ListsTab({ occasion, onShare }: { occasion: Occasion; onShare: () => void }) {
  const { user } = useAuth();

  const lists = useQuery({
    queryKey: ["occasion-lists", occasion.id],
    queryFn: () => getOccasionLists(occasion.id),
  });

  if (lists.isPending) return <Spinner />;
  if (lists.isError) return <p className="text-sm text-red-600">Couldn&apos;t load lists.</p>;
  if (lists.data.length === 0) {
    return <ShareIntoOccasionButton isArchived={occasion.is_archived} onOpen={onShare} />;
  }

  return (
    <div className="space-y-3">
      <ShareIntoOccasionButton isArchived={occasion.is_archived} onOpen={onShare} />
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {lists.data.map((list) => (
          <li key={list.id}>
            <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
              <p className="font-medium text-gray-900">{list.name}</p>
              {/* The viewer's own list reads as their own row does elsewhere —
                  "from Tom" on your own list would be nonsense. Every other list
                  reached this page through this occasion, so the row names the
                  person it came from rather than repeating the family overhead. */}
              {list.owner_id === user?.id ? (
                <RecipientLine list={list} />
              ) : (
                <ListAttributionLine list={list} />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
