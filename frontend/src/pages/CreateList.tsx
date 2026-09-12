import { useCallback, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { createList } from "../api/lists";
import { createShare } from "../api/shares";
import { getConnections } from "../api/connections";
import { getAccount } from "../api/account";
import { joinNames, sharedWithSentence } from "../lib/sharing-summary";
import { useTitle } from "../hooks/useTitle";
import { useEnumSearchParam } from "../hooks/useSearchParamState";
import { useNavigationDepth } from "../contexts/NavigationDepthContext";
import { ListForFields } from "../components/ListForFields";
import { DraftSharingModal } from "../components/DraftSharingModal";
import type { SharingSelection } from "../components/SharingModal";
import {
  LIST_FOR_UNANSWERED,
  listForIncomplete,
  listForPayload,
  type ListForValue,
} from "../lib/list-for";

/** An open modal is a place you can be, so `?share=open` is the whole state and
 *  a shut one leaves no trace: setting the fallback writes `null`. */
const SHARE_VALUES = ["open", "closed"] as const;

/** Nothing is pre-checked. A list created to hold a private idea must not be
 *  visible to a family before its first gift is added, and "uncheck any you'd
 *  rather keep it from" is the wrong direction for a sharing control — the one
 *  user-visible behaviour change in this project (project spec §12). */
const SHARES_NOTHING: SharingSelection = { familyOccasions: {}, userIds: [] };

export function CreateList() {
  useTitle("New List");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selection, setSelection] = useState<SharingSelection>(SHARES_NOTHING);
  const [listFor, setListFor] = useState<ListForValue>(LIST_FOR_UNANSWERED);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // The same dialog the list page mounts, at the same address and closed the
  // same way — so the mobile Back gesture shuts it instead of abandoning the
  // half-typed form (CONTEXT.md rule 8).
  const [share, setShare] = useEnumSearchParam("share", {
    mode: "push",
    values: SHARE_VALUES,
    fallback: "closed",
  });
  const depth = useNavigationDepth();
  const [, setSearchParams] = useSearchParams();

  const stripShare = useCallback(() => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete("share");
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // One close path, depth-aware, mirroring `ListDetail`'s: the app pushed the
  // open entry, so popping lands exactly where the viewer was, and Back after
  // Done leaves the form rather than reopening the dialog. At depth 0 — a deep
  // link straight to `/lists/new?share=open` — there is nothing of ours behind
  // us, so strip instead. The form is unmounted by neither, so the name, the
  // description and the selections survive.
  function closeSharing() {
    if (depth > 0) navigate(-1);
    else stripShare();
  }

  // On a shared account every list says who it is for, and the answer is required
  // (project spec §5.2).
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });

  // Only to name someone a share failed for, so it is not asked until somebody
  // is ticked — by which time the dialog has already answered it.
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: getConnections,
    enabled: selection.userIds.length > 0,
  });

  function nameOf(userId: number): string {
    return (
      (connections.data ?? []).find((c) => c.user.id === userId)?.user.name ?? `User ${userId}`
    );
  }

  /**
   * `POST /lists` carries the occasions and has no `user_ids`, so the people
   * ticked are one call each — and one failing must not abandon the rest.
   *
   * It never throws: the list exists by now, and the page being navigated to is
   * exactly where the failure is fixed. Naming the people is what makes the
   * message actionable; "some shares failed" would leave the owner comparing
   * two lists by hand.
   */
  async function shareWithPeople(listId: number) {
    if (selection.userIds.length === 0) return;
    const results = await Promise.allSettled(
      selection.userIds.map((userId) => createShare(listId, userId)),
    );
    const failed = selection.userIds.filter((_, i) => results[i].status === "rejected");
    if (failed.length === 0) return;
    toast.error(
      `Your list was created, but we couldn't share it with ${joinNames(failed.map(nameOf))}. Try again from Change.`,
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
        ...listForPayload(listFor),
        occasion_ids: Object.values(selection.familyOccasions),
      });
      await shareWithPeople(list.id);
      navigate(`/lists/${list.id}`, { replace: true });
    } catch (err) {
      // The one 409 here is an occasion archived between this form loading and
      // being submitted. "Try again" would be a lie: the same submission will
      // keep failing until the owner changes what it asks for. The share calls
      // are only reached once the list is created, so they are not this.
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
        {/* The rows themselves are in the dialog, not inlined here: the modal is
            built as a column with a fixed header and footer precisely so the
            filter and the summary stay in reach across ~58 rows, and a create
            form for a list most users share with nobody would otherwise open
            that many rows tall. The summary stays on the form, because a user
            who ticked three families must see some trace of it before
            submitting. */}
        <section className="mb-6">
          <h2 className="text-sm font-medium text-gray-700">Who can see this list</h2>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-900">
                {sharedWithSentence(
                  Object.keys(selection.familyOccasions).length,
                  selection.userIds.length,
                )}
              </p>
              {/* The half of the retired hint that is still true: what went was
                  "uncheck any you'd rather keep it from". */}
              <p className="text-sm text-gray-500">
                You can change this later from the list itself.
              </p>
            </div>
            {/* `Choose…`, not `Change`: the list page's control changes a
                sharing state that exists, and this form's default is nothing. */}
            <button
              type="button"
              onClick={() => setShare("open")}
              className="shrink-0 rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
              Choose…
            </button>
          </div>
        </section>
        <div className="flex gap-3">
          <button
            type="submit"
            // The families and occasions reads no longer gate this: with nothing
            // pre-checked, submitting before they answer shares with nobody,
            // which is precisely what was asked for.
            disabled={
              submitting || listForIncomplete(listFor, account.data?.is_shared_account ?? false)
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

      {share === "open" && (
        <DraftSharingModal
          selection={selection}
          onChange={setSelection}
          onClose={closeSharing}
        />
      )}
    </div>
  );
}
