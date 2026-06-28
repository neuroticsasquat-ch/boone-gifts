import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { getFamily, createInvite, getInvites, revokeInvite } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { Spinner } from "../components/Spinner";
import type { FamilyDetail as FamilyDetailType, FamilyInvite } from "../types";

export function FamilyDetail() {
  const { id } = useParams();
  const familyId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: family,
    isLoading,
    error,
    refetch,
  } = useQuery<FamilyDetailType>({
    queryKey: ["family", familyId],
    queryFn: () => getFamily(familyId),
    enabled: !!id,
  });

  if (isLoading) return <Spinner />;
  if (error || !family) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load family.</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const isOrganizer = family.members.some(
    (m) => m.user_id === user?.id && m.role === "organizer",
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{family.name}</h1>

      {isOrganizer && (
        <div className="space-y-6">
          <InviteForm familyId={familyId} queryClient={queryClient} />
          <PendingInvites familyId={familyId} queryClient={queryClient} />
        </div>
      )}
    </div>
  );
}

function InviteForm({
  familyId,
  queryClient,
}: {
  familyId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState("");

  const inviteMutation = useMutation({
    mutationFn: (emailVal: string) => createInvite(familyId, { email: emailVal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
      setEmail("");
      setInviteError("");
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 409) {
          setInviteError("An invite for this email is already pending.");
        } else if (status === 400) {
          setInviteError(err.response?.data?.detail ?? "Invalid request.");
        } else {
          setInviteError("Failed to send invite.");
        }
      } else {
        setInviteError("Failed to send invite.");
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInviteError("");
    inviteMutation.mutate(email);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Invite by Email</h2>
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={inviteMutation.isPending || !email}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {inviteMutation.isPending ? "Sending…" : "Send Invite"}
        </button>
      </div>
      {inviteError && (
        <p className="mt-2 text-sm text-red-600">{inviteError}</p>
      )}
    </form>
  );
}

function PendingInvites({
  familyId,
  queryClient,
}: {
  familyId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [revokeErrors, setRevokeErrors] = useState<Record<number, string>>({});
  const [pendingRevokes, setPendingRevokes] = useState<Set<number>>(new Set());

  const { data: invites = [], isLoading, error } = useQuery<FamilyInvite[]>({
    queryKey: ["family-invites", familyId],
    queryFn: () => getInvites(familyId),
  });

  const revokeMutation = useMutation({
    onMutate: (inviteId: number) => {
      setPendingRevokes((prev) => new Set(prev).add(inviteId));
    },
    mutationFn: (inviteId: number) => revokeInvite(familyId, inviteId),
    onSuccess: (_data, inviteId) => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
      setRevokeErrors((prev) => {
        const next = { ...prev };
        delete next[inviteId];
        return next;
      });
    },
    onError: (_err, inviteId) => {
      setRevokeErrors((prev) => ({ ...prev, [inviteId]: "Failed to revoke invite." }));
    },
    onSettled: (_data, _err, inviteId) => {
      setPendingRevokes((prev) => {
        const s = new Set(prev);
        s.delete(inviteId);
        return s;
      });
    },
  });

  if (isLoading) return <Spinner />;
  if (error) return <p className="text-red-600">Failed to load invites.</p>;
  if (invites.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Invites</h2>
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {invites.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-gray-900">{invite.email}</p>
              <p className="text-sm text-gray-500 capitalize">{invite.status}</p>
              {revokeErrors[invite.id] && (
                <p className="text-sm text-red-600">{revokeErrors[invite.id]}</p>
              )}
            </div>
            {invite.status === "pending" && (
              <button
                onClick={() => revokeMutation.mutate(invite.id)}
                disabled={pendingRevokes.has(invite.id)}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
