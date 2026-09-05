import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import {
  getListFamilies,
  shareListWithFamily,
  unshareListFromFamily,
} from "../../api/lists";
import { useAuth } from "../../hooks/useAuth";
import type { ListFamilyShareState } from "../../types";

interface FamiliesTabProps {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

/**
 * Per-family sharing for a list the current user owns.
 *
 * Unlike "Shared with", this tab stays visible in simple mode — a simple-mode
 * user can own a list created in full mode and deliberately left unshared, so
 * the tab must show the real state rather than assert "shared with your
 * families". The toggles themselves are full-mode only; the backend is the gate.
 */
export function FamiliesTab({ listId, queryClient }: FamiliesTabProps) {
  const { user } = useAuth();
  const readOnly = !!user?.simple_mode;
  const [pendingRevoke, setPendingRevoke] = useState<ListFamilyShareState | null>(null);

  const families = useQuery({
    queryKey: ["list-families", listId],
    queryFn: () => getListFamilies(listId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["list-families", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    queryClient.invalidateQueries({ queryKey: ["lists", "family"] });
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

  if (families.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (families.error) return <p className="text-sm text-red-600">Failed to load families.</p>;

  const data = families.data ?? [];
  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        You don't belong to any families yet.{" "}
        {!readOnly && <Link to="/families" className="text-blue-600 hover:underline">Manage families</Link>}
      </p>
    );
  }

  const pending = unshareMutation.isPending || shareMutation.isPending;

  return (
    <div className="space-y-3">
      {readOnly ? (
        <p className="text-sm text-gray-500">
          Family sharing for this list is shown below. To change it, switch to full
          mode in{" "}
          <Link to="/account" className="text-blue-600 hover:underline">
            Account settings
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-gray-500">Choose which families can see this list:</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {data.map((family) => (
          <li key={family.id} className="flex items-center justify-between px-4 py-3">
            <span className="font-medium text-gray-900">{family.name}</span>
            {readOnly ? (
              <span className="text-sm text-gray-500">
                {family.shared ? "Shared" : "Not shared"}
              </span>
            ) : (
              <label className="flex items-center gap-2">
                <span className="sr-only">Share with {family.name}</span>
                <input
                  type="checkbox"
                  checked={family.shared}
                  disabled={pending}
                  onChange={() =>
                    family.shared
                      ? unshareMutation.mutate({ familyId: family.id })
                      : shareMutation.mutate(family.id)
                  }
                  className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
                />
              </label>
            )}
          </li>
        ))}
      </ul>

      {pendingRevoke && (
        <RevokeClaimsDialog
          familyName={pendingRevoke.name}
          pending={unshareMutation.isPending}
          onCancel={() => setPendingRevoke(null)}
          onChoose={(claims) =>
            unshareMutation.mutate({ familyId: pendingRevoke.id, claims })
          }
        />
      )}
    </div>
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
