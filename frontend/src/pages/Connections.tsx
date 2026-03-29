import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getConnections,
  getConnectionRequests,
  sendConnectionRequest,
  acceptConnection,
  deleteConnection,
} from "../api/connections";
import { isAxiosError } from "axios";

export function Connections() {
  const queryClient = useQueryClient();

  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
    queryClient.invalidateQueries({ queryKey: ["lists", "shared"] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  const acceptMutation = useMutation({
    mutationFn: acceptConnection,
    onSuccess: invalidateAll,
  });

  const declineMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateAll,
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Connections</h1>

      <SendRequestForm onSuccess={invalidateAll} />

      {requests.data && requests.data.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Pending Requests</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {requests.data.map((req) => (
              <li key={req.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{req.user.name}</p>
                  <p className="text-sm text-gray-500">{req.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptMutation.mutate(req.id)}
                    disabled={acceptMutation.isPending}
                    className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineMutation.mutate(req.id)}
                    disabled={declineMutation.isPending}
                    className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900">My Connections</h2>
        {connections.data && connections.data.length === 0 && (
          <p className="mt-3 text-gray-500">No connections yet.</p>
        )}
        {connections.data && connections.data.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {connections.data.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{conn.user.name}</p>
                  <p className="text-sm text-gray-500">{conn.user.email}</p>
                </div>
                <button
                  onClick={() => removeMutation.mutate(conn.id)}
                  disabled={removeMutation.isPending}
                  className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SendRequestForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (emailValue: string) => sendConnectionRequest({ email: emailValue }),
    onSuccess: () => {
      setEmail("");
      setError("");
      onSuccess();
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 400) setError("You cannot send a request to yourself.");
        else if (status === 404) setError("No user found with that email.");
        else if (status === 409) setError("A connection already exists with this user.");
        else setError("Failed to send request.");
      } else {
        setError("Failed to send request.");
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    mutation.mutate(email);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Send a Connection Request</h2>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Sending\u2026" : "Send Request"}
        </button>
      </div>
    </form>
  );
}
