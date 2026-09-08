import { useState, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFamily, renameFamily, deleteFamily, removeMember, updateMemberRole, createInvite, getInvites, revokeInvite } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";

export function FamilyDetail() {
  const { id } = useParams();
  const familyId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const family = useQuery({
    queryKey: ["family", familyId],
    queryFn: () => getFamily(familyId),
    enabled: Number.isFinite(familyId),
  });

  useTitle(family.data?.name ?? "Family");

  const currentMember = family.data?.members.find((m) => m.user_id === user?.id);
  const isOrganizer = currentMember?.role === "organizer";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["family", familyId] });
    queryClient.invalidateQueries({ queryKey: ["families"] });
  };

  const invites = useQuery({
    queryKey: ["family-invites", familyId],
    queryFn: () => getInvites(familyId),
    enabled: isOrganizer && Number.isFinite(familyId),
  });

  const sendInviteMutation = useMutation({
    mutationFn: (invite: { email: string; role: string }) =>
      createInvite(familyId, invite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
      setInviteEmail("");
      setInviteRole("member");
      setInviteError(null);
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 409) {
        setInviteError("A pending invite for that email already exists.");
      } else if (isAxiosError(err) && err.response?.status === 400) {
        setInviteError(err.response.data?.detail ?? "Invalid email address.");
      } else {
        toast.error("Failed to send invite.");
      }
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: number) => revokeInvite(familyId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
    },
    onError: () => {
      toast.error("Failed to revoke invite.");
    },
  });

  function handleSendInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError(null);
    sendInviteMutation.mutate({
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameFamily(familyId, { name }),
    onSuccess: () => {
      invalidate();
      setRenameError(null);
      setRenameValue("");
      toast.success("Family renamed.");
    },
    onError: () => {
      setRenameError("Failed to rename family.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFamily(familyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
      navigate("/people");
    },
    onError: () => {
      toast.error("Failed to delete family.");
      setConfirmDelete(false);
    },
  });

  const removeOrLeaveMutation = useMutation({
    mutationFn: (userId: number) => removeMember(familyId, userId),
    onSuccess: (_data, userId) => {
      if (userId === user?.id) {
        queryClient.invalidateQueries({ queryKey: ["families"] });
        navigate("/people");
      } else {
        invalidate();
      }
      setActionError(null);
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 409) {
        setActionError("Promote another organizer first, or delete the family.");
      } else {
        toast.error("Action failed.");
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      updateMemberRole(familyId, userId, { role }),
    onSuccess: () => {
      invalidate();
      setActionError(null);
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 409) {
        setActionError("Promote another organizer first, or delete the family.");
      } else {
        toast.error("Action failed.");
      }
    },
  });

  function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!renameValue.trim()) return;
    renameMutation.mutate(renameValue.trim());
  }

  if (family.isPending) return <Spinner />;

  if (family.isError || !family.data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Family not found.</p>
        <Link to="/people" className="mt-2 text-sm text-blue-600 hover:underline">
          Back to families
        </Link>
      </div>
    );
  }

  const { data: f } = family;

  return (
    <div className="space-y-6">
      <Link to="/people" className="text-sm text-blue-600 hover:underline">
        &larr; Back to families
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">{f.name}</h1>

      {/* Members list */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Members</h2>

        {actionError && (
          <p className="mb-3 text-sm text-red-600">{actionError}</p>
        )}

        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {f.members.map((member) => {
            const isSelf = member.user_id === user?.id;
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
                      onClick={() => removeOrLeaveMutation.mutate(member.user_id)}
                      disabled={removeOrLeaveMutation.isPending}
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

      {/* Leave family */}
      <section>
        <button
          onClick={() => removeOrLeaveMutation.mutate(user!.id)}
          disabled={removeOrLeaveMutation.isPending}
          className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Leave Family
        </button>
      </section>

      {/* Organizer-only controls */}
      {isOrganizer && (
        <>
          {/* Invite by email */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Invite to Family</h2>
            <form onSubmit={handleSendInvite}>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <label className="sr-only" htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-2 text-sm text-gray-700"
                >
                  <option value="member">Member</option>
                  <option value="organizer">Organizer</option>
                </select>
                <button
                  type="submit"
                  disabled={sendInviteMutation.isPending}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Send Invite
                </button>
              </div>
            </form>
            {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
          </section>

          {/* Pending invites list */}
          {invites.data && invites.data.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Invites</h2>
              <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
                {invites.data.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{invite.email}</p>
                      <p className="text-sm text-gray-500">
                        <span className="capitalize">{invite.status}</span>
                        {` · ${invite.role === "organizer" ? "Organizer" : "Member"}`}
                      </p>
                    </div>
                    {invite.status === "pending" && (
                      <button
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                        disabled={revokeInviteMutation.isPending}
                        className="rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Rename */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Rename Family</h2>
            <form onSubmit={handleRename} className="flex gap-2">
              <input
                type="text"
                placeholder={f.name}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={renameMutation.isPending}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Rename
              </button>
            </form>
            {renameError && <p className="mt-2 text-sm text-red-600">{renameError}</p>}
          </section>

          {/* Delete */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Delete Family</h2>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete Family
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-700">Are you sure? This cannot be undone.</p>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
