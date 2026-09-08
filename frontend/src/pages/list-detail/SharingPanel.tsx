import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getShares, createShare, deleteShare } from "../../api/shares";
import { getConnections } from "../../api/connections";
import {
  getListFamilies,
  shareListWithFamily,
  unshareListFromFamily,
} from "../../api/lists";
import type { ListFamilyShareState } from "../../types";

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * The one place an owner says who can see a list — people and families in the
 * same panel, replacing the retired "Shared with" and "Families" tabs.
 *
 * Owner-only: it is opened by the header's Change control. The backend is still
 * the gate; this panel writes through the existing `/lists/{id}/shares` and
 * `/lists/{id}/families/{family_id}` endpoints.
 */
export function SharingPanel({
  listId,
  queryClient,
  onClose,
}: {
  listId: number;
  queryClient: QueryClient;
  onClose: () => void;
}) {
  return (
    <section aria-label="Who can see this list" className="space-y-4 rounded-lg bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Who can see this list</h2>
        <button onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Done
        </button>
      </div>
      {/* People first, then families — the same order the header summary reads in. */}
      <PeopleGroup listId={listId} queryClient={queryClient} />
      <FamiliesGroup listId={listId} queryClient={queryClient} />
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

/** One row: a name, optional detail line, and the checkbox that grants access. */
function ShareRow({
  name,
  detail,
  checked,
  disabled,
  onToggle,
}: {
  name: string;
  detail?: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">{name}</p>
        {detail && <p className="text-sm text-gray-500">{detail}</p>}
      </div>
      <label className="flex items-center gap-2">
        <span className="sr-only">Share with {name}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
        />
      </label>
    </li>
  );
}

// --- People ---

function PeopleGroup({ listId, queryClient }: { listId: number; queryClient: QueryClient }) {
  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["shares", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  }

  const shareMutation = useMutation({
    mutationFn: (userId: number) => createShare(listId, userId),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to share list."),
  });

  const unshareMutation = useMutation({
    mutationFn: (userId: number) => deleteShare(listId, userId),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to stop sharing with this person."),
  });

  if (shares.isLoading || connections.isLoading) {
    return <Group title="People"><Hint>Loading…</Hint></Group>;
  }
  if (shares.error || connections.error) {
    return (
      <Group title="People">
        <p className="text-sm text-red-600">Failed to load people.</p>
      </Group>
    );
  }

  const connectionList = connections.data ?? [];
  const shareList = shares.data ?? [];
  const connected = new Set(connectionList.map((c) => c.user.id));

  // Every connection, plus anyone still holding a share who is no longer a
  // connection. Without that second half such a grant would be readable in the
  // header summary — which falls back to the same "User 42" — while this panel,
  // the only revoke surface there is, offered no row to switch it off.
  const rows = [
    ...connectionList.map((c) => ({ userId: c.user.id, name: c.user.name, detail: c.user.email })),
    ...shareList
      .filter((s) => !connected.has(s.user_id))
      .map((s) => ({ userId: s.user_id, name: `User ${s.user_id}`, detail: undefined })),
  ];

  if (rows.length === 0) {
    return (
      <Group title="People">
        <Hint>
          You don't have any connections yet.{" "}
          <Link to="/people" className="text-blue-600 hover:underline">Add a connection</Link>
        </Hint>
      </Group>
    );
  }

  const sharedUserIds = new Set(shareList.map((s) => s.user_id));
  const pending = shareMutation.isPending || unshareMutation.isPending;

  return (
    <Group title="People">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {rows.map((row) => {
          const shared = sharedUserIds.has(row.userId);
          return (
            <ShareRow
              key={row.userId}
              name={row.name}
              detail={row.detail}
              checked={shared}
              disabled={pending}
              onToggle={() =>
                shared ? unshareMutation.mutate(row.userId) : shareMutation.mutate(row.userId)
              }
            />
          );
        })}
      </ul>
    </Group>
  );
}

// --- Families ---

function FamiliesGroup({ listId, queryClient }: { listId: number; queryClient: QueryClient }) {
  const [pendingRevoke, setPendingRevoke] = useState<ListFamilyShareState | null>(null);

  const families = useQuery({
    queryKey: ["list-families", listId],
    queryFn: () => getListFamilies(listId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["list-families", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  }

  const shareMutation = useMutation({
    mutationFn: (familyId: number) => shareListWithFamily(listId, familyId),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to share list with family."),
  });

  const unshareMutation = useMutation({
    mutationFn: (vars: { familyId: number; claims?: "release" | "keep" }) =>
      unshareListFromFamily(listId, vars.familyId, vars.claims),
    onSuccess: () => {
      setPendingRevoke(null);
      invalidate();
    },
    onError: (err, vars) => {
      // A 409 means only one thing here: members of that family hold claims that
      // revoking would orphan. Ask the owner what to do with them.
      if (isAxiosError(err) && err.response?.status === 409 && !vars.claims) {
        const family = (families.data ?? []).find((f) => f.id === vars.familyId);
        if (family) {
          setPendingRevoke(family);
          return;
        }
      }
      toast.error("Failed to stop sharing with this family.");
    },
  });

  if (families.isLoading) {
    return <Group title="Families"><Hint>Loading…</Hint></Group>;
  }
  if (families.error) {
    return (
      <Group title="Families">
        <p className="text-sm text-red-600">Failed to load families.</p>
      </Group>
    );
  }

  const data = families.data ?? [];
  if (data.length === 0) {
    return (
      <Group title="Families">
        <Hint>
          You don't belong to any families yet.{" "}
          <Link to="/people" className="text-blue-600 hover:underline">Manage families</Link>
        </Hint>
      </Group>
    );
  }

  const pending = shareMutation.isPending || unshareMutation.isPending;

  return (
    <Group title="Families">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {data.map((family) => (
          <ShareRow
            key={family.id}
            name={family.name}
            checked={family.shared}
            disabled={pending}
            onToggle={() =>
              family.shared
                ? unshareMutation.mutate({ familyId: family.id })
                : shareMutation.mutate(family.id)
            }
          />
        ))}
      </ul>

      {pendingRevoke && (
        <RevokeClaimsDialog
          familyName={pendingRevoke.name}
          pending={unshareMutation.isPending}
          onCancel={() => setPendingRevoke(null)}
          onChoose={(claims) => unshareMutation.mutate({ familyId: pendingRevoke.id, claims })}
        />
      )}
    </Group>
  );
}

/**
 * Owners are blind to claim state on their own lists, so this reveals only THAT
 * claims exist — never a count, a gift name, or a claimer name.
 */
function RevokeClaimsDialog({
  familyName,
  pending,
  onCancel,
  onChoose,
}: {
  familyName: string;
  pending: boolean;
  onCancel: () => void;
  onChoose: (claims: "release" | "keep") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-claims-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 id="revoke-claims-title" className="text-lg font-semibold text-gray-900">
          Some gifts are claimed
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Members of {familyName} have claimed gifts on this list. If you stop
          sharing, what should happen to those claims?
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => onChoose("release")}
            disabled={pending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Release those claims
          </button>
          <button
            onClick={() => onChoose("keep")}
            disabled={pending}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            Keep them claimed
          </button>
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
