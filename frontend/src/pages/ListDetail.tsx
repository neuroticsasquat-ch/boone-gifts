import { useState, useRef, useEffect, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { createGift, updateGift, deleteGift, claimGift, unclaimGift } from "../api/gifts";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { fetchUrlMeta } from "../api/meta";
import { getShares, createShare, deleteShare } from "../api/shares";
import { getConnections } from "../api/connections";
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

  useTitle(list?.name ?? "List");

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

      <SharingSection listId={listId} queryClient={queryClient} />
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
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const nameRef = useRef("");
  const descriptionRef = useRef("");
  const priceRef = useRef("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string; url?: string; price?: string }) =>
      createGift(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setUrl("");
      setName("");
      setDescription("");
      setPrice("");
      nameRef.current = "";
      descriptionRef.current = "";
      priceRef.current = "";
      setIsOpen(false);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateName(value: string) {
    setName(value);
    nameRef.current = value;
  }

  function updateDescription(value: string) {
    setDescription(value);
    descriptionRef.current = value;
  }

  function updatePrice(value: string) {
    setPrice(value);
    priceRef.current = value;
  }

  function handleUrlChange(value: string) {
    setUrl(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.startsWith("http://") && !value.startsWith("https://")) return;

    const currentFetchId = ++fetchIdRef.current;

    debounceRef.current = setTimeout(async () => {
      setIsFetching(true);
      try {
        const meta = await fetchUrlMeta(value);
        if (fetchIdRef.current !== currentFetchId) return;
        if (meta.title && !nameRef.current) updateName(meta.title);
        if (meta.description && !descriptionRef.current) updateDescription(meta.description);
        if (meta.price && !priceRef.current) updatePrice(meta.price);
      } catch {
        // Best-effort — ignore failures
      } finally {
        if (fetchIdRef.current === currentFetchId) setIsFetching(false);
      }
    }, 500);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      url: url || undefined,
      price: price || undefined,
    });
  }

  function handleClear() {
    setUrl("");
    updateName("");
    updateDescription("");
    updatePrice("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsFetching(false);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => { if (isOpen) handleClear(); setIsOpen(!isOpen); }}
        className={`flex items-center justify-between w-full rounded px-4 py-2 text-base font-bold text-white uppercase tracking-wide ${isOpen ? "bg-gray-500 hover:bg-gray-600" : "bg-blue-600 hover:bg-blue-700"}`}
      >
        Add a gift
        <span className="ml-2">{isOpen ? "\u25B2" : "\u25BC"}</span>
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow space-y-3">
          {mutation.isError && <p className="text-sm text-red-600">Failed to add gift.</p>}

          {/* Row 1: URL + Price */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <label htmlFor="add-gift-url" className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</span>
              <input
                id="add-gift-url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label htmlFor="add-gift-price" className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</span>
              <input
                id="add-gift-price"
                type="text"
                placeholder={isFetching ? "Loading…" : ""}
                value={price}
                onChange={(e) => updatePrice(e.target.value)}
                className={`mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm sm:w-28${isFetching ? " animate-pulse bg-gray-50" : ""}`}
              />
            </label>
          </div>
          {isFetching && <p className="text-xs text-blue-500 -mt-2">Fetching details…</p>}

          {/* Row 2: Name (full width) */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</span>
            <input
              type="text"
              placeholder={isFetching ? "Loading…" : ""}
              value={name}
              onChange={(e) => updateName(e.target.value)}
              className={`mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm${isFetching ? " animate-pulse bg-gray-50" : ""}`}
              required
            />
          </label>

          {/* Row 3: Description textarea (full width) */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</span>
            <textarea
              placeholder={isFetching ? "Loading…" : ""}
              value={description}
              onChange={(e) => updateDescription(e.target.value)}
              rows={2}
              className={`mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm${isFetching ? " animate-pulse bg-gray-50" : ""}`}
            />
          </label>

          {/* Row 4: Buttons */}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </div>
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
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 md:ml-4">
        {gift.price && <span className="text-sm text-gray-500 md:hidden">${gift.price}</span>}
        <div className="flex gap-2 ml-auto md:ml-0">
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Edit
          </button>
          <DeleteGiftButton giftId={gift.id} listId={listId} queryClient={queryClient} />
        </div>
      </div>
    </li>
  );
}

function GiftInfo({ name, description, url, price }: { name: string; description: string | null; url: string | null; price: string | null }) {
  return (
    <div className="min-w-0 md:flex-1">
      <div className="flex items-baseline justify-between gap-3">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline break-words">
            {name}
          </a>
        ) : (
          <p className="font-semibold text-gray-900 break-words">{name}</p>
        )}
        {price && <span className="hidden md:inline text-sm text-gray-500 shrink-0">${price}</span>}
      </div>
      {description && <p className="text-sm text-gray-500 break-words">{description}</p>}
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
      <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow space-y-3">
        {mutation.isError && <p className="text-sm text-red-600">Failed to update gift.</p>}

        {/* Row 1: URL + Price */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm sm:w-28"
            />
          </label>
        </div>

        {/* Row 2: Name (full width) */}
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        {/* Row 3: Description textarea (full width) */}
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {/* Row 4: Buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
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
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 md:ml-4">
        {gift.price && <span className="text-sm text-gray-500 md:hidden">${gift.price}</span>}
        <div className="ml-auto md:ml-0">{claimButton}</div>
      </div>
    </li>
  );
}

// --- Sharing Section (Owner Only) ---

function SharingSection({
  listId,
  queryClient,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");

  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });

  const addShareMutation = useMutation({
    mutationFn: (userId: number) => createShare(listId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", listId] });
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setSelectedUserId("");
    },
  });

  const removeShareMutation = useMutation({
    mutationFn: (userId: number) => deleteShare(listId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", listId] });
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  const sharedUserIds = new Set((shares.data ?? []).map((s) => s.user_id));
  const availableConnections = (connections.data ?? []).filter((c) => !sharedUserIds.has(c.user.id));
  const hasShares = (shares.data ?? []).length > 0;
  const hasAvailable = availableConnections.length > 0;

  // Build a lookup from user_id to connection user info for displaying share names
  const connectionsByUserId = new Map((connections.data ?? []).map((c) => [c.user.id, c.user]));

  function handleAddShare(e: FormEvent) {
    e.preventDefault();
    if (selectedUserId) {
      addShareMutation.mutate(Number(selectedUserId));
    }
  }

  if (!hasShares && !hasAvailable) return null;

  return (
    <>
      <hr className="border-gray-200" />
      <h2 className="text-lg font-semibold text-gray-900">Sharing</h2>

      {hasAvailable && (
        <form onSubmit={handleAddShare} className="rounded-lg bg-white p-4 shadow">
          {addShareMutation.isError && <p className="text-sm text-red-600 mb-2">Failed to share list.</p>}
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Share with…</option>
              {availableConnections.map((conn) => (
                <option key={conn.user.id} value={conn.user.id}>
                  {conn.user.name} ({conn.user.email})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={addShareMutation.isPending || !selectedUserId}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addShareMutation.isPending ? "Sharing…" : "Share"}
            </button>
          </div>
        </form>
      )}

      {shares.data && shares.data.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {shares.data.map((share) => {
            const user = connectionsByUserId.get(share.user_id);
            return (
              <li key={share.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{user?.name ?? `User ${share.user_id}`}</p>
                  {user?.email && <p className="text-sm text-gray-500">{user.email}</p>}
                </div>
                <button
                  onClick={() => removeShareMutation.mutate(share.user_id)}
                  disabled={removeShareMutation.isPending}
                  className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
