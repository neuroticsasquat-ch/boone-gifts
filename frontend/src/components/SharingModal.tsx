import { useId, useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getShares, createShare, deleteShare } from "../api/shares";
import { getConnections } from "../api/connections";
import { getShareTargets, shareListWithOccasion, unshareListFromOccasion } from "../api/lists";
import { NO_ACTIVE_OCCASION, occasionChoice } from "../lib/occasion-choice";
import type { Connection, ListShare, ShareTargetFamily, ShareTargetOccasion } from "../types";
import { ConfirmDialog, type ConfirmAction } from "./ConfirmDialog";
import { Modal } from "./Modal";

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * The one place an owner says who can see a list — people and families in the
 * same dialog, replacing the retired "Shared with" and "Families" tabs.
 *
 * A **modal**, not the inline region it was until NEU-1306: as a region it sat
 * above the gifts and pushed the list's own content down the page, and at the
 * ~50 connections and ~8 families M3 is designed for that is unusable. Its
 * open-ness is held in the URL as `?share=open`, so the mobile Back gesture
 * closes it rather than navigating away (CONTEXT.md rule 8).
 *
 * Owner-only: it is opened by the header's Change control. The backend is still
 * the gate; this writes through `/lists/{id}/shares` for people and
 * `/lists/{id}/occasions/{occasion_id}` for families.
 *
 * It lives in `components/` rather than under `pages/list-detail/` because New
 * List mounts the same control (NEU-1307) — reuse is a committed M3 contract,
 * unlike the write seam, which that ticket designs against a caller that exists.
 */
