import { useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCollection,
  updateCollection,
  deleteCollection,
  addCollectionItem,
  removeCollectionItem,
  getShoppingList,
} from "../api/collections";
import { purchaseGift, unpurchaseGift } from "../api/gifts";
import { getLists } from "../api/lists";
import type { CollectionDetail as CollectionDetailType, ShoppingListItem } from "../types";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";

export function CollectionDetail() {
  const { id } = useParams();
  const collectionId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showShoppingList, setShowShoppingList] = useState(false);

  const { data: collection, isLoading, error, refetch } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => getCollection(collectionId),
    enabled: !!id,
  });

  useTitle(collection?.name ?? "Collection");

  if (isLoading) return <Spinner />;
  if (error || !collection) return (
    <div className="text-center py-12">
      <p className="text-red-600">Failed to load collection.</p>
      <button onClick={() => refetch()} className="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link to="/collections" className="text-sm text-blue-600 hover:underline">&larr; Back to collections</Link>
      <CollectionHeader
        collection={collection}
        collectionId={collectionId}
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
        <ShoppingList collectionId={collectionId} />
      ) : (
        <>
          <CollectionLists
            collection={collection}
            collectionId={collectionId}
            queryClient={queryClient}
          />
          <AddListForm collectionId={collectionId} collection={collection} queryClient={queryClient} />
        </>
      )}
    </div>
  );
}

function CollectionHeader({
  collection,
  collectionId,
  queryClient,
  navigate,
}: {
  collection: CollectionDetailType;
  collectionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updateCollection(collectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditing(false);
    },
    onError: () => toast.error("Failed to update collection."),
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateCollection(collectionId, { is_archived: !collection.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: () => toast.error("Failed to update collection."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCollection(collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      navigate("/collections", { replace: true });
    },
    onError: () => toast.error("Failed to delete collection."),
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, description: description || undefined });
  }

  function handleDelete() {
    if (window.confirm("Delete this collection? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  }

  function handleArchiveToggle() {
    if (collection.is_archived) {
      archiveMutation.mutate();
    } else if (window.confirm("Archive this collection?")) {
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
            <h1 className="text-2xl font-bold text-gray-900">{collection.name}</h1>
            {collection.is_archived && (
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">Archived</span>
            )}
          </div>
          {collection.description && <p className="mt-2 text-gray-600">{collection.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleArchiveToggle}
            disabled={archiveMutation.isPending}
            className={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${collection.is_archived ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {archiveMutation.isPending ? "…" : collection.is_archived ? "Unarchive" : "Archive"}
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

function CollectionLists({
  collection,
  collectionId,
  queryClient,
}: {
  collection: CollectionDetailType;
  collectionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const removeMutation = useMutation({
    mutationFn: (listId: number) => removeCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: () => toast.error("Failed to remove list."),
  });

  if (collection.lists.length === 0) {
    return <p className="text-gray-500">No lists in this collection.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {collection.lists.map((list) => (
        <li key={list.id} className="flex items-center justify-between px-4 py-3">
          <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 hover:opacity-75">
            <p className="font-medium text-gray-900">{list.name}</p>
            <p className="text-sm text-gray-500">by {list.owner_name}</p>
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
  collectionId,
  collection,
  queryClient,
}: {
  collectionId: number;
  collection: CollectionDetailType;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [selectedListId, setSelectedListId] = useState("");

  const allLists = useQuery({ queryKey: ["lists"], queryFn: () => getLists() });

  const addMutation = useMutation({
    mutationFn: (listId: number) => addCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setSelectedListId("");
    },
    onError: () => toast.error("Failed to add list."),
  });

  const existingListIds = new Set(collection.lists.map((l) => l.id));
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

function ShoppingList({ collectionId }: { collectionId: number }) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["shoppingList", collectionId],
    queryFn: () => getShoppingList(collectionId),
  });

  const purchaseMutation = useMutation({
    mutationFn: ({ listId, giftId }: { listId: number; giftId: number }) =>
      purchaseGift(listId, giftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList", collectionId] });
      toast.success("Marked as purchased!");
    },
    onError: () => toast.error("Failed to mark as purchased."),
  });

  const unpurchaseMutation = useMutation({
    mutationFn: ({ listId, giftId }: { listId: number; giftId: number }) =>
      unpurchaseGift(listId, giftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList", collectionId] });
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
        <p className="text-gray-500">No claimed gifts in this collection.</p>
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
