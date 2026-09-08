import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { createList } from "../api/lists";
import { getFamilies } from "../api/families";
import { getFamilyOccasions } from "../api/occasions";
import { getAccount } from "../api/account";
import { NO_ACTIVE_OCCASION, occasionChoice } from "../lib/occasion-choice";
import type { Occasion } from "../types";
import { useTitle } from "../hooks/useTitle";
import { ListForFields } from "../components/ListForFields";
import {
  LIST_FOR_UNANSWERED,
  listForIncomplete,
  listForPayload,
  type ListForValue,
} from "../lib/list-for";

export function CreateList() {
  useTitle("New List");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // `null` is "the owner hasn't touched the checkboxes", which is what makes the
  // pre-check a default rather than state seeded from an effect: the families
  // and their occasions can answer late, and the answer is still the same.
  const [tickedFamilyIds, setTickedFamilyIds] = useState<number[] | null>(null);
  // What each row's select is pointing at, held apart from the tick: naming an
  // occasion is not the same as saying the list should reach that family.
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [listFor, setListFor] = useState<ListForValue>(LIST_FOR_UNANSWERED);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const families = useQuery({
    queryKey: ["families"],
    queryFn: getFamilies,
  });
  const allFamilies = families.data ?? [];
  const showFamilies = allFamilies.length > 0;

  // A list is shared to an occasion, so the boxes cannot be drawn from the
  // families alone. There is no endpoint answering "my families and their
  // occasions" in one call, and a user's families are few, so fan out.
  const occasionQueries = useQueries({
    queries: allFamilies.map((family) => ({
      queryKey: ["occasions", family.id, { archived: false }],
      queryFn: () => getFamilyOccasions(family.id),
    })),
  });
  const rows = allFamilies.map((family, i) => ({
    family,
    // A row whose occasions have not answered must not say "no active occasion"
    // — that reads as a fact about the family rather than about the request.
    pending: occasionQueries[i]?.isPending ?? true,
    failed: occasionQueries[i]?.isError ?? false,
    choice: occasionChoice<Occasion>(occasionQueries[i]?.data ?? []),
  }));
  const occasionsPending = rows.some((row) => row.pending);

  // The default that replaces the auto-grant retired in NEU-1261 (project spec
  // §8), narrowed by M3: a family arrives checked only when it has exactly one
  // active occasion — the only shape where ticking needs no further answer.
  // Unchecking is free.
  const ticked = tickedFamilyIds ?? rows.filter((r) => r.choice.kind === "one").map((r) => r.family.id);

  /** The occasion a ticked family would be reached through, or undefined while
   *  its select is still unanswered — the state the form refuses to submit. */
  function occasionFor(row: (typeof rows)[number]): number | undefined {
    return row.choice.kind === "one" ? row.choice.occasion.id : picked[row.family.id];
  }

  const sharingWith = rows.filter((row) => ticked.includes(row.family.id));
  const unchosen = sharingWith.filter((row) => occasionFor(row) === undefined);

  // On a shared account every list says who it is for, and the answer is required
  // (project spec §5.2).
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });

  function toggleFamily(familyId: number) {
    const next = new Set(ticked);
    if (!next.delete(familyId)) next.add(familyId);
    // Keep the payload in the families' own order, however the boxes were toggled.
    setTickedFamilyIds(rows.map((r) => r.family.id).filter((id) => next.has(id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const list = await createList({
        name,
        description: description || undefined,
        ...listForPayload(listFor),
        ...(showFamilies
          ? {
              occasion_ids: sharingWith
                .map(occasionFor)
                .filter((id): id is number => id !== undefined),
            }
          : {}),
      });
      navigate(`/lists/${list.id}`, { replace: true });
    } catch (err) {
      // The one 409 here is an occasion archived between this form loading and
      // being submitted. "Try again" would be a lie: the same submission will
      // keep failing until the owner changes what it asks for.
      setError(
        isAxiosError(err) && err.response?.status === 409
          ? "One of those occasions has been archived and can't be shared to any more. Untick that family, or choose another of its occasions."
          : "Failed to create list. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New List</h1>
      <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow">
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </label>
        <label className="block mb-6">
          <span className="text-sm font-medium text-gray-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <ListForFields account={account.data} value={listFor} onChange={setListFor} />
        {showFamilies && (
          <fieldset className="mb-6">
            <legend className="text-sm font-medium text-gray-700">Share with families</legend>
            <p className="mt-1 text-sm text-gray-500">
              Each family sees this list through one of its occasions. Uncheck any
              you'd rather keep it from — you can change this later from the list
              itself.
            </p>
            <div className="mt-2 space-y-2">
              {rows.map(({ family, choice, pending, failed }) => (
                <div key={family.id} className="flex flex-wrap items-center gap-2">
                  {/* The occasion line sits outside the label: it says what this
                      family is reached through, and folding it into the box's
                      accessible name would make the box's name change with it. */}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ticked.includes(family.id)}
                      disabled={pending || failed || choice.kind === "none"}
                      onChange={() => toggleFamily(family.id)}
                      className="rounded border-gray-300 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-700">{family.name}</span>
                  </label>
                  <span className="text-sm text-gray-500">
                    {pending
                      ? "Loading occasions…"
                      : failed
                        ? "Couldn't load this family's occasions."
                        : choice.kind === "one"
                          ? choice.occasion.name
                          : choice.kind === "none"
                            ? NO_ACTIVE_OCCASION
                            : ""}
                  </span>
                  {!pending && !failed && choice.kind === "many" && (
                    <select
                      aria-label={`Occasion for ${family.name}`}
                      value={picked[family.id] ?? ""}
                      onChange={(e) =>
                        e.target.value &&
                        setPicked({ ...picked, [family.id]: Number(e.target.value) })
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">Choose an occasion…</option>
                      {choice.occasions.map((occasion) => (
                        <option key={occasion.id} value={occasion.id}>
                          {occasion.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            {unchosen.length > 0 && (
              <p className="mt-2 text-sm text-red-600">
                Choose an occasion for {unchosen.map((row) => row.family.name).join(", ")}.
              </p>
            )}
          </fieldset>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              submitting ||
              // Submitting before the families and their occasions answer would
              // post no occasion_ids at all, silently skipping the pre-check and
              // creating the list that reaches nobody.
              families.isPending ||
              occasionsPending ||
              unchosen.length > 0 ||
              listForIncomplete(listFor, account.data?.is_shared_account ?? false)
            }
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create List"}
          </button>
          <Link
            to="/lists"
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
