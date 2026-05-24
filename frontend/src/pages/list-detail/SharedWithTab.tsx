import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getShares, createShare, deleteShare, getSharedUsers } from "../../api/shares";
import { getConnections } from "../../api/connections";
import toast from "react-hot-toast";

interface SharedWithTabProps {
  listId: number;
  isOwner: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}

export function SharedWithTab({ listId, isOwner, queryClient }: SharedWithTabProps) {
  if (isOwner) {
    return <OwnerSharing listId={listId} queryClient={queryClient} />;
  }
  return <ViewerSharing listId={listId} />;
}

// --- Owner: full sharing management ---

function OwnerSharing({
  listId,
  queryClient,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");

  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });

  const addShareMutation = useMutation({
    mutationFn: (userId: number) => createShare(listId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", listId] });
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setSelectedUserId("");
    },
    onError: () => toast.error("Failed to share list."),
  });

  const removeShareMutation = useMutation({
    mutationFn: (userId: number) => deleteShare(listId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", listId] });
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => toast.error("Failed to remove share."),
  });

  const sharedUserIds = new Set((shares.data ?? []).map((s) => s.user_id));
  const availableConnections = (connections.data ?? []).filter((c) => !sharedUserIds.has(c.user.id));
  const hasShares = (shares.data ?? []).length > 0;
  const hasAvailable = availableConnections.length > 0;

  // Build a lookup from user_id to connection user info for displaying share names
  const connectionsByUserId = new Map((connections.data ?? []).map((c) => [c.user.id, c.user]));

  function handleAddShare(e: FormEvent) {
    e.preventDefault();
    if (selectedUserId) {
      addShareMutation.mutate(Number(selectedUserId));
    }
  }

  if (!hasShares && !hasAvailable) {
    return <p className="text-sm text-gray-500">No connections to share with. Add connections first.</p>;
  }

  return (
    <div className="space-y-3">
      {hasAvailable && (
        <form onSubmit={handleAddShare} className="rounded-lg bg-white p-4 shadow">
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Share with…</option>
              {availableConnections.map((conn) => (
                <option key={conn.user.id} value={conn.user.id}>
                  {conn.user.name} ({conn.user.email})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={addShareMutation.isPending || !selectedUserId}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addShareMutation.isPending ? "Sharing…" : "Share"}
            </button>
          </div>
        </form>
      )}

      {shares.data && shares.data.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {shares.data.map((share) => {
            const user = connectionsByUserId.get(share.user_id);
            return (
              <li key={share.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{user?.name ?? `User ${share.user_id}`}</p>
                  {user?.email && <p className="text-sm text-gray-500">{user.email}</p>}
                </div>
                <button
                  onClick={() => removeShareMutation.mutate(share.user_id)}
                  disabled={removeShareMutation.isPending}
                  className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- Viewer: read-only shared users list ---

function ViewerSharing({ listId }: { listId: number }) {
  const sharedUsers = useQuery({
    queryKey: ["shared-users", listId],
    queryFn: () => getSharedUsers(listId),
  });

  if (sharedUsers.isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (sharedUsers.error) {
    return <p className="text-sm text-red-600">Failed to load shared users.</p>;
  }

  if (!sharedUsers.data || sharedUsers.data.length === 0) {
    return <p className="text-sm text-gray-500">This list hasn't been shared with anyone else.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {sharedUsers.data.map((user) => (
        <li key={user.id} className="px-4 py-3">
          <p className="font-medium text-gray-900">{user.name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </li>
      ))}
    </ul>
  );
}
