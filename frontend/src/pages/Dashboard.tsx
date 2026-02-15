import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { getConnectionRequests, acceptConnection, deleteConnection } from "../api/connections";
import { getCollections } from "../api/collections";

function SummaryCard({ title, count, to }: { title: string; count: number | undefined; to: string }) {
  return (
    <Link to={to} className="block rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{count ?? "—"}</p>
    </Link>
  );
}

export function Dashboard() {
  const queryClient = useQueryClient();

  const ownedLists = useQuery({ queryKey: ["lists", "owned"], queryFn: () => getLists("owned") });
  const sharedLists = useQuery({ queryKey: ["lists", "shared"], queryFn: () => getLists("shared") });
  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });
  const collections = useQuery({ queryKey: ["collections"], queryFn: getCollections });

  const acceptMutation = useMutation({
    mutationFn: acceptConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
    },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard title="My Lists" count={ownedLists.data?.length} to="/lists" />
        <SummaryCard title="Connection Requests" count={requests.data?.length} to="/connections" />
        <SummaryCard title="Collections" count={collections.data?.length} to="/collections" />
      </div>

      {/* Connection requests */}
      {requests.data && requests.data.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Pending Connection Requests</h2>
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

      {/* Shared with me */}
      {sharedLists.data && sharedLists.data.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Shared with Me</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sharedLists.data.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{list.name}</p>
                    <p className="text-sm text-gray-500">from {list.owner_name}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
