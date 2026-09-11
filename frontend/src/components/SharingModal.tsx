import { useId, useState } from "react";
import { Link } from "react-router";
import { NO_ACTIVE_OCCASION, occasionChoice } from "../lib/occasion-choice";
import { joinNames, sharedWithSentence } from "../lib/sharing-summary";
import type { ShareTargetFamily, ShareTargetOccasion } from "../types";
import { Modal } from "./Modal";

/**
 * Who a list is to reach: the ticked boxes, in one value both modes hold.
 *
 * It is the **intended** state and never a delta, so a section renders from it
 * without knowing whether the container writes to a server or to `useState`.
 */
export interface SharingSelection {
  /** familyId → the occasion this list reaches that family through. A family
   *  absent from the map is unticked; there is no "ticked but unchosen" state,
   *  because a tick without a choice is refused before it lands here. */
  familyOccasions: Record<number, number>;
  /** Users the list is shared with directly. */
  userIds: number[];
}

/** One person the list can be shared with, as a container supplies them. */
export interface PersonRow {
  userId: number;
  name: string;
  /** Absent on a share held by someone who is no longer a connection: the row
   *  is synthesised from the share alone and has nothing but a name. */
  email?: string;
  /** Families whose **live** occasion share already puts this list in front of
   *  them (CONTEXT.md rule 6). Empty while creating: a draft tick is not a
   *  share, so nothing is covered yet (NEU-1307, decision 5). */
  coveredBy?: string[];
}

/** A section's rows, what the read behind them is doing, and whether a write of
 *  its own is in flight — the whole of what makes its controls live or dead. */
export interface SectionState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  /** A write is in flight; the section's controls are dead until it lands. */
  pending: boolean;
}

/** The selection, and whether it is a fact yet. A failed read leaves every
 *  count at zero, and "nobody can see this" is far too load-bearing a sentence
 *  to say on the strength of a request that never answered. */
export interface SelectionState {
  data: SharingSelection;
  isLoading: boolean;
  isError: boolean;
}

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
 * **Controlled** since NEU-1307, and this is the shell alone: the rows, the
 * filter, the three-state occasion rule and the refusal live here, and the data
 * behind them does not. Two containers supply it — `ListSharingModal`, which
 * reads and writes a list that exists, and `DraftSharingModal`, which holds a
 * create form's selections until submit. Everything a user sees is the same in
 * both, which is the whole point: creation and editing cannot drift.
 */
