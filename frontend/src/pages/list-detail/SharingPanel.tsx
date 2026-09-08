import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getShares, createShare, deleteShare } from "../../api/shares";
import { getConnections } from "../../api/connections";
import {
  getShareTargets,
  shareListWithOccasion,
  unshareListFromOccasion,
} from "../../api/lists";
import { NO_ACTIVE_OCCASION, occasionChoice } from "../../lib/occasion-choice";
import type { ShareTargetFamily, ShareTargetOccasion } from "../../types";

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * The one place an owner says who can see a list — people and families in the
 * same panel, replacing the retired "Shared with" and "Families" tabs.
 *
 * Owner-only: it is opened by the header's Change control. The backend is still
 * the gate; this panel writes through `/lists/{id}/shares` for people and
 * `/lists/{id}/occasions/{occasion_id}` for families.
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

/**
 * The families half: one row per family the owner belongs to, ticked to share
 * this list to one of that family's occasions.
 *
 * A list is shared to an occasion, never to a family (project spec §5.1), so a
 * row's shape follows from how many active occasions its family has —
 * `occasionChoice` states that rule once, for this panel and the create form
 * both. A family with none is listed and disabled rather than hidden: "you
 * cannot share here yet, and here is why" is the whole point of the row.
 */
function FamiliesGroup({ listId, queryClient }: { listId: number; queryClient: QueryClient }) {
  const [pendingRevoke, setPendingRevoke] = useState<{
    familyName: string;
    occasionId: number;
  } | null>(null);
  // What a row's select is pointing at. Read only while the row is unticked —
  // ticking is what commits it, and after that the occasion is a fact.
  const [picked, setPicked] = useState<Record<number, number>>({});
  // Families ticked with nothing chosen. The share is refused here as well as
  // server-side, and the row says which half is missing.
  const [needsChoice, setNeedsChoice] = useState<number[]>([]);

  const targets = useQuery({
    queryKey: ["share-targets", listId],
    queryFn: () => getShareTargets(listId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["share-targets", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  }

  const shareMutation = useMutation({
    mutationFn: (occasionId: number) => shareListWithOccasion(listId, occasionId),
    onSuccess: invalidate,
    onError: (err) => {
      // The only 409 on this call is an occasion archived since the panel
      // loaded. The generic failure toast would leave the owner clicking a box
      // that is never going to tick, so name the cause and the way out — and
      // refetch, because the row is now showing a stale occasion.
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(
          "That occasion has been archived, so it can't be shared to. Pick another, or ask an organizer to unarchive it.",
        );
        invalidate();
        return;
      }
      toast.error("Failed to share list with this occasion.");
    },
  });

  const unshareMutation = useMutation({
    mutationFn: (vars: { occasionId: number; familyName: string; claims?: "release" | "keep" }) =>
      unshareListFromOccasion(listId, vars.occasionId, vars.claims),
    onSuccess: () => {
      setPendingRevoke(null);
      invalidate();
    },
    onError: (err, vars) => {
      // A 409 means only one thing here: members of that family hold claims that
      // revoking would orphan. Ask the owner what to do with them.
      if (isAxiosError(err) && err.response?.status === 409 && !vars.claims) {
        setPendingRevoke({ familyName: vars.familyName, occasionId: vars.occasionId });
        return;
      }
      toast.error("Failed to stop sharing with this family.");
    },
  });

  if (targets.isLoading) {
    return <Group title="Families"><Hint>Loading…</Hint></Group>;
  }
  if (targets.error) {
    return (
      <Group title="Families">
        <p className="text-sm text-red-600">Failed to load families.</p>
      </Group>
    );
  }

  const data = targets.data ?? [];
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

  function toggle(family: ShareTargetFamily) {
    const shared = sharedOccasionOf(family);
    if (shared) {
      unshareMutation.mutate({ occasionId: shared.id, familyName: family.name });
      return;
    }
    const choice = occasionChoice(family.occasions);
    // One occasion needs no choosing — that is what keeps the common case a
    // single click. With several, ticking before choosing is the refusal.
    const occasionId = choice.kind === "one" ? choice.occasion.id : picked[family.id];
    if (occasionId === undefined) {
      setNeedsChoice((ids) => (ids.includes(family.id) ? ids : [...ids, family.id]));
      return;
    }
    setNeedsChoice((ids) => ids.filter((id) => id !== family.id));
    shareMutation.mutate(occasionId);
  }

  return (
    <Group title="Families">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {data.map((family) => (
          <FamilyRow
            key={family.id}
            family={family}
            disabled={pending}
            pickedOccasionId={picked[family.id]}
            needsChoice={needsChoice.includes(family.id)}
            onPick={(occasionId) => {
              setPicked((current) => ({ ...current, [family.id]: occasionId }));
              setNeedsChoice((ids) => ids.filter((id) => id !== family.id));
            }}
            onToggle={() => toggle(family)}
          />
        ))}
      </ul>

      {pendingRevoke && (
        <RevokeClaimsDialog
          familyName={pendingRevoke.familyName}
          pending={unshareMutation.isPending}
          onCancel={() => setPendingRevoke(null)}
          onChoose={(claims) =>
            unshareMutation.mutate({
              occasionId: pendingRevoke.occasionId,
              familyName: pendingRevoke.familyName,
              claims,
            })
          }
        />
      )}
    </Group>
  );
}

/**
 * The occasion this list currently reaches the family through, if any.
 *
 * One row shares to one occasion, so this is the only share the row can have
 * made. A second one is unreachable from here; were the API used to add one, the
 * row simply stays ticked on the next occasion after this is switched off.
 */
function sharedOccasionOf(family: ShareTargetFamily): ShareTargetOccasion | null {
  return family.occasions.find((occasion) => occasion.shared) ?? null;
}

/** An occasion's name, saying so when it has been archived — which only ever
 *  happens to one the list is already shared to (project spec §5.4). */
function occasionLabel(occasion: ShareTargetOccasion): string {
  return occasion.is_archived ? `${occasion.name} — archived` : occasion.name;
}

/**
 * One family, and the occasion this list is shared to it through.
 *
 * A family with several occasions carries its select whether or not the list
 * already reaches it — the row keeps one shape as the box is ticked, which is
 * how project spec §5.2 draws it. Once shared the select is **disabled**: the
 * occasion is then a fact, and re-pointing a share is untick-then-tick, the only
 * order in which the claims question can be asked (§5.4). A family with a single
 * occasion names it in text instead — displayed, not offered.
 */
function FamilyRow({
  family,
  disabled,
  pickedOccasionId,
  needsChoice,
  onPick,
  onToggle,
}: {
  family: ShareTargetFamily;
  disabled: boolean;
  pickedOccasionId: number | undefined;
  needsChoice: boolean;
  onPick: (occasionId: number) => void;
  onToggle: () => void;
}) {
  const shared = sharedOccasionOf(family);
  const choice = occasionChoice(family.occasions);
  // A family with nothing active can still be unshared *from*: its occasion was
  // archived after the share was made, and archiving is not unsharing.
  const operable = shared !== null || choice.kind !== "none";

  // An occasion archived after its share was made is no longer selectable, so it
  // is put back as the value the disabled select displays — otherwise the row
  // would show a share pointing at nothing.
  const selectable = choice.kind === "many" ? choice.occasions : [];
  const options =
    shared && !selectable.some((o) => o.id === shared.id) ? [shared, ...selectable] : selectable;
  const showSelect = options.length > 1;

  const detail = showSelect
    ? null
    : shared
      ? occasionLabel(shared)
      : choice.kind === "one"
        ? choice.occasion.name
        : choice.kind === "none"
          ? NO_ACTIVE_OCCASION
          : null;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{family.name}</p>
          {detail && <p className="text-sm text-gray-500">{detail}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showSelect && (
            <select
              aria-label={`Occasion for ${family.name}`}
              value={shared ? shared.id : (pickedOccasionId ?? "")}
              disabled={disabled || shared !== null}
              onChange={(e) => e.target.value && onPick(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              {!shared && <option value="">Choose an occasion…</option>}
              {options.map((occasion) => (
                <option key={occasion.id} value={occasion.id}>
                  {occasionLabel(occasion)}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2">
            <span className="sr-only">Share with {family.name}</span>
            <input
              type="checkbox"
              checked={shared !== null}
              disabled={disabled || !operable}
              onChange={onToggle}
              className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
            />
          </label>
        </div>
      </div>
      {needsChoice && (
        <p className="mt-1 text-sm text-red-600">
          Choose an occasion to share with {family.name}.
        </p>
      )}
    </li>
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
