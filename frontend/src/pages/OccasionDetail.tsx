import { useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOccasion,
  updateOccasion,
  deleteOccasion,
  addOccasionItem,
  removeOccasionItem,
  getShoppingList,
} from "../api/occasions";
import { purchaseGift, unpurchaseGift } from "../api/gifts";
import { getLists } from "../api/lists";
import type { OccasionDetail as OccasionDetailType, ShoppingListItem } from "../types";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { ListAttributionLine } from "../components/ListAttribution";

export function OccasionDetail() {
  const { id } = useParams();
  const occasionId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showShoppingList, setShowShoppingList] = useState(false);

  const { data: occasion, isLoading, error, refetch } = useQuery({
    queryKey: ["occasion", occasionId],
    queryFn: () => getOccasion(occasionId),
    enabled: !!id,
  });

  useTitle(occasion?.name ?? "Occasion");

  if (isLoading) return <Spinner />;
  if (error || !occasion) return (
    <div className="text-center py-12">
      <p className="text-red-600">Failed to load occasion.</p>
      <button onClick={() => refetch()} className="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link to="/occasions" className="text-sm text-blue-600 hover:underline">&larr; Back to occasions</Link>
      <OccasionHeader
        occasion={occasion}
        occasionId={occasionId}
        queryClient={queryClient}
        navigate={navigate}
      />
      <div className="flex gap-3">
        <button
          onClick={() => setShowShoppingList(false)}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors ${!showShoppingList ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Lists
        </button>
        <button
          onClick={() => setShowShoppingList(true)}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors ${showShoppingList ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          My Shopping List
        </button>
      </div>
      {showShoppingList ? (
        <ShoppingList occasionId={occasionId} />
      ) : (
        <>
          <OccasionLists
            occasion={occasion}
            occasionId={occasionId}
            queryClient={queryClient}
          />
          <AddListForm occasionId={occasionId} occasion={occasion} queryClient={queryClient} />
        </>
      )}
    </div>
  );
}

function OccasionHeader({
  occasion,
  occasionId,
  queryClient,
  navigate,
}: {
  occasion: OccasionDetailType;
  occasionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(occasion.name);
  const [description, setDescription] = useState(occasion.description ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updateOccasion(occasionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasion", occasionId] });
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      setEditing(false);
    },
    onError: () => toast.error("Failed to update occasion."),
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateOccasion(occasionId, { is_archived: !occasion.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasion", occasionId] });
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
    },
    onError: () => toast.error("Failed to update occasion."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOccasion(occasionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      navigate("/occasions", { replace: true });
    },
    onError: () => toast.error("Failed to delete occasion."),
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, description: description || undefined });
  }

  function handleDelete() {
    if (window.confirm("Delete this occasion? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  }

  function handleArchiveToggle() {
    if (occasion.is_archived) {
      archiveMutation.mutate();
    } else if (window.confirm("Archive this occasion?")) {
      archiveMutation.mutate();
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="rounded-lg bg-white p-6 shadow space-y-4">

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{occasion.name}</h1>
            {occasion.is_archived && (
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">Archived</span>
            )}
          </div>
          {occasion.description && <p className="mt-2 text-gray-600">{occasion.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleArchiveToggle}
            disabled={archiveMutation.isPending}
            className={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${occasion.is_archived ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {archiveMutation.isPending ? "…" : occasion.is_archived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OccasionLists({
  occasion,
  occasionId,
  queryClient,
}: {
  occasion: OccasionDetailType;
  occasionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const removeMutation = useMutation({
    mutationFn: (listId: number) => removeOccasionItem(occasionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasion", occasionId] });
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
    },
    onError: () => toast.error("Failed to remove list."),
  });

  if (occasion.lists.length === 0) {
    return <p className="text-gray-500">No lists in this occasion.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {occasion.lists.map((list) => (
        <li key={list.id} className="flex items-center justify-between px-4 py-3">
          <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 hover:opacity-75">
            <p className="font-medium text-gray-900">{list.name}</p>
            <ListAttributionLine list={list} />
          </Link>
          <button
            onClick={() => removeMutation.mutate(list.id)}
            disabled={removeMutation.isPending}
            className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddListForm({
  occasionId,
  occasion,
  queryClient,
}: {
  occasionId: number;
  occasion: OccasionDetailType;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [selectedListId, setSelectedListId] = useState("");

  const allLists = useQuery({ queryKey: ["lists"], queryFn: () => getLists() });

  const addMutation = useMutation({
    mutationFn: (listId: number) => addOccasionItem(occasionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasion", occasionId] });
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      setSelectedListId("");
    },
    onError: () => toast.error("Failed to add list."),
  });

  const existingListIds = new Set(occasion.lists.map((l) => l.id));
  const availableLists = (allLists.data ?? []).filter((l) => !existingListIds.has(l.id));

  if (availableLists.length === 0) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedListId) {
      addMutation.mutate(Number(selectedListId));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Add a List</h2>

      <div className="flex gap-2">
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        >
          <option value="">Select a list…</option>
          {availableLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={addMutation.isPending || !selectedListId}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

function ShoppingList({ occasionId }: { occasionId: number }) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["shoppingList", occasionId],
    queryFn: () => getShoppingList(occasionId),
  });

  const purchaseMutation = useMutation({
    mutationFn: ({ listId, giftId }: { listId: number; giftId: number }) =>
      purchaseGift(listId, giftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList", occasionId] });
      toast.success("Marked as purchased!");
    },
    onError: () => toast.error("Failed to mark as purchased."),
  });

  const unpurchaseMutation = useMutation({
    mutationFn: ({ listId, giftId }: { listId: number; giftId: number }) =>
      unpurchaseGift(listId, giftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList", occasionId] });
      toast.success("Marked as not purchased.");
    },
    onError: () => toast.error("Failed to update purchase status."),
  });

  function handleToggle(item: ShoppingListItem) {
    if (item.purchased_at) {
      unpurchaseMutation.mutate({ listId: item.list_id, giftId: item.id });
    } else {
      purchaseMutation.mutate({ listId: item.list_id, giftId: item.id });
    }
  }

  if (isLoading) return <Spinner />;
  if (error) return <p className="text-red-600">Failed to load shopping list.</p>;

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow text-center">
        <p className="text-gray-500">No claimed gifts in this occasion.</p>
        <p className="text-sm text-gray-400 mt-1">Claim gifts from shared lists to see them here.</p>
      </div>
    );
  }

  const purchasedCount = items.filter((i) => i.purchased_at !== null).length;

  // Group items by list_name
  const grouped = items.reduce<Record<string, ShoppingListItem[]>>((acc, item) => {
    if (!acc[item.list_name]) acc[item.list_name] = [];
    acc[item.list_name].push(item);
    return acc;
  }, {});

  const isMutating = purchaseMutation.isPending || unpurchaseMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white px-4 py-3 shadow">
        <p className="text-sm font-medium text-gray-700">
          {purchasedCount} of {items.length} purchased
        </p>
        {purchasedCount === items.length && items.length > 0 && (
          <p className="text-sm text-green-600 mt-0.5">All done!</p>
        )}
      </div>
      {Object.entries(grouped).map(([listName, listItems]) => (
        <div key={listName} className="rounded-lg bg-white shadow overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">{listName}</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {listItems.map((item) => {
              const isPurchased = item.purchased_at !== null;
              return (
                <li key={item.id} className={`flex items-start gap-3 px-4 py-3 ${isPurchased ? "bg-gray-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isPurchased}
                    onChange={() => handleToggle(item)}
                    disabled={isMutating}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:cursor-not-allowed"
                    aria-label={`Mark "${item.name}" as ${isPurchased ? "not purchased" : "purchased"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-medium text-blue-600 hover:underline ${isPurchased ? "line-through text-gray-400" : ""}`}
                        >
                          {item.name}
                        </a>
                      ) : (
                        <span className={`font-medium ${isPurchased ? "line-through text-gray-400" : "text-gray-900"}`}>
                          {item.name}
                        </span>
                      )}
                      {item.price && (
                        <span className={`text-sm ${isPurchased ? "text-gray-400" : "text-gray-500"}`}>
                          ${item.price}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className={`text-sm mt-0.5 ${isPurchased ? "text-gray-400" : "text-gray-500"}`}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
