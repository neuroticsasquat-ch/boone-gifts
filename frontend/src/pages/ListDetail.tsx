import { useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { createGift, updateGift, deleteGift, claimGift, unclaimGift } from "../api/gifts";
import { useAuth } from "../hooks/useAuth";
import type { GiftListDetailOwner, GiftListDetailViewer, GiftOwnerView, Gift } from "../types";

function isOwnerView(list: GiftListDetailOwner | GiftListDetailViewer, userId: number): list is GiftListDetailOwner {
  return list.owner_id === userId;
}

export function ListDetail() {
  const { id } = useParams();
  const listId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: list, isLoading, error } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
    enabled: !!id,
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (error || !list) return <p className="text-red-600">Failed to load list.</p>;

  const isOwner = user !== null && isOwnerView(list, user.id);

  return (
    <div className="space-y-6">
      <Link to="/lists" className="text-sm text-blue-600 hover:underline">&larr; Back to lists</Link>

      {isOwner ? (
        <OwnerView list={list} listId={listId} queryClient={queryClient} navigate={navigate} />
      ) : (
        <ViewerView list={list as GiftListDetailViewer} listId={listId} queryClient={queryClient} userId={user!.id} />
      )}
    </div>
  );
}

// --- Owner View ---

function OwnerView({
  list,
  listId,
  queryClient,
  navigate,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      {editing ? (
        <EditListHeader list={list} listId={listId} queryClient={queryClient} onDone={() => setEditing(false)} />
      ) : (
        <ListHeader
          name={list.name}
          description={list.description}
          onEdit={() => setEditing(true)}
          onDelete={
            <DeleteListButton listId={listId} queryClient={queryClient} navigate={navigate} />
          }
        />
      )}

      <AddGiftForm listId={listId} queryClient={queryClient} />

      {list.gifts.length === 0 ? (
        <p className="text-gray-500">No gifts yet. Add one above.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {list.gifts.map((gift) => (
            <OwnerGiftRow key={gift.id} gift={gift} listId={listId} queryClient={queryClient} />
          ))}
        </ul>
      )}
    </>
  );
}

function ListHeader({
  name,
  description,
  subtitle,
  onEdit,
  onDelete,
}: {
  name: string;
  description: string | null;
  subtitle?: string;
  onEdit?: () => void;
  onDelete?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          {description && <p className="mt-2 text-gray-600">{description}</p>}
        </div>
        {(onEdit || onDelete) && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Edit
              </button>
            )}
            {onDelete}
          </div>
        )}
      </div>
    </div>
  );
}

function EditListHeader({
  list,
  listId,
  queryClient,
  onDone,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  onDone: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => updateList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onDone();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow space-y-4">
      {mutation.isError && <p className="text-sm text-red-600">Failed to update list.</p>}
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
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteListButton({
  listId,
  queryClient,
  navigate,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const mutation = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigate("/lists", { replace: true });
    },
  });

  function handleDelete() {
    if (window.confirm("Delete this list? This cannot be undone.")) {
      mutation.mutate();
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={mutation.isPending}
      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {mutation.isPending ? "Deleting…" : "Delete"}
    </button>
  );
}

function AddGiftForm({
  listId,
  queryClient,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string; url?: string; price?: string }) =>
      createGift(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setName("");
      setDescription("");
      setUrl("");
      setPrice("");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      url: url || undefined,
      price: price || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Add a gift</h2>
      {mutation.isError && <p className="text-sm text-red-600 mb-2">Failed to add gift.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          placeholder="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="url"
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {mutation.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

function OwnerGiftRow({
  gift,
  listId,
  queryClient,
}: {
  gift: GiftOwnerView;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditGiftRow gift={gift} listId={listId} queryClient={queryClient} onDone={() => setEditing(false)} />;
  }

  return (
    <li className="flex items-center justify-between px-4 py-3">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex gap-2 shrink-0 ml-4">
        <button
          onClick={() => setEditing(true)}
          className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Edit
        </button>
        <DeleteGiftButton giftId={gift.id} listId={listId} queryClient={queryClient} />
      </div>
    </li>
  );
}

function GiftInfo({ name, description, url, price }: { name: string; description: string | null; url: string | null; price: string | null }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-gray-900">{name}</p>
      {description && <p className="text-sm text-gray-500 truncate">{description}</p>}
      <div className="flex gap-3 mt-0.5">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
            {url}
          </a>
        )}
        {price && <span className="text-sm text-gray-500">${price}</span>}
      </div>
    </div>
  );
}

function EditGiftRow({
  gift,
  listId,
  queryClient,
  onDone,
}: {
  gift: GiftOwnerView;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  onDone: () => void;
}) {
  const [name, setName] = useState(gift.name);
  const [description, setDescription] = useState(gift.description ?? "");
  const [url, setUrl] = useState(gift.url ?? "");
  const [price, setPrice] = useState(gift.price ?? "");

  const mutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; url?: string; price?: string }) =>
      updateGift(listId, gift.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onDone();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      url: url || undefined,
      price: price || undefined,
    });
  }

  return (
    <li className="px-4 py-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        {mutation.isError && <p className="text-sm text-red-600">Failed to update gift.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Name *"
            required
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Description"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="URL"
          />
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Price"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

function DeleteGiftButton({
  giftId,
  listId,
  queryClient,
}: {
  giftId: number;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const mutation = useMutation({
    mutationFn: () => deleteGift(listId, giftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {mutation.isPending ? "…" : "Delete"}
    </button>
  );
}

// --- Viewer View ---

function ViewerView({
  list,
  listId,
  queryClient,
  userId,
}: {
  list: GiftListDetailViewer;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  userId: number;
}) {
  return (
    <>
      <ListHeader
        name={list.name}
        description={list.description}
        subtitle={`from ${list.owner_name}`}
      />

      {list.gifts.length === 0 ? (
        <p className="text-gray-500">No gifts on this list yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {list.gifts.map((gift) => (
            <ViewerGiftRow key={gift.id} gift={gift} listId={listId} queryClient={queryClient} userId={userId} />
          ))}
        </ul>
      )}
    </>
  );
}

function ViewerGiftRow({
  gift,
  listId,
  queryClient,
  userId,
}: {
  gift: Gift;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  userId: number;
}) {
  const claimMutation = useMutation({
    mutationFn: () => claimGift(listId, gift.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
    },
  });

  const unclaimMutation = useMutation({
    mutationFn: () => unclaimGift(listId, gift.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
    },
  });

  const isPending = claimMutation.isPending || unclaimMutation.isPending;

  let claimButton: React.ReactNode;
  if (gift.claimed_by_id === null) {
    claimButton = (
      <button
        onClick={() => claimMutation.mutate()}
        disabled={isPending}
        className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {claimMutation.isPending ? "Claiming…" : "Claim"}
      </button>
    );
  } else if (gift.claimed_by_id === userId) {
    claimButton = (
      <button
        onClick={() => unclaimMutation.mutate()}
        disabled={isPending}
        className="rounded bg-yellow-600 px-3 py-1 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
      >
        {unclaimMutation.isPending ? "Unclaiming…" : "Unclaim"}
      </button>
    );
  } else {
    claimButton = (
      <span className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-500">Claimed</span>
    );
  }

  return (
    <li className="flex items-center justify-between px-4 py-3">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="shrink-0 ml-4">{claimButton}</div>
    </li>
  );
}
