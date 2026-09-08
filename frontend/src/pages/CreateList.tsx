import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { createList } from "../api/lists";
import { getFamilies } from "../api/families";
import { getAccount } from "../api/account";
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
  // query can answer late, and the answer is still every family.
  const [familyIds, setFamilyIds] = useState<number[] | null>(null);
  const [listFor, setListFor] = useState<ListForValue>(LIST_FOR_UNANSWERED);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Every family the owner belongs to arrives checked — the default that replaces
  // the auto-grant retired in NEU-1261 (project spec §8). Unchecking is free.
  const families = useQuery({
    queryKey: ["families"],
    queryFn: getFamilies,
  });
  const allFamilies = families.data ?? [];
  const showFamilies = allFamilies.length > 0;
  const selectedFamilyIds = familyIds ?? allFamilies.map((f) => f.id);

  // On a shared account every list says who it is for, and the answer is required
  // (project spec §5.2).
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });

  function toggleFamily(id: number) {
    const next = new Set(selectedFamilyIds);
    if (!next.delete(id)) next.add(id);
    // Keep the payload in the families' own order, however the boxes were toggled.
    setFamilyIds(allFamilies.map((f) => f.id).filter((f) => next.has(f)));
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
        ...(showFamilies ? { family_ids: selectedFamilyIds } : {}),
      });
      navigate(`/lists/${list.id}`, { replace: true });
    } catch {
      setError("Failed to create list. Please try again.");
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
              Uncheck any you'd rather keep it from. You can change this later from
              the list itself.
            </p>
            <div className="mt-2 space-y-2">
              {allFamilies.map((family) => (
                <label key={family.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedFamilyIds.includes(family.id)}
                    onChange={() => toggleFamily(family.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{family.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              submitting ||
              // Submitting before the families answer would post no family_ids at
              // all, silently skipping the pre-check and creating the list that
              // reaches nobody.
              families.isPending ||
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