export function SharingModal({
  listId,
  queryClient,
  onClose,
}: {
  listId: number;
  queryClient: QueryClient;
  onClose: () => void;
}) {
  const titleId = useId();
  // Scratch input inside a dialog that pops out of existence, so it stays out
  // of the URL — the genuine exception to CONTEXT.md rule 8, which the rule now
  // names. Nobody links to a half-typed filter, and one `replaceState` per
  // keystroke across 50 rows can reach Safari's ~100-per-30s throttle.
  const [filter, setFilter] = useState("");

  // The reads are lifted: the filter spans both sections and the summary needs
  // both halves, so one source beats three components re-deriving "what is this
  // list shared to". The writes stay in the sections that make them.
  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const targets = useQuery({
    queryKey: ["share-targets", listId],
    queryFn: () => getShareTargets(listId),
  });

  return (
    <Modal open labelledBy={titleId} size="lg" onClose={onClose}>
      {/* Fixed: the filter box, the summary and Done stay in reach however far
          the rows scroll. */}
      <div className="space-y-3 border-b border-gray-200 p-4">
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          Who can see this list
        </h2>
        {/* One box across both sections: someone typing "boone" does not know
            or care whether Boone is a family or a surname, and two boxes would
            double the chrome in a dialog already dense with occasion dropdowns
            and disabled-with-reason rows. Rendered unconditionally — a control
            that appears once you cross some row count is one nobody learns. */}
        <input
          type="search"
          aria-label="Filter people and families"
          placeholder="Filter people and families…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <SharedWithLine shares={shares} targets={targets} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Families first, then people — the same order the header summary
            reads in. Families is the broader stroke, and it decides what the
            People rows can offer at all, so reading it second would be reading
            the control backwards (project spec §5.2). */}
        <FamiliesSection
          listId={listId}
          queryClient={queryClient}
          families={targets.data}
          isLoading={targets.isLoading}
          isError={targets.isError}
          filter={filter}
        />
        <PeopleSection
          listId={listId}
          queryClient={queryClient}
          shares={shares.data}
          connections={connections.data}
          families={targets.data}
          isLoading={shares.isLoading || connections.isLoading || targets.isLoading}
          isError={shares.isError || connections.isError}
          filter={filter}
        />
      </div>

      <div className="flex justify-end border-t border-gray-200 p-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// --- The filter ---

/**
 * The one predicate, applied identically to every row in both sections.
 *
 * A disabled row is never *specially* dropped and never *specially* kept.
 * "The filter must not hide disabled rows" has a literal reading that defeats
 * the feature — at 8 families and 20 covered people the list would never get
 * short — and the contract is the narrow one: "why can't I share with Gran?"
 * is answered by typing "gran" and seeing Gran, greyed, with the reason
 * (CONTEXT.md rule 6).
 *
 * Occasion names are deliberately not among the fields any caller passes: an
 * occasion is not the row's identity, the `<select>` already lists them, and a
 * family row matching on text inside a collapsed control the viewer cannot see
 * is worse than one that does not appear at all.
 */
function matchesFilter(filter: string, ...fields: (string | undefined)[]): boolean {
  const query = filter.trim().toLowerCase();
  if (query === "") return true;
  return fields.some((field) => field !== undefined && field.toLowerCase().includes(query));
}

/** What a query for nothing looks like, said apart from having nothing to
 *  query: showing "add a connection" to someone with forty of them is a lie. */
function NoMatches({ noun, filter }: { noun: string; filter: string }) {
  return <Hint>{`No ${noun} match "${filter.trim()}"`}</Hint>;
}

// --- The summary ---

/** `2 families`, `1 person` — the unit named, and pluralised with the count. */
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * What is ticked, so the state is legible without reading every checkbox.
 *
 * It counts the boxes and names the unit, rather than the people the list
 * actually reaches. A true headcount is computable from `member_ids`, and was
 * rejected: it would count people the owner has never met and cannot name, it
 * moves when someone joins a family without the owner touching anything, and it
 * would have to include occasions archived *after* their share, since archiving
 * withdraws nothing. The header's `SharingSummary` already **names** everyone
 * and is unreadable behind this dialog; it names, this counts.
 */
function SharedWithLine({
  shares,
  targets,
}: {
  shares: { data?: ListShare[]; isLoading: boolean; isError: boolean };
  targets: { data?: ShareTargetFamily[]; isLoading: boolean; isError: boolean };
}) {
  // A failed fetch also leaves both counts at zero, and "nobody can see this"
  // is far too load-bearing a sentence to say on the strength of a request that
  // never answered — the same rule `SharingSummary` follows, in its words.
  if (shares.isLoading || targets.isLoading) return <Summary>Loading sharing…</Summary>;
  if (shares.isError || targets.isError) {
    return <Summary>Couldn't load who this list is shared with.</Summary>;
  }

  const families = (targets.data ?? []).filter((family) =>
    family.occasions.some((occasion) => occasion.shared),
  ).length;
  const people = (shares.data ?? []).length;

  const units = [
    ...(families > 0 ? [counted(families, "family", "families")] : []),
    ...(people > 0 ? [counted(people, "person", "people")] : []),
  ];

  return (
    <Summary>
      {units.length === 0
        ? "This list isn't shared with anyone."
        : `Shared with ${units.join(" and ")}`}
    </Summary>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-gray-900">{children}</p>;
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

/**
 * The families whose live occasion share already puts this list in front of a
 * person — every one of them, because unticking only the first would leave the
 * row disabled and the owner none the wiser (project spec §5.2).
 *
 * "Live" is deliberately narrower than access: a share made before its occasion
 * was archived still grants sight, but that route is winding down, so a direct
 * share there is the useful offer rather than a redundant one. A disabled row
 * therefore means "the live route already covers them", not "they can already
 * see this".
 */
function coveringFamilies(targets: ShareTargetFamily[], userId: number): string[] {
  return targets
    .filter(
      (family) =>
        family.member_ids.includes(userId) &&
        family.occasions.some((occasion) => occasion.shared && !occasion.is_archived),
    )
    .map((family) => family.name);
}

function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function PeopleSection({
  listId,
  queryClient,
  shares,
  connections,
  families,
  isLoading,
  isError,
  filter,
}: {
  listId: number;
  queryClient: QueryClient;
  shares: ListShare[] | undefined;
  connections: Connection[] | undefined;
  families: ShareTargetFamily[] | undefined;
  isLoading: boolean;
  isError: boolean;
  filter: string;
}) {
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

  // The families read gates the rows as well: a row that arrives interactive
  // and turns disabled a moment later is disabled at precisely the moment an
  // owner clicks.
  if (isLoading) {
    return <Group title="People"><Hint>Loading…</Hint></Group>;
  }
  if (isError) {
    return (
      <Group title="People">
        <p className="text-sm text-red-600">Failed to load people.</p>
      </Group>
    );
  }

  const connectionList = connections ?? [];
  const shareList = shares ?? [];
  const connected = new Set(connectionList.map((c) => c.user.id));

  // Every connection, plus anyone still holding a share who is no longer a
  // connection. Without that second half such a grant would be readable in the
  // header summary — which falls back to the same "User 42" — while this modal,
  // the only revoke surface there is, offered no row to switch it off.
  const rows = [
    ...connectionList.map((c) => ({ userId: c.user.id, name: c.user.name, email: c.user.email })),
    ...shareList
      .filter((s) => !connected.has(s.user_id))
      .map((s) => ({ userId: s.user_id, name: `User ${s.user_id}`, email: undefined })),
  ];

  // Both headings stay while filtering, each with its own emptiness, so a
  // viewer whose query matched three families and no people can see which
  // population came up empty rather than guessing.
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

  // A synthesised "User 42" row has no email and matches on that name alone.
  const visible = rows.filter((row) => matchesFilter(filter, row.name, row.email));
  if (visible.length === 0) {
    return (
      <Group title="People">
        <NoMatches noun="people" filter={filter} />
      </Group>
    );
  }

  const sharedUserIds = new Set(shareList.map((s) => s.user_id));
  const pending = shareMutation.isPending || unshareMutation.isPending;
  // A failed families fetch leaves this empty, which offers a grant that may be
  // redundant. That is the right way to fail: the disable is a nudge, never a
  // permission (CONTEXT.md rule 1), and the share it withholds is real.
  const targetList = families ?? [];

  return (
    <Group title="People">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {visible.map((row) => {
          const shared = sharedUserIds.has(row.userId);
          // Only an unticked box is dead: you can always remove a grant, you
          // just cannot add a redundant one — and this modal is the only place
          // to remove one. Synthesised rows are ticked by definition, so they
          // are never touched by this.
          const covering = shared ? [] : coveringFamilies(targetList, row.userId);
          const covered = covering.length > 0;
          return (
            <ShareRow
              key={row.userId}
              name={row.name}
              // The reason replaces the email rather than stacking below it: the
              // email is decoration, the reason is why the control is dead.
              detail={covered ? `Already sees this through ${joinNames(covering)}` : row.email}
              checked={shared}
              disabled={pending || covered}
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
 * `occasionChoice` states that rule once, for this modal and the create form
 * both. A family with none is listed and disabled rather than hidden: "you
 * cannot share here yet, and here is why" is the whole point of the row, and
 * the filter keeps it that way.
 */
function FamiliesSection({
  listId,
  queryClient,
  families,
  isLoading,
  isError,
  filter,
}: {
  listId: number;
  queryClient: QueryClient;
  families: ShareTargetFamily[] | undefined;
  isLoading: boolean;
  isError: boolean;
  filter: string;
}) {
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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["share-targets", listId] });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    // Sharing a list into an occasion moves that occasion's list_count and its
    // last_activity_at, so the /lists strip is stale the moment this returns.
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
  }

  const shareMutation = useMutation({
    mutationFn: (occasionId: number) => shareListWithOccasion(listId, occasionId),
    onSuccess: invalidate,
    onError: (err) => {
      // The only 409 on this call is an occasion archived since the modal
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

  if (isLoading) {
    return <Group title="Families"><Hint>Loading…</Hint></Group>;
  }
  if (isError) {
    return (
      <Group title="Families">
        <p className="text-sm text-red-600">Failed to load families.</p>
      </Group>
    );
  }

  const data = families ?? [];
  if (data.length === 0) {
    return (
      <Group title="Families">
        <Hint>
          You don't belong to any families yet.{" "}
          <Link to="/people" className="text-blue-600 hover:underline">Go to People</Link>
        </Hint>
      </Group>
    );
  }

  const visible = data.filter((family) => matchesFilter(filter, family.name));
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
      {visible.length === 0 ? (
        <NoMatches noun="families" filter={filter} />
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {visible.map((family) => (
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
      )}

      {/* Stacked over the sharing modal rather than replacing its body: the
          owner keeps their place and their filter text mid-decision, and
          reopening would cost a second history entry. `Modal`'s topmost-only
          rule is what makes two of them at once behave. */}
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

const REVOKE_CLAIMS_ACTIONS: ConfirmAction[] = [
  { id: "release", label: "Release those claims", tone: "primary" },
  { id: "keep", label: "Keep them claimed", tone: "neutral" },
];

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
    <ConfirmDialog
      open
      title="Some gifts are claimed"
      body={`Members of ${familyName} have claimed gifts on this list. If you stop sharing, what should happen to those claims?`}
      actions={REVOKE_CLAIMS_ACTIONS}
      pending={pending}
      onResolve={(id) => {
        if (id === "release" || id === "keep") onChoose(id);
        else onCancel();
      }}
    />
  );
}
