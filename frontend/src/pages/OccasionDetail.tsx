import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { getOccasion, getOccasionLists, updateOccasion } from "../api/occasions";
import { getFamily } from "../api/families";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { HeaderMenu } from "../components/HeaderMenu";
import { ListAttributionLine, RecipientLine } from "../components/ListAttribution";
import { MyShopping } from "../components/MyShopping";
import { TabBar } from "../components/TabBar";
import type { Occasion } from "../types";

/**
 * The tabs the occasion page carries (project spec §9.2). The bar is driven by
 * this array and the body by the active key, which is what made **My shopping**
 * an entry here plus its panel rather than a reshaping of the page.
 */
const TABS = [
  { key: "lists", label: "Lists" },
  { key: "shopping", label: "My shopping" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ORGANIZER_ONLY = "Only an organizer can rename or archive an occasion.";

/**
 * A family occasion — "Boone Family · Christmas 2026" — and the lists shared to
 * it (project spec §9.2). The route the nav project retired, reintroduced with
 * the family meaning of the word (`docs/adr/0002-occasion-and-folder.md`).
 *
 * An **archived** occasion renders exactly like an active one. Archiving blocks
 * new shares and nothing else (project spec §5.4): its lists stay viewable and
 * its page stays a page — archiving only takes it out of the default views.
 */
export function OccasionDetail() {
  const { id } = useParams();
  const occasionId = Number(id);

  const occasion = useQuery({
    queryKey: ["occasion", occasionId],
    queryFn: () => getOccasion(occasionId),
    enabled: Number.isFinite(occasionId),
  });

  useTitle(occasion.data?.name ?? "Occasion");

  if (occasion.isPending) return <Spinner />;
  if (occasion.isError) {
    // 403 and 404 are the same answer to the viewer — the backend will not say
    // which, and neither will this. "Try again" is only offered where trying
    // again could work, because on those two it never will.
    const status = isAxiosError(occasion.error) ? occasion.error.response?.status : undefined;
    const unreachable = status === 403 || status === 404;
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">
          {unreachable
            ? "This occasion doesn't exist, or it belongs to a family you're not in."
            : "Failed to load occasion."}
        </p>
        {unreachable ? (
          <Link to="/people" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Back to People
          </Link>
        ) : (
          <button
            onClick={() => occasion.refetch()}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return <OccasionPage occasion={occasion.data} />;
}

function OccasionPage({ occasion }: { occasion: Occasion }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>(TABS[0].key);

  // The family behind the occasion: its name for the header and the back link,
  // and its members for the organizer gate. Keyed as the family page keys it,
  // so arriving from there costs no request.
  const family = useQuery({
    queryKey: ["family", occasion.family_id],
    queryFn: () => getFamily(occasion.family_id),
  });

  const isOrganizer =
    family.data?.members.find((m) => m.user_id === user?.id)?.role === "organizer";

  return (
    <div className="space-y-6">
      <Link
        to={`/people/families/${occasion.family_id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; {family.data?.name ?? "Back to family"}
      </Link>

      <OccasionHeader occasion={occasion} isOrganizer={isOrganizer} />

      <TabBar tabs={TABS} active={tab} onSelect={setTab} label="Occasion sections" />

      {tab === "lists" ? (
        <ListsTab occasionId={occasion.id} />
      ) : (
        <MyShopping scope={{ kind: "occasion", id: occasion.id }} />
      )}
    </div>
  );
}

/**
 * The occasion's name, whether it is archived, and the organizer's controls.
 *
 * Rename and archive are **organizer-only**, gated the same way the family
 * page's member controls are — and enforced by the backend regardless, which is
 * why a 403 still has a message to show.
 */
function OccasionHeader({ occasion, isOrganizer }: { occasion: Occasion; isOrganizer: boolean }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(occasion.name);
  const [actionError, setActionError] = useState<string | null>(null);

  // The page's own copy, and the family page's list it was reached from —
  // prefix match on the latter, so the active and archived lists both refetch.
  // `share-targets` goes too: a rename changes a label list detail's sharing
  // summary prints ("Boone Family · Christmas 2026"), and archiving changes
  // whether that occasion can still be shared to at all.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["occasion", occasion.id] });
    queryClient.invalidateQueries({ queryKey: ["occasions", occasion.family_id] });
    queryClient.invalidateQueries({ queryKey: ["share-targets"] });
  };

  function handleError(err: unknown, fallback: string) {
    if (isAxiosError(err) && err.response?.status === 403) {
      setActionError(ORGANIZER_ONLY);
    } else {
      toast.error(fallback);
    }
  }

  const renameMutation = useMutation({
    mutationFn: (newName: string) => updateOccasion(occasion.id, { name: newName }),
    onSuccess: () => {
      invalidate();
      setRenaming(false);
      setActionError(null);
    },
    onError: (err) => handleError(err, "Failed to rename the occasion."),
  });

  const setArchivedMutation = useMutation({
    mutationFn: (isArchived: boolean) => updateOccasion(occasion.id, { is_archived: isArchived }),
    onSuccess: (_data, isArchived) => {
      invalidate();
      setActionError(null);
      toast.success(isArchived ? "Occasion archived." : "Occasion unarchived.");
    },
    onError: (err) => handleError(err, "Failed to archive the occasion."),
  });

  function handleRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    renameMutation.mutate(trimmed);
  }

  // Archiving takes the occasion out of every default view, so it is confirmed
  // — the same as the archive item in list detail's `⋯` menu. Unarchiving puts
  // it back and asks nothing.
  function handleArchiveToggle() {
    if (occasion.is_archived) {
      setArchivedMutation.mutate(false);
    } else if (window.confirm("Archive this occasion? Lists already shared to it stay shared.")) {
      setArchivedMutation.mutate(true);
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      {renaming ? (
        <form onSubmit={handleRename} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="occasion-name">
            Occasion name
          </label>
          <input
            id="occasion-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={renameMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setRenaming(false);
              setName(occasion.name);
            }}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{occasion.name}</h1>
            {occasion.is_archived && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Archived
              </span>
            )}
          </div>
          {isOrganizer && (
            <HeaderMenu
              ariaLabel="Occasion actions"
              pending={renameMutation.isPending || setArchivedMutation.isPending}
              items={[
                {
                  label: "Rename",
                  onClick: () => {
                    setName(occasion.name);
                    setRenaming(true);
                  },
                },
                {
                  label: occasion.is_archived ? "Unarchive" : "Archive",
                  onClick: handleArchiveToggle,
                },
              ]}
            />
          )}
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
    </div>
  );
}

/** Every list shared to this occasion that the viewer can see. */
function ListsTab({ occasionId }: { occasionId: number }) {
  const { user } = useAuth();

  const lists = useQuery({
    queryKey: ["occasion-lists", occasionId],
    queryFn: () => getOccasionLists(occasionId),
  });

  if (lists.isPending) return <Spinner />;
  if (lists.isError) return <p className="text-sm text-red-600">Couldn&apos;t load lists.</p>;
  if (lists.data.length === 0) {
    return <p className="text-gray-500">No lists are shared to this occasion yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {lists.data.map((list) => (
        <li key={list.id}>
          <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
            <p className="font-medium text-gray-900">{list.name}</p>
            {/* The viewer's own list reads as their own row does elsewhere —
                "from Tom" on your own list would be nonsense. Every other list
                reached this page through this occasion, so the row names the
                person it came from rather than repeating the family overhead. */}
            {list.owner_id === user?.id ? (
              <RecipientLine list={list} />
            ) : (
              <ListAttributionLine list={list} />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
