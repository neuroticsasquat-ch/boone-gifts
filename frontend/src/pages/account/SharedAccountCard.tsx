import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { getAccount, updateAccount } from "../../api/account";
import type { Account, AccountConflict, AccountUpdate } from "../../types";
import { ConfirmDialog } from "../../components/ConfirmDialog";

/**
 * The Account page's shared-household card: declaring that more than one person
 * uses this login, and naming them.
 *
 * The people are **labels, not identities** (project spec §5.1) — nobody named
 * here gets their own login, their own view, or any privacy from the others.
 * The copy has to keep saying so, because the whole feature reads like
 * multi-user until it doesn't.
 *
 * Saving is a declarative full replace of `PUT /account`: the rows on screen
 * *are* the desired state, so a rename is an entry keeping its id, a new person
 * is one without, a removal is an omission, and row order is display order.
 */

/** One editable row. `id` is absent for someone who does not exist yet; `key`
 *  is local, keeping React's reconciliation honest across renames and moves. */
interface PersonDraft {
  key: string;
  id?: number;
  name: string;
}

interface Draft {
  isShared: boolean;
  people: PersonDraft[];
}

/** What a pending 409 is asking the user to agree to. */
interface PendingConfirm {
  affectedLists: number;
  /** The people whose labels the change would strip. */
  names: string[];
  /** Un-marking the account, rather than dropping some of its people. */
  turningOff: boolean;
}

const AT_LEAST_TWO = "Name at least two people, or turn this off.";
const NEEDS_A_NAME = "Every person needs a name.";
const DUPLICATE_NAME = "Two people on this account can't have the same name.";

let nextKey = 0;

function row(name = "", id?: number): PersonDraft {
  nextKey += 1;
  return { key: `person-${nextKey}`, id, name };
}

function toDraft(account: Account): Draft {
  return {
    isShared: account.is_shared_account,
    people: account.people.map((person) => row(person.name, person.id)),
  };
}

function toPayload(draft: Draft): AccountUpdate {
  return {
    is_shared_account: draft.isShared,
    // Turning it off deletes the people outright (project spec §5.5); the lists
    // they labelled survive, unlabelled.
    people: draft.isShared
      ? draft.people.map(({ id, name }) => (id === undefined ? { name: name.trim() } : { id, name: name.trim() }))
      : [],
  };
}

/** The form half of "at least two people, each named, none twice". The API
 *  enforces all three as well — this is so the user hears it sooner. */
function validate(draft: Draft): string | null {
  if (!draft.isShared) return null;
  if (draft.people.length < 2) return AT_LEAST_TWO;
  if (draft.people.some((person) => !person.name.trim())) return NEEDS_A_NAME;
  // Compared as typed, because the unique constraint behind the API's 400 is:
  // "Gran" and "gran" are two people to it, so they must be two here too.
  const names = draft.people.map((person) => person.name.trim());
  if (new Set(names).size !== names.length) return DUPLICATE_NAME;
  return null;
}

/** The people a save would un-label, read off the *saved* state — the draft has
 *  already forgotten them. */
function strippedNames(saved: Account, draft: Draft): string[] {
  if (!draft.isShared) return saved.people.map((person) => person.name);
  const kept = new Set(draft.people.map((person) => person.id).filter((id) => id !== undefined));
  return saved.people.filter((person) => !kept.has(person.id)).map((person) => person.name);
}

function joinNames(names: string[], conjunction: "and" | "or"): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

function listCount(n: number): string {
  return n === 1 ? "1 list is" : `${n} lists are`;
}

