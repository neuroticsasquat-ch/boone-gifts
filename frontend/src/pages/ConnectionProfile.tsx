import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConnections } from "../api/connections";
import { getLists } from "../api/lists";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { BackControl, BACK_TO_PEOPLE } from "../components/BackControl";
import { HandshakeIcon } from "../components/Icons";
import { SharedRows } from "../components/SharedListRows";

/**
 * A person's page: every list that person owns which the viewer can see,
 * however it reached them.
 *
 * It asks no question of its own. `GET /connections/{id}/lists` answered
 * **direct shares only**, so a list that arrived through the Boone Family's
 * Christmas was missing from the page the row's own label linked to. The rows
 * are now a cut of the shared scope the client already holds — the same scope,
 * from the same cache entry, that `/lists` paints — so the two agree by
 * construction rather than by two implementations happening to match
 * (project spec §9.4).
 *
 * It lists no occasions. That is the family's business and belongs on the
 * occasion card; this page stays a label's destination, not a second index —
 * which is also why person headings lead nowhere (ADR 0007).
 */
export function ConnectionProfile() {
  const connectionId = useNumericId();

  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  // Key and query function copied exactly from `Lists.tsx`, so arriving from
  // /lists paints from cache with no request and every mutation that already
  // invalidates `["lists"]` keeps this page fresh too. A key that differed by a
  // character would be a second copy of the same data, which is the thing this
  // page exists to stop.
  const sharedLists = useQuery({
    queryKey: ["lists", "shared", { archived: false }],
    queryFn: () => getLists("shared"),
  });

  const connection = connections.data?.find((c) => c.id === connectionId);

  // The route param is the **connection** id, not the user id — `/people/5` is
  // connection 5, whose `user.id` may be 2 — so the filter waits on the
  // connection, which the page already waits on to render a name at all.
  //
  // Membership is keyed on the **owner**, not on a direct route: a direct
  // route's person *is* the list's owner (`lib/attribution.ts` resolves the
  // direct arm on exactly that), so ownership is the wider key, and the wider
  // key is what makes the occasion-reached list appear. Group by → Person
  // stays direct-keyed and the two deliberately differ — this page is the
  // wider of the two (CONTEXT.md rule 3).
  const ownerId = connection?.user.id;
  const lists = useMemo(
    () => (sharedLists.data ?? []).filter((list) => list.owner_id === ownerId),
    [sharedLists.data, ownerId],
  );

  useTitle(connection?.user.name ?? "Connection");

  if (connections.isPending || sharedLists.isPending) return <Spinner />;

  // A connection the viewer is not party to has no page to put an error on, so
  // this arm still takes precedence over anything about lists (CONTEXT.md rule 7).
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
        {/* A failed read is not an empty person. "No lists shared with you yet."
            is a claim about *that person*, and may only be made on data that
            arrived — derived from a scope that can fail, the old silence would
            have become the empty state, stating as fact about them what is
            really a fact about the network (CONTEXT.md rule 7, one layer
            down).

            `&& !data` is what keeps that from overcorrecting. This page paints
            from the cache entry `/lists` fills, so a *background refetch*
            failure arrives with good rows already in hand; blanking them for an
            error would make this page disagree with `/lists`, which goes on
            showing the same rows from the same entry. The error only speaks
            when there is nothing else to say. */}
        {sharedLists.isError && !sharedLists.data ? (
          <p className="mt-3 text-red-600">Couldn't load these lists.</p>
        ) : lists.length === 0 ? (
          <p className="mt-3 text-gray-500">No lists shared with you yet.</p>
        ) : (
          <SharedRows lists={lists} />
        )}
      </section>
    </div>
  );
}
