import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { getConnectionRequests, acceptConnection, deleteConnection } from "../api/connections";
import {
  getIncomingFamilyInvites,
  acceptFamilyInvite,
  declineFamilyInvite,
} from "../api/families";
import { dismissArchivePrompt, getArchivePrompts, updateOccasion } from "../api/occasions";
import { ConfirmDialog, type ConfirmAction } from "./ConfirmDialog";
import type { ArchivePrompt } from "../types";

const ARCHIVE_ACTIONS: ConfirmAction[] = [{ id: "archive", label: "Archive", tone: "danger" }];

/**
 * Longer than `OccasionDetail`'s, deliberately. Someone there went looking for
 * the control and has the occasion's lists on screen; someone here was
 * interrupted by a question they did not ask, on a page about something else,
 * so the reassurance has to travel with the question.
 */
const ARCHIVE_BODY =
  "Lists already shared to it stay shared — archiving only stops new ones. Your shopping for it stays where it is.";

/**
 * Everything waiting on the user's decision — incoming connection requests,
 * family invites, and occasions the app is asking them to close out — with the
 * answers inline.
 *
 * Mounted above the lists on /lists and on /people. It is the single
 * implementation of the accept/decline behaviour: /people mounts the same
 * component rather than keeping its own copy. The archive nudge mounts with it
 * everywhere and takes **no prop** — one component that renders one thing is
 * the property the nudge was put here for, rather than a second banner.
 *
 * Renders nothing at all when nothing is pending — no empty card, no heading.
 */