export function SharedAccountCard() {
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Seeded once, from the first load. Later saves reseed it from their own
  // response, so a background refetch can never discard an edit in progress.
  if (account.data && draft === null) setDraft(toDraft(account.data));

  function edit(next: Draft) {
    setDraft(next);
    setError(null);
    setSaved(false);
  }

  function reset() {
    if (account.data) setDraft(toDraft(account.data));
    setError(null);
    setSaved(false);
  }

  const savedPeople = account.data?.people ?? [];
  const turningOff = Boolean(account.data?.is_shared_account) && draft?.isShared === false;

  const save = useMutation({
    mutationFn: (vars: { draft: Draft; confirm: boolean }) => updateAccount(toPayload(vars.draft), vars.confirm),
    onSuccess: (data) => {
      setPendingConfirm(null);
      setDraft(toDraft(data));
      setError(null);
      setSaved(true);
      queryClient.setQueryData(["account"], data);
      // List rows carry the assigned person's name, so a rename or a removal
      // has just changed what they read.
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: (err, vars) => {
      if (!isAxiosError(err)) {
        setError("Could not save. Try again.");
        return;
      }
      // A 409 is never a failure here: it is the count the confirmation needs,
      // and nothing has changed yet.
      if (err.response?.status === 409 && !vars.confirm && account.data) {
        const affected = (err.response.data as AccountConflict | undefined)?.affected_lists ?? 0;
        setPendingConfirm({
          affectedLists: affected,
          names: strippedNames(account.data, vars.draft),
          turningOff: !vars.draft.isShared,
        });
        return;
      }
      const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
      setError(detail ?? "Could not save. Try again.");
      setPendingConfirm(null);
    },
  });

  function handleSave() {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      setSaved(false);
      return;
    }
    setError(null);
    setSaved(false);
    save.mutate({ draft, confirm: false });
  }

  return (
    <div className="bg-white shadow rounded p-6 mt-6">
      <h2 className="text-lg font-semibold mb-4">More than one person uses this account</h2>

      {account.isLoading && <p className="text-sm text-gray-600">Loading…</p>}
      {account.error && <p className="text-red-600 text-sm">Could not load your account settings.</p>}

      {draft && (
        <>
          <label className="flex items-start gap-3 mb-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.isShared}
              onChange={(e) =>
                edit(
                  e.target.checked
                    ? // Two empty rows on the way in: the minimum is a rule of the
                      // feature, so the form should show it rather than explain it.
                      { isShared: true, people: draft.people.length ? draft.people : [row(), row()] }
                    : { ...draft, isShared: false },
                )
              }
            />
            <span className="text-sm text-gray-700">
              More than one person uses this account
            </span>
          </label>

          <p className="text-sm text-gray-600 mb-4">
            Everyone named here shares this one login and sees everything on it. The names are
            labels, so you can mark which lists are whose.
          </p>

          {draft.isShared && (
            <PeopleEditor draft={draft} disabled={save.isPending} onChange={edit} />
          )}

          {turningOff && (
            // The API only asks for confirmation when the change strips a label
            // off a list (NEU-1228 §3.3), so an account whose lists carry none
            // would lose its people on one click with nothing said. Say it here.
            <p className="text-sm text-gray-600 mb-4">
              Turning this off removes {joinNames(savedPeople.map((person) => person.name), "and")}{" "}
              from this account. Lists marked for them are kept, without the label.
            </p>
          )}

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {saved && (
            <p className="text-green-700 bg-green-50 border border-green-200 rounded p-3 text-sm mb-4">
              Account updated.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={save.isPending}
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </>
      )}

      {pendingConfirm && (
        <StripLabelsDialog
          pending={pendingConfirm}
          busy={save.isPending}
          onCancel={() => {
            setPendingConfirm(null);
            reset();
          }}
          onConfirm={() => draft && save.mutate({ draft, confirm: true })}
        />
      )}
    </div>
  );
}

function PeopleEditor({
  draft,
  disabled,
  onChange,
}: {
  draft: Draft;
  disabled: boolean;
  onChange: (next: Draft) => void;
}) {
  const people = draft.people;

  function replace(next: PersonDraft[]) {
    onChange({ ...draft, people: next });
  }

  function move(index: number, by: number) {
    const next = [...people];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    replace(next);
  }

  return (
    <div className="mb-4">
      <ul className="space-y-2 mb-3">
        {people.map((person, index) => (
          <li key={person.key} className="flex items-center gap-2">
            <input
              type="text"
              aria-label={`Person ${index + 1} name`}
              value={person.name}
              disabled={disabled}
              onChange={(e) =>
                replace(people.map((p) => (p.key === person.key ? { ...p, name: e.target.value } : p)))
              }
              className="flex-1 min-w-0 rounded border border-gray-300 px-3 py-2"
            />
            <button
              type="button"
              aria-label={`Move ${person.name || `person ${index + 1}`} up`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className="rounded px-2 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${person.name || `person ${index + 1}`} down`}
              disabled={disabled || index === people.length - 1}
              onClick={() => move(index, 1)}
              className="rounded px-2 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove ${person.name || `person ${index + 1}`}`}
              disabled={disabled}
              onClick={() => replace(people.filter((p) => p.key !== person.key))}
              className="rounded px-2 py-2 text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => replace([...people, row()])}
        disabled={disabled}
        className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
      >
        Add another person
      </button>
    </div>
  );
}

/**
 * The 409's count, turned into the one sentence the user needs: what happens to
 * the lists that carry a label this change removes. They are kept — only the
 * label goes — and saying so is the point of the dialog.
 */
function StripLabelsDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingConfirm;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const names = joinNames(pending.names, "or");
  return (
    <ConfirmDialog
      open
      title={pending.turningOff ? "Turn this off?" : "Remove from this account?"}
      body={
        <>
          {listCount(pending.affectedLists)} marked for {names}.{" "}
          {pending.turningOff ? "Turning this off removes those labels." : "Removing them removes those labels."}{" "}
          The lists themselves are kept.
        </>
      }
      actions={[
        {
          id: "confirm",
          label: pending.turningOff ? "Turn it off" : "Remove them",
          tone: "primary",
        },
      ]}
      pending={busy}
      onResolve={(id) => (id === null ? onCancel() : onConfirm())}
    />
  );
}
