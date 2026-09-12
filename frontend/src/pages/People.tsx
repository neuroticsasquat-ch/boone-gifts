import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getConnections,
  sendConnectionRequest,
  deleteConnection,
} from "../api/connections";
import { getFamilies, createFamily } from "../api/families";
import { searchUsers } from "../api/users";
import { isAxiosError } from "axios";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { HandshakeIcon } from "../components/Icons";
import { ActionableBanner } from "../components/ActionableBanner";
import { HeaderMenu } from "../components/HeaderMenu";
import { ConfirmDialog, type ConfirmAction } from "../components/ConfirmDialog";
import { matchesFilter, NoMatches } from "../components/sharing-rows";
import type { Connection, UserSearchResult } from "../types";

/** Loose on purpose — the backend is the real check; this only decides whether
 *  what was typed is worth sending as an address at all. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everyone the user shares with, in one page: families first (the coarser
 * grouping), then individuals. Replaces the separate Connections and Families
 * pages — a family and a connection both answer "who do I share with", so they
 * are two sections, not two destinations.
 */
export function People() {
  useTitle("People");
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  // Component state, not URL-held: CONTEXT.md rule 8 carves out scratch input
  // for the sharing modal's box, and both halves of that rationale are about
  // the input being free text rather than about it being in a dialog. Nobody
  // links to `/people?q=car`, and one `replaceState` per keystroke throttles
  // the same on a page as in a modal.
  const [filter, setFilter] = useState("");

  const families = useQuery({ queryKey: ["families"], queryFn: getFamilies });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });

  // Removing a connection withdraws what that person shared, so the shared
  // scope and the folders built over it go stale with the connection list.
  const invalidateConnections = () => {
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["connectionRequests"] });
    queryClient.invalidateQueries({ queryKey: ["lists", "shared"] });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
  };

  const removeMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateConnections,
    onError: () => toast.error("Failed to remove connection."),
  });

  const heading = (
    <div className="flex items-center justify-between">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        <HandshakeIcon className="h-6 w-6" /> People
      </h1>
      <button
        onClick={() => setAddOpen((open) => !open)}
        aria-expanded={addOpen}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {addOpen ? "Close" : "Add"}
      </button>
    </div>
  );

  if (families.isPending || connections.isPending) {
    return (
      <div className="space-y-8">
        {heading}
        {/* Above the spinner deliberately: anything awaiting a decision stays
            reachable while the two lists load. */}
        <ActionableBanner />
        <Spinner />
      </div>
    );
  }

  // `?? []` rather than the non-null assertion the happy path would allow: a
  // section that failed to load has no data and keeps its own error arm.
  const visibleFamilies = (families.data ?? []).filter((f) => matchesFilter(filter, f.name));
  const visibleConnections = (connections.data ?? []).filter((c) =>
    matchesFilter(filter, c.user.name, c.user.email),
  );
  const filtering = filter.trim() !== "";
  // Once either list is non-empty — a box above two "you have none" sentences is
  // chrome over nothing. It then outlives the rows it filters: removing the last
  // match empties both lists, and unmounting the input at that moment would
  // strand the viewer on `No people match "al"` with nothing left to clear.
  const showFilter =
    (families.data?.length ?? 0) + (connections.data?.length ?? 0) > 0 || filtering;

  return (
    <div className="space-y-8">
      {heading}

      <ActionableBanner />

      {/* One "Add" covering both things this page holds: a person to connect
          with, and a family to gather people into. */}
      {addOpen && (
        <div className="space-y-4">
          <SendRequestForm
            onSuccess={() => {
              invalidateConnections();
              setAddOpen(false);
              toast.success("Connection request sent.");
            }}
          />
          <CreateFamilyForm />
        </div>
      )}

      {/* Below Add and above the first heading: nothing between the control and
          the two sections it narrows. Deliberately far from Add's own box,
          which searches strangers to connect to and must not be mistaken for
          this one. No debounce — this is a predicate over two arrays already in
          memory. */}
      {showFilter && (
        <input
          type="text"
          aria-label="Filter people"
          placeholder="Filter people…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Families</h2>
        {families.isError && <p className="mt-3 text-red-600">Failed to load families.</p>}
        {/* The "you have none" sentence is never shown while the filter is set:
            telling someone with eight families to create one is a lie. The
            heading stays in both arms — a section that vanished when filtered
            would give no clue that the filter is why. */}
        {families.data && visibleFamilies.length === 0 && (
          <div className="mt-3">
            {filtering ? (
              <NoMatches noun="families" filter={filter} />
            ) : (
              <p className="text-gray-500">
                You aren't in any families yet. Use Add to create one.
              </p>
            )}
          </div>
        )}
        {visibleFamilies.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {visibleFamilies.map((family) => (
              <li key={family.id} className="flex items-center justify-between px-4 py-3">
                <Link
                  to={`/people/families/${family.id}`}
                  className="min-w-0 flex-1 hover:opacity-75"
                >
                  <p className="font-medium text-gray-900">{family.name}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {family.role} &middot; {family.member_count}{" "}
                    {family.member_count === 1 ? "member" : "members"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Individuals</h2>
        {connections.isError && <p className="mt-3 text-red-600">Failed to load connections.</p>}
        {connections.data && visibleConnections.length === 0 && (
          <div className="mt-3">
            {filtering ? (
              // "People" is the page's own word for a connection, even under a
              // heading that says Individuals to tell a person from a family.
              <NoMatches noun="people" filter={filter} />
            ) : (
              <p className="text-gray-500">
                You aren't connected to anyone yet. Use Add to send a request.
              </p>
            )}
          </div>
        )}
        {visibleConnections.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {visibleConnections.map((conn) => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                pending={removeMutation.isPending && removeMutation.variables === conn.id}
                onRemove={() => removeMutation.mutate(conn.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const REMOVE_ACTIONS: ConfirmAction[] = [{ id: "remove", label: "Remove", tone: "danger" }];

/**
 * One person: the link to them, and the `⋯` holding the one action a row has.
 *
 * `confirming` lives here rather than on `People` because the row is the thing
 * that repeats — NEU-1293's precedent — and only one `⋯` can be open, so at
 * most one dialog is ever mounted. The mutation stays at page level: it
 * invalidates four query keys, and `removeMutation.variables` is how a row
 * knows the in-flight removal is its own.
 *
 * Families get no menu. A family row is a link and nothing else, so a `⋯` there
 * would mean inventing `Leave Family` on this page (NEU-1319).
 */
function ConnectionRow({
  conn,
  pending,
  onRemove,
}: {
  conn: Connection;
  pending: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div>
        <Link to={`/people/${conn.id}`} className="font-medium text-blue-600 hover:underline">
          {conn.user.name}
        </Link>
        <p className="text-sm text-gray-500">{conn.user.email}</p>
      </div>
      <HeaderMenu
        ariaLabel={`Actions for ${conn.user.name}`}
        items={[{ label: "Remove", danger: true, onClick: () => setConfirming(true) }]}
        pending={pending}
      />
      {/* Naming the person is the guard the confirmation exists to be: "Remove
          this connection?" means nothing when it could be any of fifty rows
          reached through a `⋯` the viewer may have mis-tapped. The body says
          the thing the row cannot — removal cuts list visibility both ways —
          and the second sentence keeps it from overstating its own stakes.
          Confirming does not close it: `pending` holds it open with the
          mutation visibly in flight, so a failure lands on a dialog that is
          still standing and re-armed. */}
      <ConfirmDialog
        open={confirming}
        title={`Remove ${conn.user.name}?`}
        body="You'll stop seeing each other's shared lists. You can send a new request later."
        actions={REMOVE_ACTIONS}
        pending={pending}
        onResolve={(id) => {
          if (id === "remove") onRemove();
          else setConfirming(false);
        }}
      />
    </li>
  );
}

function CreateFamilyForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string }) => createFamily(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
      setName("");
      navigate(`/people/families/${result.id}`);
    },
    onError: () => toast.error("Failed to create family."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate({ name: name.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a Family</h2>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Family name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          {mutation.isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
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

  const shouldSearch = query.length >= 2 && !selectedUser;

  useEffect(() => {
    if (!shouldSearch) return;

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
  }, [query, shouldSearch]);

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

  // "by email or search": a picked search result sends a user_id, a typed
  // address that matched nothing sends an email — the backend takes either.
  const typedEmail = selectedUser ? null : query.trim();
  const canSendByEmail = typedEmail !== null && EMAIL_PATTERN.test(typedEmail);

  const mutation = useMutation({
    mutationFn: (target: { user_id: number } | { email: string }) =>
      sendConnectionRequest(target),
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
    setError("");
    if (selectedUser) mutation.mutate({ user_id: selectedUser.id });
    else if (canSendByEmail) mutation.mutate({ email: typedEmail });
    else setError("Pick someone from the results, or type their full email address.");
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
              const val = e.target.value;
              setQuery(val);
              if (selectedUser) setSelectedUser(null);
              if (val.length < 2) {
                setResults([]);
                setShowDropdown(false);
              }
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setShowDropdown(false)}
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
              ✕
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
                    <span className="block font-medium text-gray-900">{user.name}</span>
                    <span className="block text-gray-500">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || (!selectedUser && !canSendByEmail)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Sending…" : "Send Request"}
        </button>
      </div>
    </form>
  );
}
