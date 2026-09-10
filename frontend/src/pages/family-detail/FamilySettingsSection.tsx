import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { createInvite, deleteFamily, getInvites, renameFamily, revokeInvite } from "../../api/families";
import { ConfirmDialog, type ConfirmAction } from "../../components/ConfirmDialog";

interface FamilySettingsSectionProps {
  familyId: number;
  familyName: string;
}

const DELETE_FAMILY_ACTIONS: ConfirmAction[] = [
  { id: "delete", label: "Delete Family", tone: "danger" },
];

/**
 * Administering the family itself — who is invited into it, what it is called,
 * and whether it goes on existing (occasions-and-navigation project spec §5.6).
 *
 * Organizer-only, and the gate is the parent's: the page mounts this zone only
 * for an organizer, so the invites query carries no `enabled:` guard of its own.
 * The gate moved up a level rather than disappearing.
 *
 * Its four concerns are `h3`s under one `h2` because they are one thing an
 * organizer does, not four peers of Members and Occasions — six sibling
 * headings is what "one long column" looked like as a document outline. It
 * collects at the bottom of the page, where a destructive action belongs and
 * where it stops separating two zones a plain member uses.
 */
export function FamilySettingsSection({ familyId, familyName }: FamilySettingsSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invites = useQuery({
    queryKey: ["family-invites", familyId],
    queryFn: () => getInvites(familyId),
  });

  const invalidateInvites = () => {
    queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
  };

  const sendInviteMutation = useMutation({
    mutationFn: (invite: { email: string; role: string }) => createInvite(familyId, invite),
    onSuccess: () => {
      invalidateInvites();
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
    onSuccess: invalidateInvites,
    onError: () => {
      toast.error("Failed to revoke invite.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameFamily(familyId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["families"] });
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

  function handleSendInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError(null);
    sendInviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  }

  function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!renameValue.trim()) return;
    renameMutation.mutate(renameValue.trim());
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Family settings</h2>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Invite to Family</h3>
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
      </div>

      {invites.data && invites.data.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Invites</h3>
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
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Rename Family</h3>
        <form onSubmit={handleRename} className="flex gap-2">
          <input
            type="text"
            placeholder={familyName}
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
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Delete Family</h3>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Delete Family
        </button>
        {/* Stays open with every button disabled while the delete is in
            flight, as the two-step it replaces did. Success navigates away
            and `onError` closes it, so only Cancel closes it from here. */}
        <ConfirmDialog
          open={confirmDelete}
          title="Delete Family?"
          body="This cannot be undone."
          actions={DELETE_FAMILY_ACTIONS}
          pending={deleteMutation.isPending}
          onResolve={(id) => {
            if (id === "delete") deleteMutation.mutate();
            else setConfirmDelete(false);
          }}
        />
      </div>
    </section>
  );
}
