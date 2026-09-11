import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getConnections, getConnectionLists } from "../api/connections";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { BackControl, BACK_TO_PEOPLE } from "../components/BackControl";
import { HandshakeIcon } from "../components/Icons";

export function ConnectionProfile() {
  const connectionId = useNumericId();

  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const lists = useQuery({
    queryKey: ["connection-lists", connectionId],
    queryFn: () => getConnectionLists(connectionId),
  });

  const connection = connections.data?.find((c) => c.id === connectionId);

  useTitle(connection?.user.name ?? "Connection");

  if (connections.isPending || lists.isPending) return <Spinner />;

  if (!connection) return (
    <div className="text-center py-12">
      <p className="text-red-600">Connection not found.</p>
      <BackControl fallback={BACK_TO_PEOPLE} className="mt-2 inline-block" />
    </div>
  );

  return (
    <div className="space-y-6">
      <BackControl fallback={BACK_TO_PEOPLE} />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <HandshakeIcon className="h-6 w-6" /> {connection.user.name}
        </h1>
        <p className="text-sm text-gray-500">{connection.user.email}</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Lists shared with you</h2>
        {lists.data && lists.data.length === 0 && (
          <p className="mt-3 text-gray-500">No lists shared with you yet.</p>
        )}
        {lists.data && lists.data.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {lists.data.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
                  <p className="font-medium text-gray-900">{list.name}</p>
                  {list.description && (
                    <p className="mt-0.5 text-sm text-gray-500 truncate">{list.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {list.claimed_count} of {list.gift_count} claimed
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
