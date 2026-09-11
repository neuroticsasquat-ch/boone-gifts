import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFamily, removeMember } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { BackControl, BACK_TO_PEOPLE } from "../components/BackControl";
import { MembersSection } from "./family-detail/MembersSection";
import { OccasionsSection } from "./family-detail/OccasionsSection";
import { FamilySettingsSection } from "./family-detail/FamilySettingsSection";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";

/**
 * One family, administered (occasions-and-navigation project spec §5.6, §9.5).
 *
 * Four zones in one fixed order — Members, Occasions, Family settings, Leave
 * Family — and role changes what renders, never where: an organizer who demotes
 * themselves sees the settings zone disappear rather than the page reshuffle
 * around them. Before, six sibling `h2`s interleaved member administration,
 * occasions, invites, rename and delete in one column, with an unlabelled
 * Leave button wedged in the middle of it.
 *
 * This page is **not** the way in to an occasion. The strip on /lists is
 * (NEU-1298, ADR 0007); what is left here is managing one.
 */
export function FamilyDetail() {
  const familyId = useNumericId();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [leaveError, setLeaveError] = useState<string | null>(null);

  const family = useQuery({
    queryKey: ["family", familyId],
    queryFn: () => getFamily(familyId),
  });

  useTitle(family.data?.name ?? "Family");

  const currentMember = family.data?.members.find((m) => m.user_id === user?.id);
  const isOrganizer = currentMember?.role === "organizer";

  // Same endpoint `MembersSection`'s Remove calls, with the viewer's own id and
  // no branch on whose it is — that branch is what made one mutation serving
  // both confusing, and it put the last-organizer 409 in another zone from the
  // button that provoked it.
  const leaveMutation = useMutation({
    mutationFn: (userId: number) => removeMember(familyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
      setLeaveError(null);
      navigate("/people");
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 409) {
        setLeaveError("Promote another organizer first, or delete the family.");
      } else {
        toast.error("Action failed.");
      }
    },
  });

  if (family.isPending) return <Spinner />;

  if (family.isError || !family.data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Family not found.</p>
        <BackControl fallback={BACK_TO_PEOPLE} className="mt-2 inline-block" />
      </div>
    );
  }

  const { data: f } = family;

  return (
    <div className="space-y-6">
      <BackControl fallback={BACK_TO_PEOPLE} />

      <h1 className="text-2xl font-bold text-gray-900">{f.name}</h1>

      <MembersSection
        familyId={familyId}
        members={f.members}
        currentUserId={user?.id}
        isOrganizer={isOrganizer}
      />

      {/* Any member may create; renaming and archiving are organizer-only */}
      <OccasionsSection familyId={familyId} familyName={f.name} isOrganizer={isOrganizer} />

      {isOrganizer && <FamilySettingsSection familyId={familyId} familyName={f.name} />}

      {/* Its own zone, last, outside the organizer gate: every member may leave,
          and folding this into Family settings would hide it from exactly the
          people most likely to want it. */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Leave Family</h2>
        <button
          onClick={() => leaveMutation.mutate(user!.id)}
          disabled={leaveMutation.isPending}
          className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Leave Family
        </button>
        {leaveError && <p className="mt-2 text-sm text-red-600">{leaveError}</p>}
      </section>
    </div>
  );
}
