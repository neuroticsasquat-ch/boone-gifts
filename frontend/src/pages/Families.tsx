import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFamilies, createFamily } from "../api/families";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { PendingFamilyInvites } from "../components/PendingFamilyInvites";

export function Families() {
  useTitle("Families");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const families = useQuery({ queryKey: ["families"], queryFn: getFamilies });

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => createFamily(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
      setName("");
      navigate(`/families/${result.id}`);
    },
    onError: () => toast.error("Failed to create family."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim() });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Families</h1>
        <Link to="/family-lists" className="inline-block text-sm text-blue-600 hover:underline">
          View Family Lists →
        </Link>
      </div>

      <PendingFamilyInvites />

      {families.isPending && <Spinner />}
      {families.isError && <p className="text-red-600">Failed to load families.</p>}
      {families.data && (
        <>
          <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a Family</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Family name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>

          <section>
            {families.data.length === 0 && (
              <p className="text-gray-500">No families yet. Create one above.</p>
            )}
            {families.data.length > 0 && (
              <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
                {families.data.map((family) => (
                  <li key={family.id} className="flex items-center justify-between px-4 py-3">
                    <Link to={`/families/${family.id}`} className="min-w-0 flex-1 hover:opacity-75">
                      <p className="font-medium text-gray-900">{family.name}</p>
                      <p className="text-sm text-gray-500 capitalize">{family.role} &middot; {family.member_count} {family.member_count === 1 ? "member" : "members"}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
