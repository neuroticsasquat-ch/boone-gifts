import { useQuery } from "@tanstack/react-query";
import { getConnections } from "../api/connections";
import { getFamilies } from "../api/families";
import { getOccasionIndex } from "../api/occasions";
import type { Family, OccasionSummary, ShareTargetFamily } from "../types";
import { SharingModal, type PersonRow, type SharingSelection } from "./SharingModal";

/**
 * The same sharing dialog over a list that does not exist yet — New List's
 * `Who can see this list` (NEU-1307).
 *
 * Nothing here writes: the ticks are held by the form until it submits, which
 * is the whole difference between this container and `ListSharingModal`. The
 * rows, the filter, the three-state occasion rule, the refusal and the summary
 * are the dialog's own and are not restated, so creation and editing cannot
 * drift apart.
 *
 * **Nothing arrives ticked.** A list created to hold a private idea must not be
 * visible to a family before its first gift is added, and with nothing ticked
 * the section is optional rather than something to audit before submitting.
 */
export function DraftSharingModal({
  selection,
  onChange,
  onClose,
}: {
  selection: SharingSelection;
  onChange: (next: SharingSelection) => void;
  onClose: () => void;
}) {
  // No `listId`, so `/lists/{id}/families` is unavailable and the families half
  // is adapted from two reads instead. The index is the key the /lists occasion
  // strip already warms, so arriving at New List from /lists usually costs one.
  const families = useQuery({ queryKey: ["families"], queryFn: getFamilies });
  const occasions = useQuery({
    queryKey: ["occasions", "index", { archived: false }],
    queryFn: () => getOccasionIndex(false),
  });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });

  return (
    <SharingModal
      families={{
        data: draftFamilies(families.data, occasions.data),
        isLoading: families.isLoading || occasions.isLoading,
        isError: families.isError || occasions.isError,
        pending: false,
      }}
      people={{
        // No coverage: a draft tick is not a share, so no row is disabled here
        // however many families are ticked. Rule 6's disable is defined on a
        // live occasion share — nobody is covered until the list exists, and a
        // row going dead and live again under the cursor as families are
        // ticked mid-form would be worse than no nudge at all.
        data: (connections.data ?? []).map(
          (c): PersonRow => ({ userId: c.user.id, name: c.user.name, email: c.user.email }),
        ),
        isLoading: connections.isLoading,
        isError: connections.isError,
        pending: false,
      }}
      // Held in the form, so it is a fact from the first render: a list being
      // created reaches nobody until it says otherwise, and no read can change
      // that sentence into a lie.
      selection={{ data: selection, isLoading: false, isError: false }}
      onFamilyToggled={(family, next) => {
        const familyOccasions = { ...selection.familyOccasions };
        if (next === null) delete familyOccasions[family.id];
        else familyOccasions[family.id] = next;
        onChange({ ...selection, familyOccasions });
      }}
      onPersonToggled={(userId, next) =>
        onChange({
          ...selection,
          userIds: next
            ? [...selection.userIds, userId]
            : selection.userIds.filter((id) => id !== userId),
        })
      }
      // Nothing on the create form may silently discard a half-typed list, so
      // an empty section states the fact without offering the way out of it.
      // People is one tap away in the nav a moment later.
      linkAway={false}
      onClose={onClose}
    />
  );
}

/**
 * The families a draft can be shared to, from the two reads that can answer
 * without a list: every family the caller belongs to, each carrying its
 * non-archived occasions.
 *
 * `shared` is `false` throughout and `is_archived` always `false` — a list
 * being created can be shared to neither an occasion it already reaches nor an
 * archived one, so the index excluding archived occasions is exactly right.
 * `member_ids` is empty and honest: the draft has no members to report, and its
 * one consumer — the coverage disable — is inert while creating.
 */
function draftFamilies(
  families: Family[] | undefined,
  occasions: OccasionSummary[] | undefined,
): ShareTargetFamily[] | undefined {
  if (families === undefined || occasions === undefined) return undefined;
  return families.map((family) => ({
    id: family.id,
    name: family.name,
    member_ids: [],
    occasions: occasions
      .filter((occasion) => occasion.family_id === family.id)
      .map((occasion) => ({
        id: occasion.id,
        name: occasion.name,
        is_archived: false,
        shared: false,
      })),
  }));
}
