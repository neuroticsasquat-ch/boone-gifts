import { useState } from "react";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getShares, createShare, deleteShare } from "../api/shares";
import { getConnections } from "../api/connections";
import { getShareTargets, shareListWithOccasion, unshareListFromOccasion } from "../api/lists";
import type { Connection, ListShare, ShareTargetFamily } from "../types";
import { ConfirmDialog, type ConfirmAction } from "./ConfirmDialog";
import { SharingModal, type PersonRow, type SharingSelection } from "./SharingModal";

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * The sharing dialog over a list that exists: the reads behind its rows, the
 * writes each tick makes, and the revoke confirmation one of them can raise.
 *
 * Every tick is a write, landing immediately — there is no Save, and `Done`
 * only closes. The selection is therefore server state, derived from the same
 * two reads the rows come from, so an untick repaints off its own invalidation
 * rather than off anything held here.
 *
 * Owner-only: it is opened by the header's Change control. The backend is still
 * the gate; this writes through `/lists/{id}/shares` for people and
 * `/lists/{id}/occasions/{occasion_id}` for families.
 */
export function ListSharingModal({
  listId,
  queryClient,
  onClose,
}: {
  listId: number;
  queryClient: QueryClient;
  onClose: () => void;
}) {
  // The reads are lifted: the filter spans both sections and the summary needs
  // both halves, so one source beats three components re-deriving "what is this
  // list shared to".
  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const targets = useQuery({
    queryKey: ["share-targets", listId],
    queryFn: () => getShareTargets(listId),
  });

  const [pendingRevoke, setPendingRevoke] = useState<{
    familyName: string;
    occasionId: number;
  } | null>(null);

  function invalidatePeople() {
    queryClient.invalidateQueries({ queryKey: ["shares", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  }

  function invalidateFamilies() {
    queryClient.invalidateQueries({ queryKey: ["share-targets", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    // Sharing a list into an occasion moves that occasion's list_count and its
    // last_activity_at, so the /lists strip is stale the moment this returns.
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
  }

  const sharePerson = useMutation({
    mutationFn: (userId: number) => createShare(listId, userId),
    onSuccess: invalidatePeople,
    onError: () => toast.error("Failed to share list."),
  });

  const unsharePerson = useMutation({
    mutationFn: (userId: number) => deleteShare(listId, userId),
    onSuccess: invalidatePeople,
    onError: () => toast.error("Failed to stop sharing with this person."),
  });

  const shareFamily = useMutation({
    mutationFn: (occasionId: number) => shareListWithOccasion(listId, occasionId),
    onSuccess: invalidateFamilies,
    onError: (err) => {
      // The only 409 on this call is an occasion archived since the modal
      // loaded. The generic failure toast would leave the owner clicking a box
      // that is never going to tick, so name the cause and the way out — and
      // refetch, because the row is now showing a stale occasion.
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(
          "That occasion has been archived, so it can't be shared to. Pick another, or ask an organizer to unarchive it.",
        );
        invalidateFamilies();
        return;
      }
      toast.error("Failed to share list with this occasion.");
    },
  });

  const unshareFamily = useMutation({
    mutationFn: (vars: { occasionId: number; familyName: string; claims?: "release" | "keep" }) =>
      unshareListFromOccasion(listId, vars.occasionId, vars.claims),
    onSuccess: () => {
      setPendingRevoke(null);
      invalidateFamilies();
    },
    onError: (err, vars) => {
      // A 409 means only one thing here: members of that family hold claims that
      // revoking would orphan. Ask the owner what to do with them.
      if (isAxiosError(err) && err.response?.status === 409 && !vars.claims) {
        setPendingRevoke({ familyName: vars.familyName, occasionId: vars.occasionId });
        return;
      }
      toast.error("Failed to stop sharing with this family.");
    },
  });

  const selection = liveSelection(targets.data, shares.data);

  return (
    <>
      <SharingModal
        families={{
          data: targets.data,
          isLoading: targets.isLoading,
          isError: targets.isError,
          pending: shareFamily.isPending || unshareFamily.isPending,
        }}
        people={{
          data: peopleRows(connections.data, shares.data, targets.data),
          // The families read gates the People rows too: a row that arrives
          // interactive and turns disabled a moment later is disabled at
          // precisely the moment an owner clicks.
          isLoading: shares.isLoading || connections.isLoading || targets.isLoading,
          isError: shares.isError || connections.isError,
          pending: sharePerson.isPending || unsharePerson.isPending,
        }}
        selection={{
          data: selection,
          isLoading: shares.isLoading || targets.isLoading,
          isError: shares.isError || targets.isError,
        }}
        onFamilyToggled={(family, next) => {
          if (next !== null) {
            shareFamily.mutate(next);
            return;
          }
          const occasionId = selection.familyOccasions[family.id];
          if (occasionId !== undefined) {
            unshareFamily.mutate({ occasionId, familyName: family.name });
          }
        }}
        onPersonToggled={(userId, next) =>
          next ? sharePerson.mutate(userId) : unsharePerson.mutate(userId)
        }
        linkAway
        onClose={onClose}
      />

      {/* Stacked over the sharing modal rather than replacing its body: the
          owner keeps their place and their filter text mid-decision, and
          reopening would cost a second history entry. `Modal`'s topmost-only
          rule is what makes two of them at once behave. */}
      {pendingRevoke && (
        <RevokeClaimsDialog
          familyName={pendingRevoke.familyName}
          pending={unshareFamily.isPending}
          onCancel={() => setPendingRevoke(null)}
          onChoose={(claims) =>
            unshareFamily.mutate({
              occasionId: pendingRevoke.occasionId,
              familyName: pendingRevoke.familyName,
              claims,
            })
          }
        />
      )}
    </>
  );
}

/**
 * What the list already reaches, as the dialog's ticked boxes.
 *
 * One row shares to one occasion, so the first shared occasion is the only
 * share that row can have made. A second one is unreachable from here; were the
 * API used to add one, the row simply stays ticked on the next occasion after
 * this is switched off.
 */
function liveSelection(
  families: ShareTargetFamily[] | undefined,
  shares: ListShare[] | undefined,
): SharingSelection {
  const familyOccasions: Record<number, number> = {};
  for (const family of families ?? []) {
    const shared = family.occasions.find((occasion) => occasion.shared);
    if (shared) familyOccasions[family.id] = shared.id;
  }
  return { familyOccasions, userIds: (shares ?? []).map((share) => share.user_id) };
}

/**
 * Every connection, plus anyone still holding a share who is no longer a
 * connection. Without that second half such a grant would be readable in the
 * header summary — which falls back to the same "User 42" — while this modal,
 * the only revoke surface there is, offered no row to switch it off.
 */
function peopleRows(
  connections: Connection[] | undefined,
  shares: ListShare[] | undefined,
  families: ShareTargetFamily[] | undefined,
): PersonRow[] {
  const connectionList = connections ?? [];
  const connected = new Set(connectionList.map((c) => c.user.id));
  const rows = [
    ...connectionList.map((c) => ({ userId: c.user.id, name: c.user.name, email: c.user.email })),
    ...(shares ?? [])
      .filter((s) => !connected.has(s.user_id))
      .map((s) => ({ userId: s.user_id, name: `User ${s.user_id}`, email: undefined })),
  ];
  // A failed families fetch leaves this empty, which offers a grant that may be
  // redundant. That is the right way to fail: the disable is a nudge, never a
  // permission (CONTEXT.md rule 1), and the share it withholds is real.
  return rows.map((row) => ({ ...row, coveredBy: coveringFamilies(families ?? [], row.userId) }));
}

/**
 * The families whose live occasion share already puts this list in front of a
 * person — every one of them, because unticking only the first would leave the
 * row disabled and the owner none the wiser (project spec §5.2).
 *
 * "Live" is deliberately narrower than access: a share made before its occasion
 * was archived still grants sight, but that route is winding down, so a direct
 * share there is the useful offer rather than a redundant one. A disabled row
 * therefore means "the live route already covers them", not "they can already
 * see this".
 */
function coveringFamilies(families: ShareTargetFamily[], userId: number): string[] {
  return families
    .filter(
      (family) =>
        family.member_ids.includes(userId) &&
        family.occasions.some((occasion) => occasion.shared && !occasion.is_archived),
    )
    .map((family) => family.name);
}

const REVOKE_CLAIMS_ACTIONS: ConfirmAction[] = [
  { id: "release", label: "Release those claims", tone: "primary" },
  { id: "keep", label: "Keep them claimed", tone: "neutral" },
];

/**
 * Owners are blind to claim state on their own lists, so this reveals only THAT
 * claims exist — never a count, a gift name, or a claimer name.
 */
function RevokeClaimsDialog({
  familyName,
  pending,
  onCancel,
  onChoose,
}: {
  familyName: string;
  pending: boolean;
  onCancel: () => void;
  onChoose: (claims: "release" | "keep") => void;
}) {
  return (
    <ConfirmDialog
      open
      title="Some gifts are claimed"
      body={`Members of ${familyName} have claimed gifts on this list. If you stop sharing, what should happen to those claims?`}
      actions={REVOKE_CLAIMS_ACTIONS}
      pending={pending}
      onResolve={(id) => {
        if (id === "release" || id === "keep") onChoose(id);
        else onCancel();
      }}
    />
  );
}
