import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { createList } from "../api/lists";
import { getFamilies } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { RecipientFields } from "../components/RecipientFields";
import {
  NO_RECIPIENT,
  recipientIncomplete,
  recipientPayload,
  type RecipientValue,
} from "../lib/recipient";

export function CreateList() {
  useTitle("New List");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [familyIds, setFamilyIds] = useState<number[]>([]);
  const [recipient, setRecipient] = useState<RecipientValue>(NO_RECIPIENT);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Simple-mode lists are shared with every family automatically, so a control
  // here would be a lie. Full-mode owners opt in family by family, unchecked.
  const canChooseFamilies = !user?.simple_mode;
  const families = useQuery({
    queryKey: ["families"],
    queryFn: getFamilies,
    enabled: canChooseFamilies,
  });
  const showFamilies = canChooseFamilies && (families.data ?? []).length > 0;

  function toggleFamily(id: number) {
    setFamilyIds((current) =>
      current.includes(id) ? current.filter((f) => f !== id) : [...current, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const list = await createList({
        name,
        description: description || undefined,
        ...recipientPayload(recipient),
        ...(showFamilies ? { family_ids: familyIds } : {}),
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
        <RecipientFields value={recipient} onChange={setRecipient} />
        {showFamilies && (
          <fieldset className="mb-6">
            <legend className="text-sm font-medium text-gray-700">Share with families</legend>
            <p className="mt-1 text-sm text-gray-500">
              You can change this later from the list's Families tab.
            </p>
            <div className="mt-2 space-y-2">
              {families.data!.map((family) => (
                <label key={family.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={familyIds.includes(family.id)}
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
            disabled={submitting || recipientIncomplete(recipient)}
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
