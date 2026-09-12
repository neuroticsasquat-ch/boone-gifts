import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getLists, shareListWithOccasion } from "../api/lists";
import { getOccasionLists } from "../api/occasions";
import { OCCASION_ARCHIVED_MID_SHARE, listsSharedHereSentence } from "../lib/sharing-summary";
import type { GiftList } from "../types";
import { SharingShell, SharingSummaryLine } from "./SharingShell";
import { EmptyGroup, Group, Hint, NoMatches, ShareRow, matchesFilter } from "./sharing-rows";

/** What a row says when the list already reaches this occasion, and where the
 *  viewer goes to undo it. Occasion mode is add-only (NEU-1308, decision 3). */
const ALREADY_SHARED = "Already shared here — change this from the list";

/**
 * Sharing **the other way round**: the occasion is fixed and the list is
 * chosen.
 *
 * Every other sharing flow in the app starts from a list — open it, open its
 * modal, find the family, pick the occasion. That left `/occasions/:id`, the
 * page ADR 0007 argued was worth reaching, saying "No lists are shared to this
 * occasion yet." and offering nothing. This is the second mode, and it is the
 * reverse of the first: the viewer's own lists are the rows, and one fixed
 * occasion is the target.
 *
 * **No new endpoint and no new authorization.** Each tick is a
 * `PUT /lists/{list_id}/occasions/{occasion_id}`, which is `OwnedList`-gated, so
 * a member can only ever offer lists they own. That the control sits on a card
 * any member can see is consistent: sharing your own list into an occasion was
 * never an organizer power.
 *
 * Every tick is a write, landing immediately — there is no Save, and `Done`
 * only closes, exactly as `ListSharingModal` behaves.
 */
export function OccasionSharingModal({
  occasionId,
  occasionName,
  onClose,
}: {
  occasionId: number;
  occasionName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // The population. The key `/lists` already warms, so opening this dialog from
  // the landing page costs no request.
  const owned = useQuery({
    queryKey: ["lists", "owned", { archived: false }],
    queryFn: () => getLists("owned", false),
  });

  // The other half of the ticked set. There is no field to read it off:
  // `shared_via` is empty on every list the caller owns, on purpose — both arms
  // of the backend's union exclude the caller's own lists, because a route query
  // about one is a question whose answer is already known. So the occasion's own
  // lists answer it, under the key the Lists tab already warms.
  const here = useQuery({
    queryKey: ["occasion-lists", occasionId],
    queryFn: () => getOccasionLists(occasionId),
  });

  const sharedIds = new Set((here.data ?? []).map((list) => list.id));
  const rows = owned.data ?? [];
  // The viewer's **own** lists that already reach here — never the occasion's
  // total, which counts other people's and would answer a different question
  // from the checkboxes below it.
  const sharedCount = rows.filter((list) => sharedIds.has(list.id)).length;

  // Four keys, mirroring `ListSharingModal.invalidateFamilies`, which already
  // names three of them.
  function invalidate(listId: number) {
    // The tab the viewer may be standing on.
    queryClient.invalidateQueries({ queryKey: ["occasion-lists", occasionId] });
    // The strip's list_count and last_activity_at are both stale. The bare
    // prefix sweeps the index and the per-family entries together.
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
    // The list's own row now carries a route…
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    // …and its detail page's sharing summary.
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
  }

  const share = useMutation({
    mutationFn: (list: GiftList) => shareListWithOccasion(list.id, occasionId),
    onSuccess: (_data, list) => invalidate(list.id),
    onError: (err, list) => {
      // The only 409 on this call is an occasion archived since the dialog
      // loaded. Naming the cause beats a generic failure, which would leave the
      // viewer clicking a box that is never going to tick.
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(OCCASION_ARCHIVED_MID_SHARE);
        invalidate(list.id);
        return;
      }
      // The row stays unticked, because the read behind it is unchanged.
      toast.error(`Couldn't share "${list.name}" with ${occasionName}.`);
    },
  });

  return (
    <SharingShell
      // The occasion is named: opened from `/lists`, four cards sit side by side
      // and the dialog has to say which one it is about.
      title={`Share a list with ${occasionName}`}
      filterLabel="Filter your lists"
      summary={<SharedHereLine owned={owned} here={here} count={sharedCount} />}
      onClose={onClose}
    >
      {(filter) => (
        <ListsSection
          lists={rows}
          // A failed read on either half leaves the rows unsafe to render: an
          // empty `here` would offer a tick that changes nothing, and an empty
          // `owned` would say "you have no lists" to someone with forty.
          isLoading={owned.isLoading || here.isLoading}
          isError={owned.isError || here.isError}
          sharedIds={sharedIds}
          pending={share.isPending}
          filter={filter}
          onShare={(list) => share.mutate(list)}
        />
      )}
    </SharingShell>
  );
}