export function ActionableBanner() {
  const queryClient = useQueryClient();

  const [confirming, setConfirming] = useState<ArchivePrompt | null>(null);

  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });
  const invites = useQuery({ queryKey: ["familyInvites"], queryFn: getIncomingFamilyInvites });
  // A literal segment inside the ["occasions"] prefix, the convention the
  // occasion strip's key already set: clear of the per-family
  // ["occasions", familyId] entries, while one sweep of the bare prefix still
  // reaches it. That is what makes every existing archive call site clear this
  // banner without learning the query exists.
  const prompts = useQuery({
    queryKey: ["occasions", "archive-prompts"],
    queryFn: getArchivePrompts,
  });

  // `prompts.isError` is deliberately **not** here. A request or an invite
  // failing means somebody is waiting on you and you cannot see them. A nudge is
  // the app's own housekeeping: nothing is lost if it never arrives, nobody was
  // promised it, and the /lists strip below already toasts for the same backend.
  const loadFailed = requests.isError || invites.isError;
  useEffect(() => {
    if (loadFailed) toast.error("Failed to load pending requests and invites.");
  }, [loadFailed]);

  // Accepting a request adds a connection, so what that person shares becomes
  // visible: the badge query, the connection list and the shared scope all go stale.
  const invalidateAcceptedConnection = () => {
    queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["lists", "shared"] });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
  };

  // Declining adds nothing — only the pending list (and so the badge) changes.
  const invalidateDeclinedConnection = () => {
    queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
  };

  const invalidateInvites = () => {
    queryClient.invalidateQueries({ queryKey: ["familyInvites"] });
    queryClient.invalidateQueries({ queryKey: ["families"] });
    // Joining a family surfaces its lists through the combined shared scope
    queryClient.invalidateQueries({ queryKey: ["lists", "shared"] });
  };

  const handleInviteError = (err: unknown, action: "accept" | "decline") => {
    if (isAxiosError(err) && err.response?.status === 409) {
      // Invite already accepted, declined, or expired — refresh so the stale row clears
      queryClient.invalidateQueries({ queryKey: ["familyInvites"] });
      toast.error("This invite is no longer valid.");
    } else {
      toast.error(`Failed to ${action} invite.`);
    }
  };

  const acceptRequest = useMutation({
    mutationFn: acceptConnection,
    onSuccess: invalidateAcceptedConnection,
    onError: () => toast.error("Failed to accept request."),
  });

  const declineRequest = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateDeclinedConnection,
    onError: () => toast.error("Failed to decline request."),
  });

  const acceptInvite = useMutation({
    mutationFn: acceptFamilyInvite,
    onSuccess: invalidateInvites,
    onError: (err) => handleInviteError(err, "accept"),
  });

  const declineInvite = useMutation({
    mutationFn: declineFamilyInvite,
    onSuccess: invalidateInvites,
    onError: (err) => handleInviteError(err, "decline"),
  });

  const archivePrompt = useMutation({
    mutationFn: (occasionId: number) => updateOccasion(occasionId, { is_archived: true }),
    onSuccess: () => {
      // The same pair `OccasionDetail`'s header fires, for the same reasons: the
      // bare prefix moves the /lists strip's card and this banner's row alike,
      // and archiving changes whether the occasion can be shared to at all.
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      queryClient.invalidateQueries({ queryKey: ["share-targets"] });
    },
    onError: () => toast.error("Failed to archive the occasion."),
    // The dialog closes when the mutation settles rather than on the click, so
    // it can stay open with every button disabled while the archive is in
    // flight instead of vanishing mid-mutation (ADR 0008).
    onSettled: () => setConfirming(null),
  });

  const dismissPrompt = useMutation({
    mutationFn: dismissArchivePrompt,
    // This one key and no other. A snooze changes one row's visibility to one
    // user: no occasion moved, no share target changed, no card re-sorted.
    // Sweeping the bare prefix would refetch the strip and every family's
    // occasion list to hide one banner row.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasions", "archive-prompts"] });
    },
    onError: () => toast.error("Failed to dismiss the prompt."),
  });

  // Only the row being acted on is disabled, and both of its buttons are: the
  // guard is against answering one item twice, not against answering a second
  // item while the first is in flight.
  const busyRequestId = acceptRequest.isPending
    ? acceptRequest.variables
    : declineRequest.isPending
      ? declineRequest.variables
      : null;
  const busyInviteToken = acceptInvite.isPending
    ? acceptInvite.variables
    : declineInvite.isPending
      ? declineInvite.variables
      : null;
  const busyPromptId = archivePrompt.isPending
    ? archivePrompt.variables
    : dismissPrompt.isPending
      ? dismissPrompt.variables
      : null;

  const pendingRequests = requests.data ?? [];
  const pendingInvites = invites.data ?? [];
  // A failed prompts query is an empty array here, which is the whole of its
  // error handling: no rows, and nothing said.
  const pendingPrompts = prompts.data ?? [];
  if (
    pendingRequests.length === 0 &&
    pendingInvites.length === 0 &&
    pendingPrompts.length === 0
  ) {
    return null;
  }

  return (
    <section aria-label="Waiting on you">
      <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
        {pendingRequests.map((req) => (
          <li key={`request-${req.id}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-gray-900">
                <span className="font-medium">{req.user.name}</span> wants to connect
              </p>
              <p className="text-sm text-gray-500">{req.user.email}</p>
            </div>
            <ActionButtons
              onAccept={() => acceptRequest.mutate(req.id)}
              onDecline={() => declineRequest.mutate(req.id)}
              disabled={busyRequestId === req.id}
              describes={`connection request from ${req.user.name}`}
            />
          </li>
        ))}
        {pendingInvites.map((invite) => (
          <li key={`invite-${invite.id}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-gray-900">
                <span className="font-medium">{invite.invited_by.name}</span> invited you to{" "}
                <span className="font-medium">{invite.family.name}</span>
              </p>
            </div>
            <ActionButtons
              onAccept={() => acceptInvite.mutate(invite.token)}
              onDecline={() => declineInvite.mutate(invite.token)}
              disabled={busyInviteToken === invite.token}
              describes={`invite to ${invite.family.name}`}
            />
          </li>
        ))}
        {/* Last, and not set apart. Requests and invites are other people
            waiting on you; the app's own housekeeping outranks neither, and a
            sub-heading over what is usually one row would be chrome. */}
        {pendingPrompts.map((prompt) => (
          <li key={`prompt-${prompt.id}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-gray-900">
                {/* The occasion links because "Archive this?" is not answerable
                    from the row — the page carries the lists, the budget and
                    the shopping tab that answer it (CONTEXT.md rule 3). The
                    family is an unlinked prefix: the occasion name alone does
                    not identify one occasion. */}
                <Link
                  to={`/occasions/${prompt.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {prompt.name}
                </Link>{" "}
                · {prompt.family_name} has been quiet for a while
              </p>
            </div>
            <ArchiveActions
              onArchive={() => setConfirming(prompt)}
              onNotYet={() => dismissPrompt.mutate(prompt.id)}
              disabled={busyPromptId === prompt.id}
              describes={`${prompt.name} in ${prompt.family_name}`}
            />
          </li>
        ))}
      </ul>

      {/* One dialog for the whole banner, not one per row — which is why the
          state is the prompt being confirmed rather than a boolean: the title
          needs its name and the mutation needs its id. */}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Archive ${confirming.name}?` : ""}
        body={ARCHIVE_BODY}
        actions={ARCHIVE_ACTIONS}
        pending={archivePrompt.isPending}
        onResolve={(id) => {
          if (id === "archive" && confirming) {
            archivePrompt.mutate(confirming.id);
            return;
          }
          setConfirming(null);
        }}
      />
    </section>
  );
}

function ActionButtons({
  onAccept,
  onDecline,
  disabled,
  describes,
}: {
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
  describes: string;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={onAccept}
        disabled={disabled}
        aria-label={`Accept ${describes}`}
        className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Accept
      </button>
      <button
        onClick={onDecline}
        disabled={disabled}
        aria-label={`Decline ${describes}`}
        className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}

/**
 * The nudge's button pair, borrowing `ActionButtons`' geometry and per-row
 * `disabled` guard.
 *
 * Both buttons are neutral grey. **Archive is not a green Accept**, and it is
 * not a red danger either: this row exists to say the action is mild — archiving
 * blocks new shares, withdraws none, and leaves the viewer's shopping alone —
 * and a red button would argue the opposite before the confirm body got to deny
 * it. The dialog behind it carries the danger tone, where the action is real.
 *
 * A separate component rather than props on `ActionButtons`: two fixed pairs
 * exist, and four props to express them would leave a component whose name
 * stops saying what it does.
 */
function ArchiveActions({
  onArchive,
  onNotYet,
  disabled,
  describes,
}: {
  onArchive: () => void;
  onNotYet: () => void;
  disabled: boolean;
  describes: string;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={onArchive}
        disabled={disabled}
        aria-label={`Archive ${describes}`}
        className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        Archive
      </button>
      <button
        onClick={onNotYet}
        disabled={disabled}
        aria-label={`Dismiss the prompt to archive ${describes}`}
        className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        Not yet
      </button>
    </div>
  );
}
