import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { getConnectionRequests, acceptConnection, deleteConnection } from "../api/connections";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { ClipboardIcon, HandshakeIcon, InboxIcon } from "../components/Icons";

export function Dashboard() {
  useTitle("Dashboard");
  const queryClient = useQueryClient();

  const ownedLists = useQuery({ queryKey: ["lists", "owned"], queryFn: () => getLists("owned") });
  const sharedLists = useQuery({ queryKey: ["lists", "shared"], queryFn: () => getLists("shared") });
  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });

  const acceptMutation = useMutation({
    mutationFn: acceptConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: () => toast.error("Failed to accept request."),
  });

  const declineMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
    },
    onError: () => toast.error("Failed to decline request."),
  });

  const anyLoading = ownedLists.isPending || sharedLists.isPending || requests.isPending;
  if (anyLoading) return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <Spinner />
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* My Lists */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><ClipboardIcon className="h-5 w-5" /> My Lists</h2>
          <Link
            to="/lists/new"
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            New List
          </Link>
        </div>
        {ownedLists.data && ownedLists.data.length === 0 && (
          <p className="mt-3 text-gray-500">
            You haven't created any lists yet.{" "}
            <Link to="/lists/new" className="text-blue-600 hover:underline">Create your first list</Link>.
          </p>
        )}
        {ownedLists.data && ownedLists.data.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {ownedLists.data.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
                  <p className="font-medium text-gray-900">{list.name}</p>
                  {list.description && (
                    <p className="mt-0.5 text-sm text-gray-500 truncate">{list.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shared with Me */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><HandshakeIcon className="h-5 w-5" /> Shared with Me</h2>
        {sharedLists.data && sharedLists.data.length === 0 && (
          <p className="mt-3 text-gray-500">
            No one has shared a list with you yet.{" "}
            <Link to="/connections" className="text-blue-600 hover:underline">Add a connection</Link> to get started.
          </p>
        )}
        {sharedLists.data && sharedLists.data.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sharedLists.data.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{list.name}</p>
                    <p className="text-sm text-gray-500">from {list.owner_name}</p>
                    <p className="text-xs text-gray-400">
                      {list.claimed_count} of {list.gift_count} claimed
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Connection requests — only shown when there are pending ones */}
      {requests.data && requests.data.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><InboxIcon className="h-5 w-5" /> Pending Connection Requests</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {requests.data.map((req) => (
              <li key={req.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{req.user.name}</p>
                  <p className="text-sm text-gray-500">{req.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptMutation.mutate(req.id)}
                    disabled={acceptMutation.isPending}
                    className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineMutation.mutate(req.id)}
                    disabled={declineMutation.isPending}
                    className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