/**
 * What is ticked, in `lib/sharing-summary`'s words.
 *
 * A failed read also leaves the count at zero, and "none of your lists are
 * shared here" is far too load-bearing a sentence to say on the strength of a
 * request that never answered — the same rule `SharedWithLine` follows.
 */
function SharedHereLine({
  owned,
  here,
  count,
}: {
  owned: { isLoading: boolean; isError: boolean };
  here: { isLoading: boolean; isError: boolean };
  count: number;
}) {
  if (owned.isLoading || here.isLoading) {
    return <SharingSummaryLine>Loading your lists…</SharingSummaryLine>;
  }
  // Distinct from the section's own failure below: this line is about what is
  // already shared here, the section about the lists on offer. Saying one
  // sentence twice would read as one failure reported twice.
  if (owned.isError || here.isError) {
    return <SharingSummaryLine>Couldn&apos;t load what&apos;s shared here.</SharingSummaryLine>;
  }
  return <SharingSummaryLine>{listsSharedHereSentence(count)}</SharingSummaryLine>;
}

/**
 * The viewer's own live lists, each with the box that offers it to this
 * occasion.
 *
 * Archived lists are absent: the population is `GET /lists?filter=owned&
 * archived=false`, and an archived list is one the owner has put away —
 * offering it as something to share into a live occasion is the opposite of
 * what archiving meant.
 */
function ListsSection({
  lists,
  isLoading,
  isError,
  sharedIds,
  pending,
  filter,
  onShare,
}: {
  lists: GiftList[];
  isLoading: boolean;
  isError: boolean;
  sharedIds: Set<number>;
  pending: boolean;
  filter: string;
  onShare: (list: GiftList) => void;
}) {
  if (isLoading) {
    return (
      <Group title="Your lists">
        <Hint>Loading…</Hint>
      </Group>
    );
  }
  if (isError) {
    return (
      <Group title="Your lists">
        <p className="text-sm text-red-600">Failed to load your lists.</p>
      </Group>
    );
  }

  // Two emptinesses, said apart: someone who owns nothing needs a way to make
  // one, and someone whose query matched nothing does not.
  if (lists.length === 0) {
    return (
      <EmptyGroup title="Your lists" link="Create a list" to="/lists/new" linkAway>
        You don&apos;t have any lists yet.
      </EmptyGroup>
    );
  }

  // Names only. A list's recipient line is rendered by `ListAttribution` and is
  // not the row's identity, and this population is one the viewer named
  // themselves.
  //
  // `is_archived` is re-checked rather than left to the request that already
  // excludes it: "only live lists are offered" is a property of these rows, and
  // a row that could never be shared should not depend on a query param staying
  // right to stay absent.
  const visible = lists.filter((list) => !list.is_archived && matchesFilter(filter, list.name));
  if (visible.length === 0) {
    return (
      <Group title="Your lists">
        <NoMatches noun="lists" filter={filter} />
      </Group>
    );
  }

  return (
    <Group title="Your lists">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {visible.map((list) => {
          // Rule 6's third arm, and the one place its tick is the dead one: the
          // write here is add-only, and revoking has a home — the list's own
          // modal, which has the owner's context and the release-or-keep dialog
          // a claim needs. A row is never silently absent, because "why isn't my
          // list here?" is the question the listed-disabled-reason shape exists
          // to answer.
          const already = sharedIds.has(list.id);
          return (
            <ShareRow
              key={list.id}
              name={list.name}
              detail={already ? ALREADY_SHARED : undefined}
              checked={already}
              // No per-row spinner: a write in flight disables the section, as
              // both existing modes do through `SectionState.pending`.
              disabled={pending || already}
              toggleLabel={`Share ${list.name}`}
              onToggle={() => onShare(list)}
            />
          );
        })}
      </ul>
    </Group>
  );
}
