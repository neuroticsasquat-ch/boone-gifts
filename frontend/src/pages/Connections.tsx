import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getConnections,
  getConnectionRequests,
  sendConnectionRequest,
  acceptConnection,
  deleteConnection,
} from "../api/connections";
import { searchUsers } from "../api/users";
import { isAxiosError } from "axios";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { HandshakeIcon } from "../components/Icons";
import type { UserSearchResult } from "../types";

export function Connections() {
  useTitle("Connections");
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
    onError: () => toast.error("Failed to accept request."),
  });

  const declineMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateAll,
    onError: () => toast.error("Failed to decline request."),
  });

  const removeMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateAll,
    onError: () => toast.error("Failed to remove connection."),
  });

  if (connections.isPending || requests.isPending) return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><HandshakeIcon className="h-6 w-6" /> Connections</h1>
      <Spinner />
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><HandshakeIcon className="h-6 w-6" /> Connections</h1>

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
          <p className="mt-3 text-gray-500">
            You don't have any connections yet. Use the form above to send a request.
          </p>
        )}
        {connections.data && connections.data.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {connections.data.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link to={`/connections/${conn.id}`} className="font-medium text-blue-600 hover:underline">{conn.user.name}</Link>
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.length < 2 || selectedUser) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const data = await searchUsers(query);
        setResults(data);
        setShowDropdown(data.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, selectedUser]);

  function selectUser(user: UserSearchResult) {
    setSelectedUser(user);
    setQuery(`${user.name} (${user.email})`);
    setShowDropdown(false);
    setResults([]);
  }

  function clearSelection() {
    setSelectedUser(null);
    setQuery("");
    setError("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectUser(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (userId: number) => sendConnectionRequest({ user_id: userId }),
    onSuccess: () => {
      clearSelection();
      onSuccess();
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 400) setError("You cannot send a request to yourself.");
        else if (status === 404) setError("No user found.");
        else if (status === 409) setError("A connection already exists with this user.");
        else setError("Failed to send request.");
      } else {
        setError("Failed to send request.");
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setError("");
    mutation.mutate(selectedUser.id);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Send a Connection Request</h2>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedUser) setSelectedUser(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            autoComplete="off"
          />
          {selectedUser && (
            <button
              type="button"
              onClick={clearSelection}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              \u2715
            </button>
          )}
          {showDropdown && (
            <ul
              ref={dropdownRef}
              className="absolute z-10 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
            >
              {results.map((user, i) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onMouseDown={() => selectUser(user)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                      i === highlightIndex ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="font-medium text-gray-900">{user.name}</span>
                    <span className="ml-2 text-gray-500">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || !selectedUser}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Sending\u2026" : "Send Request"}
        </button>
      </div>
    </form>
  );
}
