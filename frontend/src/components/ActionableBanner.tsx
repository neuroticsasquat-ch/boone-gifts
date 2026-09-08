import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { getConnectionRequests, acceptConnection, deleteConnection } from "../api/connections";
import {
  getIncomingFamilyInvites,
  acceptFamilyInvite,
  declineFamilyInvite,
} from "../api/families";

/**
 * Everything waiting on the user's decision — incoming connection requests and
 * family invites — with accept/decline inline.
 *
 * Mounted above the lists on /lists and on /people. It is the single
 * implementation of the accept/decline behaviour: /people mounts the same
 * component rather than keeping its own copy.
 *
 * Renders nothing at all when nothing is pending — no empty card, no heading.
 */
export function ActionableBanner() {
  const queryClient = useQueryClient();

  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });
  const invites = useQuery({ queryKey: ["familyInvites"], queryFn: getIncomingFamilyInvites });

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

  const pendingRequests = requests.data ?? [];
  const pendingInvites = invites.data ?? [];
  if (pendingRequests.length === 0 && pendingInvites.length === 0) return null;

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
      </ul>
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
