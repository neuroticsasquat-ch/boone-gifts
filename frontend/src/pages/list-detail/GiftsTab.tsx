import { useState, useRef, useEffect, useMemo, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { isAxiosError } from "axios";
import { createGift, updateGift, deleteGift, claimGift, unclaimGift, purchaseGift, unpurchaseGift } from "../../api/gifts";
import { fetchUrlMeta } from "../../api/meta";
import type { ClaimOccasion, GiftListDetailOwner, GiftListDetailViewer, GiftOwnerView, Gift } from "../../types";
import { formatMoney } from "../../lib/money";
import toast from "react-hot-toast";

interface GiftsTabProps {
  list: GiftListDetailOwner | GiftListDetailViewer;
  listId: number;
  isOwner: boolean;
  userId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

export function GiftsTab({ list, listId, isOwner, userId, queryClient }: GiftsTabProps) {
  if (isOwner) {
    return <OwnerGifts list={list as GiftListDetailOwner} listId={listId} queryClient={queryClient} />;
  }
  return <ViewerGifts list={list as GiftListDetailViewer} listId={listId} queryClient={queryClient} userId={userId} />;
}

// --- Owner Gifts ---

function OwnerGifts({
  list,
  listId,
  queryClient,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [giftSort, setGiftSort] = useState<"added" | "price_asc" | "price_desc">("added");

  const sortedGifts = useMemo(() => {
    if (giftSort === "added") return list.gifts;
    return [...list.gifts].sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return giftSort === "price_asc"
        ? Number(a.price) - Number(b.price)
        : Number(b.price) - Number(a.price);
    });
  }, [list.gifts, giftSort]);

  return (
    <>
      <AddGiftForm listId={listId} queryClient={queryClient} />

      {list.gifts.length === 0 ? (
        <p className="text-gray-500">No gifts yet. Add one above.</p>
      ) : (
        <>
          <div className="flex justify-end">
            <select
              value={giftSort}
              onChange={(e) => setGiftSort(e.target.value as "added" | "price_asc" | "price_desc")}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="added">As added</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          </div>
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sortedGifts.map((gift) => (
              <OwnerGiftRow key={gift.id} gift={gift} listId={listId} queryClient={queryClient} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// --- Viewer Gifts ---

function ViewerGifts({
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
  const [giftFilter, setGiftFilter] = useState<"all" | "available" | "mine">("all");
  const [giftSort, setGiftSort] = useState<"added" | "price_asc" | "price_desc">("added");

  const filteredGifts = useMemo(() => {
    let gifts = list.gifts;
    if (giftFilter === "available") gifts = gifts.filter((g) => g.claimed_by_id === null);
    if (giftFilter === "mine") gifts = gifts.filter((g) => g.claimed_by_id === userId);

    if (giftSort === "price_asc") {
      gifts = [...gifts].sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return Number(a.price) - Number(b.price);
      });
    } else if (giftSort === "price_desc") {
      gifts = [...gifts].sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return Number(b.price) - Number(a.price);
      });
    }
    return gifts;
  }, [list.gifts, giftFilter, giftSort, userId]);

  return (
    <>
      {list.is_archived && (
        <p className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800 border border-yellow-200">
          This list has been archived.
        </p>
      )}

      {list.gifts.length === 0 ? (
        <p className="text-gray-500">No gifts on this list yet.</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            <select
              value={giftFilter}
              onChange={(e) => setGiftFilter(e.target.value as "all" | "available" | "mine")}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="all">All gifts</option>
              <option value="available">Still available</option>
              <option value="mine">I'm getting</option>
            </select>
            <select
              value={giftSort}
              onChange={(e) => setGiftSort(e.target.value as "added" | "price_asc" | "price_desc")}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="added">As added</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          </div>
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {filteredGifts.map((gift) => (
              <ViewerGiftRow
                key={gift.id}
                gift={gift}
                listId={listId}
                queryClient={queryClient}
                userId={userId}
                isArchived={list.is_archived}
                candidates={list.claim_candidates}
                options={list.claim_options}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// --- Shared Components ---

function GiftInfo({ name, description, url, price }: { name: string; description: string | null; url: string | null; price: string | null }) {
  const priceText = formatMoney(price);
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
        {priceText && <span className="hidden md:inline text-sm text-gray-500 shrink-0">{priceText}</span>}
      </div>
      {description && <p className="text-sm text-gray-500 break-words">{description}</p>}
    </div>
  );
}

// --- Owner Gift Components ---

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
        <span className="ml-2">{isOpen ? "▲" : "▼"}</span>
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
  const priceText = formatMoney(gift.price);

  if (editing) {
    return <EditGiftRow gift={gift} listId={listId} queryClient={queryClient} onDone={() => setEditing(false)} />;
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 md:ml-4">
        {priceText && <span className="text-sm text-gray-500 md:hidden">{priceText}</span>}
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
    onError: () => toast.error("Failed to delete gift."),
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

// --- Viewer Gift Components ---

function ViewerGiftRow({
  gift,
  listId,
  queryClient,
  userId,
  isArchived,
  candidates,
  options,
}: {
  gift: Gift;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  userId: number;
  isArchived: boolean;
  candidates: ClaimOccasion[];
  options: ClaimOccasion[];
}) {
  // The whole prompting rule. Two or more candidates is the *only* shape with a
  // genuine choice in it; 0 and 1 are the overwhelmingly common path and stay
  // exactly as fast as they are today — one click, no question asked.
  const mustAsk = candidates.length >= 2;
  const [choosing, setChoosing] = useState(false);

  const claimMutation = useMutation({
    mutationFn: (occasionId?: number) => claimGift(listId, gift.id, occasionId),
    onSuccess: () => {
      setChoosing(false);
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
    },
    onError: (err) => {
      // 400 `ambiguous_occasion` means this client failed to prompt when it
      // should have — a bug signal, not a routine branch. The one innocent way
      // to reach it is a share added while the page sat open, turning one
      // candidate into two, so refetch and let the user click again.
      if (isAxiosError(err) && err.response?.status === 400 && err.response.data?.detail === "ambiguous_occasion") {
        // Reported, not just recovered from. A share added while the page sat
        // open is the one innocent way here; every other way is this client
        // having stopped prompting, which nothing else would ever catch.
        Sentry.captureException(err, { tags: { claim_filing: "ambiguous_occasion" } });
        queryClient.invalidateQueries({ queryKey: ["list", listId] });
        toast.error("This list reaches more occasions than it did a moment ago. Try again to choose one.");
        return;
      }
      toast.error("Failed to claim gift.");
    },
  });

  const unclaimMutation = useMutation({
    mutationFn: () => unclaimGift(listId, gift.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
    },
    onError: () => toast.error("Failed to unclaim gift."),
  });

  const isPending = claimMutation.isPending || unclaimMutation.isPending;

  const isMine = gift.claimed_by_id === userId;
  const isTaken = gift.claimed_by_id !== null && !isMine;
  const isAvailable = gift.claimed_by_id === null;

  let rowStyle = "";
  let actionButton: React.ReactNode = null;

  if (isMine) {
    rowStyle = "border-l-4 border-green-500 bg-green-50";
    if (!isArchived) {
      actionButton = (
        <button
          onClick={() => {
            if (window.confirm("Are you sure you no longer want to get this gift?")) {
              unclaimMutation.mutate();
            }
          }}
          disabled={isPending}
          className="rounded bg-yellow-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {unclaimMutation.isPending ? "Saving…" : "Never mind"}
        </button>
      );
    }
  } else if (isTaken) {
    rowStyle = "bg-gray-50 opacity-50";
  } else if (isAvailable && !isArchived) {
    actionButton = (
      <button
        onClick={() => (mustAsk ? setChoosing(true) : claimMutation.mutate(undefined))}
        disabled={isPending || choosing}
        className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {claimMutation.isPending ? "Saving…" : "I'll get this"}
      </button>
    );
  }

  const priceText = formatMoney(gift.price);

  return (
    <li className={`px-4 py-2 ${rowStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {isMine && <span className="text-xs text-green-700">✓ Yours</span>}
          {isTaken && <span className="text-xs text-gray-400">Taken</span>}
          {actionButton}
        </div>
      </div>
      {priceText && <p className="text-xs text-gray-400 mt-0.5">{priceText}</p>}
      {/* Gated on `mustAsk` as well as `choosing`: a refetch — including the one
          the 400 handler fires — can drop the candidates below two while the
          picker is open, and a picker with nothing left to choose strands the
          user on a permanently disabled Save. Closing it returns them to a
          button that now claims in one click, which is the right answer. */}
      {choosing && mustAsk && (
        <ClaimOccasionPrompt
          giftId={gift.id}
          candidates={candidates}
          options={options}
          isSaving={claimMutation.isPending}
          onCancel={() => setChoosing(false)}
          onChoose={(occasionId) => claimMutation.mutate(occasionId)}
        />
      )}
      {/* Shown on an archived list too, read-only: archiving takes the actions
          away, not the record of what the claimer already bought. */}
      {isMine && (
        <PurchaseControl
          gift={gift}
          listId={listId}
          queryClient={queryClient}
          disabled={isPending || isArchived}
        />
      )}
    </li>
  );
}

/** How an occasion reads when two families both have one called "Christmas
 * 2026" — family first, matching the sharing summary line. An archived occasion
 * says so, the way an archived share target does on the sharing panel. */
function claimOccasionLabel(occasion: ClaimOccasion): string {
  const base = `${occasion.family.name} · ${occasion.name}`;
  return occasion.is_archived ? `${base} — archived` : base;
}

/** The one question asked before a claim with a genuine choice behind it
 * commits: which occasion to file it under (project spec §6.2).
 *
 * Reached only from `claim_candidates.length >= 2`. The filing is the claimer's
 * private record of their own spend and nobody else can see it, so this asks
 * once and never again for that gift — correcting it afterwards belongs to the
 * occasion's shopping tab (NEU-1274).
 *
 * **Nothing is pre-selected.** Picking the first candidate for the user would
 * be a guess recorded as a fact, and the sharing control already refuses the
 * identical shape client-side: choosing before committing, never after.
 *
 * `claim_options` is the wider `allowed` set, so an occasion that is no longer
 * suggested — an archived one — is still reachable behind "Show past
 * occasions". That is what makes the late-January claim filable under the
 * Christmas it was actually for (NEU-1269 spec §2.2).
 */
function ClaimOccasionPrompt({
  giftId,
  candidates,
  options,
  isSaving,
  onChoose,
  onCancel,
}: {
  giftId: number;
  candidates: ClaimOccasion[];
  options: ClaimOccasion[];
  isSaving: boolean;
  onChoose: (occasionId: number) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState("");
  const [showingPast, setShowingPast] = useState(false);

  const past = useMemo(() => {
    const suggested = new Set(candidates.map((o) => o.id));
    return options.filter((o) => !suggested.has(o.id));
  }, [candidates, options]);

  const choosable = showingPast ? [...candidates, ...past] : candidates;
  const selectId = `claim-occasion-${giftId}`;

  return (
    <div className="mt-1 space-y-1">
      <label htmlFor={selectId} className="block text-xs text-gray-600">
        Which occasion is this for?
      </label>
      <select
        id={selectId}
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        className="block w-full max-w-xs rounded border border-gray-300 px-2 py-1 text-sm sm:w-auto"
      >
        <option value="">Choose an occasion…</option>
        {choosable.map((occasion) => (
          <option key={occasion.id} value={occasion.id}>
            {claimOccasionLabel(occasion)}
          </option>
        ))}
      </select>
      {past.length > 0 && !showingPast && (
        <button
          type="button"
          onClick={() => setShowingPast(true)}
          className="block text-xs text-blue-600 hover:underline"
        >
          Show past occasions
        </button>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChoose(Number(chosen))}
          disabled={chosen === "" || isSaving}
          className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The claimer's own purchase state on a gift they have claimed: the tick, what
 * they paid, and the prompt that asks.
 *
 * Ticking **reveals** the prompt rather than recording the purchase — Save and
 * Skip are what commit it, so an amount the user meant to type is never lost to
 * a tick they wandered away from. Skip stays one click (project spec §6.3), and
 * unticking an unanswered prompt abandons it.
 *
 * Correcting a recorded amount is untick-then-tick: the server keeps
 * `amount_paid` through an untick, so re-ticking seeds the prompt with it.
 * There is deliberately no in-place edit here — post-hoc correction belongs to
 * the occasion's shopping tab (project spec §6.2, NEU-1274), which has the
 * claim id this payload does not carry.
 *
 * Rendered only for the claimer, and only ever inside the viewer row: the list's
 * owner sees no claim state at all, and `GiftOwnerView` carries none to render.
 */
function PurchaseControl({
  gift,
  listId,
  queryClient,
  disabled,
}: {
  gift: Gift;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  disabled: boolean;
}) {
  const isPurchased = gift.purchased_at !== null;
  const [prompting, setPrompting] = useState(false);
  const [amount, setAmount] = useState("");

  const purchaseMutation = useMutation({
    // `undefined` is Skip — the field goes unset and the server leaves any
    // amount already recorded alone. An explicit null clears it.
    mutationFn: (amountPaid: string | null | undefined) => purchaseGift(listId, gift.id, amountPaid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      setPrompting(false);
    },
    onError: () => toast.error("Failed to record the purchase."),
  });

  const unpurchaseMutation = useMutation({
    mutationFn: () => unpurchaseGift(listId, gift.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
    },
    onError: () => toast.error("Failed to update the purchase."),
  });

  const isSaving = purchaseMutation.isPending || unpurchaseMutation.isPending;

  function openPrompt() {
    // Seeded from what the claimer themselves recorded, never from the owner's
    // asking price: a budget pre-filled with someone else's number reads as
    // fact and is a guess.
    setAmount(gift.amount_paid ?? "");
    setPrompting(true);
  }

  function handleToggle() {
    // Unticking a prompt that has not been answered abandons it. Nothing was
    // recorded by the tick, so there is nothing to undo on the server.
    if (prompting) {
      setPrompting(false);
    } else if (isPurchased) {
      unpurchaseMutation.mutate();
    } else {
      openPrompt();
    }
  }

  function handleSave() {
    const trimmed = amount.trim();
    purchaseMutation.mutate(trimmed === "" ? null : trimmed);
  }

  const amountFieldId = `purchase-amount-${gift.id}`;
  const paidText = formatMoney(gift.amount_paid);
  const priceText = formatMoney(gift.price);

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={isPurchased || prompting}
            onChange={handleToggle}
            disabled={disabled || isSaving}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:cursor-not-allowed"
          />
          Bought
        </label>
        {isPurchased &&
          (paidText ? (
            <span className="text-xs text-gray-600">you paid {paidText}</span>
          ) : (
            // An understated total must read as an understatement, never as
            // fact (project spec §7).
            <span className="text-xs text-gray-400">no amount recorded</span>
          ))}
      </div>

      {prompting && (
        <div className="mt-1 space-y-1">
          <label htmlFor={amountFieldId} className="block text-xs text-gray-600">
            What did you pay?
          </label>
          <div className="flex items-center gap-2">
            <input
              id={amountFieldId}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            {/* The owner's asking price, as a hint beside the field and never
                inside it (project spec §6.3). */}
            {priceText && <span className="text-xs text-gray-400">listed at {priceText}</span>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {purchaseMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => purchaseMutation.mutate(undefined)}
              disabled={isSaving}
              className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