export function SharingModal({
  families,
  people,
  selection,
  onFamilyToggled,
  onPersonToggled,
  linkAway,
  onClose,
}: {
  families: SectionState<ShareTargetFamily[]>;
  people: SectionState<PersonRow[]>;
  selection: SelectionState;
  /** `next` is the occasion to reach this family through, or `null` to stop.
   *  The container reads what is currently ticked from `selection`. */
  onFamilyToggled: (family: ShareTargetFamily, next: number | null) => void;
  onPersonToggled: (userId: number, next: boolean) => void;
  /** Whether an empty section may offer its way out to People. False on the
   *  create form, where following a link would discard a half-typed list. */
  linkAway: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  // Scratch input inside a dialog that pops out of existence, so it stays out
  // of the URL — the genuine exception to CONTEXT.md rule 8, which the rule now
  // names. Nobody links to a half-typed filter, and one `replaceState` per
  // keystroke across 50 rows can reach Safari's ~100-per-30s throttle.
  const [filter, setFilter] = useState("");

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
        <SharedWithLine selection={selection} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Families first, then people — the same order the header summary
            reads in. Families is the broader stroke, and it decides what the
            People rows can offer at all, so reading it second would be reading
            the control backwards (project spec §5.2). */}
        <FamiliesSection
          families={families}
          selection={selection.data}
          onFamilyToggled={onFamilyToggled}
          filter={filter}
          linkAway={linkAway}
        />
        <PeopleSection
          people={people}
          selection={selection.data}
          onPersonToggled={onPersonToggled}
          filter={filter}
          linkAway={linkAway}
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

/**
 * What is ticked, so the state is legible without reading every checkbox.
 *
 * It counts the selection rather than the people the list actually reaches, and
 * says so in `lib/sharing-summary`'s words — the create form's own section says
 * the same sentence about the same selection, and the two must not drift.
 */
function SharedWithLine({ selection }: { selection: SelectionState }) {
  // A failed fetch also leaves both counts at zero, and "nobody can see this"
  // is far too load-bearing a sentence to say on the strength of a request that
  // never answered — the same rule `SharingSummary` follows, in its words.
  if (selection.isLoading) return <Summary>Loading sharing…</Summary>;
  if (selection.isError) {
    return <Summary>Couldn't load who this list is shared with.</Summary>;
  }

  return (
    <Summary>
      {sharedWithSentence(
        Object.keys(selection.data.familyOccasions).length,
        selection.data.userIds.length,
      )}
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

/** An empty section's sentence, and — only where following a link costs the
 *  viewer nothing — the way out of it. */
function EmptyGroup({
  title,
  children,
  link,
  linkAway,
}: {
  title: string;
  children: React.ReactNode;
  link: string;
  linkAway: boolean;
}) {
  return (
    <Group title={title}>
      <Hint>
        {children}
        {linkAway && (
          <>
            {" "}
            <Link to="/people" className="text-blue-600 hover:underline">
              {link}
            </Link>
          </>
        )}
      </Hint>
    </Group>
  );
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

function PeopleSection({
  people,
  selection,
  onPersonToggled,
  filter,
  linkAway,
}: {
  people: SectionState<PersonRow[]>;
  selection: SharingSelection;
  onPersonToggled: (userId: number, next: boolean) => void;
  filter: string;
  linkAway: boolean;
}) {
  // The families read gates the rows as well: a row that arrives interactive
  // and turns disabled a moment later is disabled at precisely the moment an
  // owner clicks — so a container folds that read into this one's loading.
  if (people.isLoading) {
    return <Group title="People"><Hint>Loading…</Hint></Group>;
  }
  if (people.isError) {
    return (
      <Group title="People">
        <p className="text-sm text-red-600">Failed to load people.</p>
      </Group>
    );
  }

  const rows = people.data ?? [];

  // Both headings stay while filtering, each with its own emptiness, so a
  // viewer whose query matched three families and no people can see which
  // population came up empty rather than guessing.
  if (rows.length === 0) {
    return (
      <EmptyGroup title="People" link="Add a connection" linkAway={linkAway}>
        You don't have any connections yet.
      </EmptyGroup>
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

  const shared = new Set(selection.userIds);

  return (
    <Group title="People">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {visible.map((row) => {
          const checked = shared.has(row.userId);
          // Only an unticked box is dead: you can always remove a grant, you
          // just cannot add a redundant one — and this modal is the only place
          // to remove one. Synthesised rows are ticked by definition, so they
          // are never touched by this.
          const covering = checked ? [] : (row.coveredBy ?? []);
          const covered = covering.length > 0;
          return (
            <ShareRow
              key={row.userId}
              name={row.name}
              // The reason replaces the email rather than stacking below it: the
              // email is decoration, the reason is why the control is dead.
              detail={covered ? `Already sees this through ${joinNames(covering)}` : row.email}
              checked={checked}
              disabled={people.pending || covered}
              onToggle={() => onPersonToggled(row.userId, !checked)}
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
 * `occasionChoice` states that rule once, for every surface that renders it. A
 * family with none is listed and disabled rather than hidden: "you cannot share
 * here yet, and here is why" is the whole point of the row, and the filter
 * keeps it that way.
 */
function FamiliesSection({
  families,
  selection,
  onFamilyToggled,
  filter,
  linkAway,
}: {
  families: SectionState<ShareTargetFamily[]>;
  selection: SharingSelection;
  onFamilyToggled: (family: ShareTargetFamily, next: number | null) => void;
  filter: string;
  linkAway: boolean;
}) {
  // What a row's select is pointing at. Read only while the row is unticked —
  // ticking is what commits it, and after that the occasion is a fact.
  const [picked, setPicked] = useState<Record<number, number>>({});
  // Families ticked with nothing chosen. The share is refused here as well as
  // server-side, and the row says which half is missing.
  const [needsChoice, setNeedsChoice] = useState<number[]>([]);

  if (families.isLoading) {
    return <Group title="Families"><Hint>Loading…</Hint></Group>;
  }
  if (families.isError) {
    return (
      <Group title="Families">
        <p className="text-sm text-red-600">Failed to load families.</p>
      </Group>
    );
  }

  const data = families.data ?? [];
  if (data.length === 0) {
    return (
      <EmptyGroup title="Families" link="Go to People" linkAway={linkAway}>
        You don't belong to any families yet.
      </EmptyGroup>
    );
  }

  const visible = data.filter((family) => matchesFilter(filter, family.name));

  function toggle(family: ShareTargetFamily) {
    if (selection.familyOccasions[family.id] !== undefined) {
      onFamilyToggled(family, null);
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
    onFamilyToggled(family, occasionId);
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
              disabled={families.pending}
              selectedOccasionId={selection.familyOccasions[family.id]}
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
    </Group>
  );
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
 * how project spec §5.2 draws it. Once ticked the select is **disabled**: on a
 * live list the occasion is then a fact, and re-pointing a share is
 * untick-then-tick, the only order in which the claims question can be asked
 * (§5.4). A draft keeps the same rule though it does not need it — one
 * behaviour beats two, and a select live in one mounting of this dialog and
 * dead in the other is a difference a user would have to learn for no benefit.
 * A family with a single occasion names it in text instead — displayed, not
 * offered.
 */
function FamilyRow({
  family,
  disabled,
  selectedOccasionId,
  pickedOccasionId,
  needsChoice,
  onPick,
  onToggle,
}: {
  family: ShareTargetFamily;
  disabled: boolean;
  selectedOccasionId: number | undefined;
  pickedOccasionId: number | undefined;
  needsChoice: boolean;
  onPick: (occasionId: number) => void;
  onToggle: () => void;
}) {
  const selected = family.occasions.find((o) => o.id === selectedOccasionId) ?? null;
  const choice = occasionChoice(family.occasions);
  // A family with nothing active can still be unshared *from*: its occasion was
  // archived after the share was made, and archiving is not unsharing.
  const operable = selected !== null || choice.kind !== "none";

  // An occasion archived after its share was made is no longer selectable, so it
  // is put back as the value the disabled select displays — otherwise the row
  // would show a share pointing at nothing.
  const selectable = choice.kind === "many" ? choice.occasions : [];
  const options =
    selected && !selectable.some((o) => o.id === selected.id)
      ? [selected, ...selectable]
      : selectable;
  const showSelect = options.length > 1;

  const detail = showSelect
    ? null
    : selected
      ? occasionLabel(selected)
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
              value={selected ? selected.id : (pickedOccasionId ?? "")}
              disabled={disabled || selected !== null}
              onChange={(e) => e.target.value && onPick(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              {!selected && <option value="">Choose an occasion…</option>}
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
              checked={selected !== null}
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
