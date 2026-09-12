import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { removeMember, updateMemberRole } from "../../api/families";
import { ConfirmDialog, type ConfirmAction } from "../../components/ConfirmDialog";
import { ActionBar } from "../../components/ActionBar";
import type { FamilyMember } from "../../types";

interface MembersSectionProps {
  familyId: number;
  familyName: string;
  members: FamilyMember[];
  currentUserId: number | undefined;
  isOrganizer: boolean;
}

const REMOVE_ACTIONS: ConfirmAction[] = [{ id: "remove", label: "Remove", tone: "danger" }];

/**
 * The family's roster, on the family page — who is in it and, for an organizer,
 * the two controls over that: promote/demote, and remove
 * (occasions-and-navigation project spec §5.6).
 *
 * It does not query. The parent already holds the family, so the members come
 * down as props; adding a second read of the same resource here would be a
 * second thing to keep in step.
 *
 * Demote and remove share one error line because they share one failure: both
 * 409 when the family would be left without an organizer. *Leaving* hits the
 * same endpoint but belongs to the page, next to its own button — the branch on
 * whose id it was is what used to make one mutation serve both.
 *
 * Remove confirms and promote/demote does not, which is the rule rather than a
 * preference about severity: removing deletes the shares that person owns into
 * the family's occasions and releases claims in both directions, and a
 * re-invite brings back neither (`CONTEXT.md` rule 11). A role change is one
 * click away from being undone.
 */
export function MembersSection({ familyId, familyName, members, currentUserId, isOrganizer }: MembersSectionProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  // The member being removed, not a boolean: the dialog names them, and the
  // section lists every member.
  const [removing, setRemoving] = useState<FamilyMember | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["family", familyId] });
    queryClient.invalidateQueries({ queryKey: ["families"] });
  };

  const onLastOrganizer = (err: unknown) => {
    if (isAxiosError(err) && err.response?.status === 409) {
      setActionError("Promote another organizer first, or delete the family.");
    } else {
      toast.error("Action failed.");
    }
  };

  // The dialog closes on *both* outcomes, unlike the connection removal it
  // otherwise follows (`People.tsx`): a last-organizer 409 cannot be retried
  // until another organizer is promoted, and that control is in this same
  // section further up the page, behind the modal. Re-arming a button that
  // cannot yet succeed buys a second identical failure.
  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeMember(familyId, userId),
    onSuccess: () => {
      invalidate();
      setActionError(null);
      setRemoving(null);
    },
    onError: (err: unknown) => {
      setRemoving(null);
      onLastOrganizer(err);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      updateMemberRole(familyId, userId, { role }),
    onSuccess: () => {
      invalidate();
      setActionError(null);
    },
    onError: onLastOrganizer,
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Members</h2>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {members.map((member) => {
          const isSelf = member.user_id === currentUserId;
          return (
            <li key={member.user_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">{member.name}</p>
                <p className="text-sm text-gray-500 capitalize">{member.role}</p>
              </div>
              {isOrganizer && !isSelf && (
                <ActionBar
                  items={[
                    {
                      label: member.role === "member" ? "Make Organizer" : "Make Member",
                      onClick: () =>
                        updateRoleMutation.mutate({
                          userId: member.user_id,
                          role: member.role === "member" ? "organizer" : "member",
                        }),
                      ariaLabel:
                        member.role === "member"
                          ? `Make Organizer ${member.name}`
                          : `Make Member ${member.name}`,
                      pending:
                        updateRoleMutation.isPending &&
                        updateRoleMutation.variables?.userId === member.user_id,
                    },
                    {
                      label: "Remove",
                      tone: "danger",
                      ariaLabel: `Remove ${member.name}`,
                      onClick: () => setRemoving(member),
                      pending: removeMutation.isPending && removeMutation.variables === member.user_id,
                      pendingLabel: "Removing…",
                    },
                  ]}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* Naming both the member and the family, following the connection
          removal's reasoning (`People.tsx`): "Remove this member?" means
          nothing on a roster reached by a mis-tap, and an organizer of several
          families arrives at all of them through the same shape of page.

          The claim sentence is conditional and bare — no count, no gift, no
          claimer, and no assertion that a claim exists (`CONTEXT.md` rule 2). */}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name} from ${familyName}?`}
        body={
          "They'll lose sight of lists shared to this family's occasions, and any gifts " +
          "claimed between you will be released. You can invite them back later."
        }
        actions={REMOVE_ACTIONS}
        pending={removeMutation.isPending}
        onResolve={(id) => {
          if (id === "remove" && removing) removeMutation.mutate(removing.user_id);
          else setRemoving(null);
        }}
      />
    </section>
  );
}
