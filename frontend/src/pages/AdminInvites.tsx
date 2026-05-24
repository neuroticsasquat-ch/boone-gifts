import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvites, createInvite, deleteInvite } from "../api/invites";
import { useTitle } from "../hooks/useTitle";
import type { Invite } from "../types";

const STATUS_STYLES: Record<Invite["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  used: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
};

export function AdminInvites() {
  useTitle("Invites");
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const invites = useQuery({ queryKey: ["invites"], queryFn: getInvites });

  const deleteMutation = useMutation({
    mutationFn: deleteInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  function handleRevoke(id: number) {
    if (window.confirm("Revoke this invite?")) {
      deleteMutation.mutate(id);
    }
  }

  async function handleCopyLink(id: number, token: string) {
    const url = `${window.location.origin}/register?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API unavailable — ignore
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Invites</h1>

      <CreateInviteForm queryClient={queryClient} />

      <section>
        {invites.data && invites.data.length === 0 && (
          <p className="text-gray-500">No invites yet.</p>
        )}
        {invites.data && invites.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invites.data.map((invite) => (
                  <tr key={invite.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{invite.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invite.status]}`}>
                        {invite.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(invite.created_at).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm space-x-2">
                      {invite.status === "pending" && (
                        <button
                          onClick={() => handleCopyLink(invite.id, invite.token)}
                          className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          {copiedId === invite.id ? "Copied!" : "Copy link"}
                        </button>
                      )}
                      {invite.status === "pending" && (
                        <button
                          onClick={() => handleRevoke(invite.id)}
                          disabled={deleteMutation.isPending}
                          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CreateInviteForm({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: (emailVal: string) => createInvite(emailVal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setEmail("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(false);
    mutation.mutate(email);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Send an Invite</h2>
      {mutation.isError && <p className="text-sm text-red-600 mb-2">Failed to send invite.</p>}
      {success && (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded p-3 text-sm mb-2">
          Invite sent!
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Sending…" : "Send Invite"}
        </button>
      </div>
    </form>
  );
}
