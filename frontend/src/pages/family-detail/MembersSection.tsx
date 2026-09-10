import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { removeMember, updateMemberRole } from "../../api/families";
import type { FamilyMember } from "../../types";

interface MembersSectionProps {
  familyId: number;
  members: FamilyMember[];
  currentUserId: number | undefined;
  isOrganizer: boolean;
}

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
 */
export function MembersSection({ familyId, members, currentUserId, isOrganizer }: MembersSectionProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

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

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeMember(familyId, userId),
    onSuccess: () => {
      invalidate();
      setActionError(null);
    },
    onError: onLastOrganizer,
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateRoleMutation.mutate({
                        userId: member.user_id,
                        role: member.role === "member" ? "organizer" : "member",
                      })
                    }
                    disabled={updateRoleMutation.isPending}
                    className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                  >
                    {member.role === "member" ? "Make Organizer" : "Make Member"}
                  </button>
                  <button
                    onClick={() => removeMutation.mutate(member.user_id)}
                    disabled={removeMutation.isPending}
                    className="rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
