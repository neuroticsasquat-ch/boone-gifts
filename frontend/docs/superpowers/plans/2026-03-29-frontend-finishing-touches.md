# Frontend Finishing Touches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three placeholder frontend pages (Connections, Collections, CollectionDetail) and add a sharing section to ListDetail.

**Architecture:** Each page is a React component using TanStack Query for data fetching and Tailwind CSS for styling. All API functions and TypeScript types already exist. Tests use Vitest + React Testing Library + MSW, following the established Dashboard.test.tsx pattern. No new dependencies needed.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Tailwind CSS v4, Vitest, React Testing Library, MSW v2

**Spec:** `docs/superpowers/specs/2026-03-29-frontend-finishing-touches-design.md`

**IMPORTANT:** Do NOT run any git commands that change repo state (no git add, commit, reset, push). Only edit code files and run tests.

**Test command:** `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

**Test single file:** `cd /app/boone-gifts-frontend && npx vitest run src/pages/Connections.test.tsx --reporter=verbose`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `src/pages/Connections.tsx` | Send request form, pending requests, accepted connections |
| Rewrite | `src/pages/Collections.tsx` | Create collection form, collection list with delete |
| Rewrite | `src/pages/CollectionDetail.tsx` | Collection header with edit/delete, lists, add list form |
| Modify | `src/pages/ListDetail.tsx` | Add SharingSection component to OwnerView |
| Create | `src/pages/Connections.test.tsx` | Tests for Connections page |
| Create | `src/pages/Collections.test.tsx` | Tests for Collections page |
| Create | `src/pages/CollectionDetail.test.tsx` | Tests for CollectionDetail page |
| Create | `src/pages/ListDetail.test.tsx` | Tests for ListDetail sharing section |

---

### Task 1: Connections Page

**Files:**
- Rewrite: `src/pages/Connections.tsx`
- Create: `src/pages/Connections.test.tsx`

**Reference files** (read these for patterns):
- `src/pages/Dashboard.tsx` — connection request accept/decline pattern
- `src/pages/Dashboard.test.tsx` — MSW handler + render helper pattern
- `src/api/connections.ts` — API functions
- `src/types/index.ts` — `Connection`, `ConnectionUser` types

- [ ] **Step 1: Write the test file**

Create `src/pages/Connections.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Connections } from "./Connections";

const API = "https://boone-gifts-api.localhost";

function renderConnections() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Connections />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Connections", () => {
  it("renders accepted connections with Remove button", async () => {
    server.use(
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 1, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders pending requests with Accept/Decline buttons", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () =>
        HttpResponse.json([
          { id: 5, status: "pending", user: { id: 3, name: "Bob", email: "bob@test.com" }, created_at: "2026-01-01", accepted_at: null },
        ])
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("sends a connection request", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.post(`${API}/connections`, () =>
        HttpResponse.json(
          { id: 10, status: "pending", user: { id: 4, name: "Carol", email: "carol@test.com" }, created_at: "2026-01-01", accepted_at: null },
          { status: 201 }
        )
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "carol@test.com");
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toHaveValue("");
    });
  });

  it("shows error for duplicate connection request", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
      http.post(`${API}/connections`, () =>
        HttpResponse.json({ detail: "Conflict" }, { status: 409 })
      ),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Email address"), "existing@test.com");
    await userEvent.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByText("A connection already exists with this user.")).toBeInTheDocument();
    });
  });

  it("hides pending requests section when empty", async () => {
    server.use(
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/connections/requests`, () => HttpResponse.json([])),
    );

    renderConnections();

    await waitFor(() => {
      expect(screen.getByText("No connections yet.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pending Requests")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/Connections.test.tsx --reporter=verbose`

Expected: FAIL — the `Connections` component only renders an `<h1>`.

- [ ] **Step 3: Implement the Connections page**

Rewrite `src/pages/Connections.tsx`:

```tsx
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

      <SendRequestForm queryClient={queryClient} onSuccess={invalidateAll} />

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
  queryClient,
  onSuccess,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
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
          {mutation.isPending ? "Sending…" : "Send Request"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/Connections.test.tsx --reporter=verbose`

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all tests pass (15 existing + 5 new = 20).

---

### Task 2: Collections Page

**Files:**
- Rewrite: `src/pages/Collections.tsx`
- Create: `src/pages/Collections.test.tsx`

**Reference files:**
- `src/pages/Lists.tsx` — list display pattern
- `src/pages/Dashboard.test.tsx` — MSW handler pattern
- `src/api/collections.ts` — API functions
- `src/types/index.ts` — `Collection` type

- [ ] **Step 1: Write the test file**

Create `src/pages/Collections.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Collections } from "./Collections";

const API = "https://boone-gifts-api.localhost";

function renderCollections() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Collections />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Collections", () => {
  it("renders collections list with links", async () => {
    server.use(
      http.get(`${API}/collections`, () =>
        HttpResponse.json([
          { id: 1, name: "Christmas 2026", description: "Holiday gifts", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { id: 2, name: "Birthdays", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("Birthdays")).toBeInTheDocument();
  });

  it("creates a collection and clears form", async () => {
    server.use(
      http.get(`${API}/collections`, () => HttpResponse.json([])),
      http.post(`${API}/collections`, () =>
        HttpResponse.json(
          { id: 3, name: "New Collection", description: "", owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { status: 201 }
        )
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Collection name")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Collection name"), "New Collection");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Collection name")).toHaveValue("");
    });
  });

  it("deletes a collection", async () => {
    server.use(
      http.get(`${API}/collections`, () =>
        HttpResponse.json([
          { id: 1, name: "To Delete", description: null, owner_id: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.delete(`${API}/collections/1`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    // window.confirm is auto-true in jsdom
    await userEvent.click(screen.getByText("Delete"));
  });

  it("shows empty state", async () => {
    server.use(
      http.get(`${API}/collections`, () => HttpResponse.json([])),
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText("No collections yet.")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/Collections.test.tsx --reporter=verbose`

Expected: FAIL — the `Collections` component only renders an `<h1>`.

- [ ] **Step 3: Implement the Collections page**

Rewrite `src/pages/Collections.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCollections, createCollection, deleteCollection } from "../api/collections";

export function Collections() {
  const queryClient = useQueryClient();

  const collections = useQuery({ queryKey: ["collections"], queryFn: getCollections });

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  function handleDelete(id: number) {
    if (window.confirm("Delete this collection?")) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Collections</h1>

      <CreateCollectionForm queryClient={queryClient} />

      <section>
        {collections.data && collections.data.length === 0 && (
          <p className="text-gray-500">No collections yet.</p>
        )}
        {collections.data && collections.data.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {collections.data.map((coll) => (
              <li key={coll.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/collections/${coll.id}`} className="min-w-0 flex-1 hover:opacity-75">
                  <p className="font-medium text-gray-900">{coll.name}</p>
                  {coll.description && (
                    <p className="text-sm text-gray-500 truncate">{coll.description}</p>
                  )}
                </Link>
                <button
                  onClick={() => handleDelete(coll.id)}
                  disabled={deleteMutation.isPending}
                  className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateCollectionForm({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setName("");
      setDescription("");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a Collection</h2>
      {mutation.isError && <p className="text-sm text-red-600 mb-2">Failed to create collection.</p>}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/Collections.test.tsx --reporter=verbose`

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all tests pass (20 existing + 4 new = 24).

---

### Task 3: CollectionDetail Page

**Files:**
- Rewrite: `src/pages/CollectionDetail.tsx`
- Create: `src/pages/CollectionDetail.test.tsx`

**Reference files:**
- `src/pages/ListDetail.tsx` — EditListHeader pattern, DeleteListButton pattern
- `src/api/collections.ts` — `getCollection`, `updateCollection`, `deleteCollection`, `addCollectionItem`, `removeCollectionItem`
- `src/api/lists.ts` — `getLists` (for the add list dropdown)
- `src/types/index.ts` — `CollectionDetail`, `GiftList` types

- [ ] **Step 1: Write the test file**

Create `src/pages/CollectionDetail.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { CollectionDetail } from "./CollectionDetail";

const API = "https://boone-gifts-api.localhost";

const sampleCollection = {
  id: 1,
  name: "Christmas 2026",
  description: "Holiday gifts",
  owner_id: 1,
  lists: [
    { id: 10, name: "My Wishlist", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderCollectionDetail(id = "1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/collections/${id}`]}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionDetail />} />
          <Route path="/collections" element={<div>Collections List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CollectionDetail", () => {
  it("renders collection header and lists", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Holiday gifts")).toBeInTheDocument();
    expect(screen.getByText("My Wishlist")).toBeInTheDocument();
  });

  it("edits collection name and description", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.put(`${API}/collections/1`, () =>
        HttpResponse.json({ ...sampleCollection, name: "Updated", description: "New desc" })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Christmas 2026")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Edit"));

    const nameInput = screen.getByDisplayValue("Christmas 2026");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated");
    await userEvent.click(screen.getByText("Save"));
  });

  it("removes a list from collection", async () => {
    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(sampleCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
      http.delete(`${API}/collections/1/items/10`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Remove"));
  });

  it("adds a list to collection", async () => {
    const emptyCollection = { ...sampleCollection, lists: [] };

    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(emptyCollection)),
      http.get(`${API}/lists`, () =>
        HttpResponse.json([
          { id: 20, name: "Birthday List", description: null, owner_id: 1, owner_name: "Me", created_at: "2026-01-01", updated_at: "2026-01-01" },
        ])
      ),
      http.post(`${API}/collections/1/items`, () =>
        new HttpResponse(null, { status: 201 })
      ),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "20");
    await userEvent.click(screen.getByText("Add"));
  });

  it("shows empty state for lists", async () => {
    const emptyCollection = { ...sampleCollection, lists: [] };

    server.use(
      http.get(`${API}/collections/1`, () => HttpResponse.json(emptyCollection)),
      http.get(`${API}/lists`, () => HttpResponse.json([])),
    );

    renderCollectionDetail();

    await waitFor(() => {
      expect(screen.getByText("No lists in this collection.")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/CollectionDetail.test.tsx --reporter=verbose`

Expected: FAIL — the `CollectionDetail` component only renders an `<h1>`.

- [ ] **Step 3: Implement the CollectionDetail page**

Rewrite `src/pages/CollectionDetail.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCollection,
  updateCollection,
  deleteCollection,
  addCollectionItem,
  removeCollectionItem,
} from "../api/collections";
import { getLists } from "../api/lists";
import type { CollectionDetail as CollectionDetailType } from "../types";

export function CollectionDetail() {
  const { id } = useParams();
  const collectionId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: collection, isLoading, error } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => getCollection(collectionId),
    enabled: !!id,
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (error || !collection) return <p className="text-red-600">Failed to load collection.</p>;

  return (
    <div className="space-y-6">
      <Link to="/collections" className="text-sm text-blue-600 hover:underline">&larr; Back to collections</Link>
      <CollectionHeader
        collection={collection}
        collectionId={collectionId}
        queryClient={queryClient}
        navigate={navigate}
      />
      <CollectionLists
        collection={collection}
        collectionId={collectionId}
        queryClient={queryClient}
      />
      <AddListForm collectionId={collectionId} collection={collection} queryClient={queryClient} />
    </div>
  );
}

function CollectionHeader({
  collection,
  collectionId,
  queryClient,
  navigate,
}: {
  collection: CollectionDetailType;
  collectionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updateCollection(collectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCollection(collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      navigate("/collections", { replace: true });
    },
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, description: description || undefined });
  }

  function handleDelete() {
    if (window.confirm("Delete this collection? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="rounded-lg bg-white p-6 shadow space-y-4">
        {updateMutation.isError && <p className="text-sm text-red-600">Failed to update collection.</p>}
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
            disabled={updateMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{collection.name}</h1>
          {collection.description && <p className="mt-2 text-gray-600">{collection.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionLists({
  collection,
  collectionId,
  queryClient,
}: {
  collection: CollectionDetailType;
  collectionId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const removeMutation = useMutation({
    mutationFn: (listId: number) => removeCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  if (collection.lists.length === 0) {
    return <p className="text-gray-500">No lists in this collection.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {collection.lists.map((list) => (
        <li key={list.id} className="flex items-center justify-between px-4 py-3">
          <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 hover:opacity-75">
            <p className="font-medium text-gray-900">{list.name}</p>
            <p className="text-sm text-gray-500">by {list.owner_name}</p>
          </Link>
          <button
            onClick={() => removeMutation.mutate(list.id)}
            disabled={removeMutation.isPending}
            className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddListForm({
  collectionId,
  collection,
  queryClient,
}: {
  collectionId: number;
  collection: CollectionDetailType;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [selectedListId, setSelectedListId] = useState("");

  const allLists = useQuery({ queryKey: ["lists"], queryFn: () => getLists() });

  const addMutation = useMutation({
    mutationFn: (listId: number) => addCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setSelectedListId("");
    },
  });

  const existingListIds = new Set(collection.lists.map((l) => l.id));
  const availableLists = (allLists.data ?? []).filter((l) => !existingListIds.has(l.id));

  if (availableLists.length === 0) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedListId) {
      addMutation.mutate(Number(selectedListId));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Add a List</h2>
      {addMutation.isError && <p className="text-sm text-red-600 mb-2">Failed to add list.</p>}
      <div className="flex gap-2">
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        >
          <option value="">Select a list…</option>
          {availableLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={addMutation.isPending || !selectedListId}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/CollectionDetail.test.tsx --reporter=verbose`

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all tests pass (24 existing + 5 new = 29).

---

### Task 4: ListDetail Sharing Section

**Files:**
- Modify: `src/pages/ListDetail.tsx` (add SharingSection to OwnerView)
- Create: `src/pages/ListDetail.test.tsx`

**Reference files:**
- `src/pages/ListDetail.tsx` — existing OwnerView component structure
- `src/api/shares.ts` — `getShares`, `createShare`, `deleteShare`
- `src/api/connections.ts` — `getConnections`
- `src/types/index.ts` — `ListShare`, `Connection` types
- `src/contexts/AuthContext.tsx` — `AuthProvider` for tests that need auth

**Key integration point:** The `SharingSection` component is added inside the `OwnerView` function's returned fragment, after the gifts list `<ul>`. It needs `listId` and `queryClient` which are already available as props to `OwnerView`.

- [ ] **Step 1: Write the test file**

Create `src/pages/ListDetail.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { ListDetail } from "./ListDetail";

const API = "https://boone-gifts-api.localhost";

// JWT with payload: {"sub":"1","email":"owner@test.com","role":"member","exp":9999999999}
const ownerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "owner@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

// JWT with payload: {"sub":"2","email":"viewer@test.com","role":"member","exp":9999999999}
const viewerToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "2", email: "viewer@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

const ownerListDetail = {
  id: 1,
  name: "My Wishlist",
  description: "Things I want",
  owner_id: 1,
  owner_name: "Owner",
  gifts: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const viewerListDetail = {
  id: 1,
  name: "My Wishlist",
  description: "Things I want",
  owner_id: 1,
  owner_name: "Owner",
  gifts: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderListDetail(token: string) {
  // Mock the silent refresh to return the token, which sets up the auth user
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/lists/1"]}>
          <Routes>
            <Route path="/lists/:id" element={<ListDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("ListDetail Sharing Section", () => {
  it("renders sharing section for owner", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Sharing")).toBeInTheDocument();
    });
  });

  it("does not render sharing section for viewer", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListDetail)),
    );

    renderListDetail(viewerToken);

    await waitFor(() => {
      expect(screen.getByText("My Wishlist")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sharing")).not.toBeInTheDocument();
  });

  it("adds a share from connections dropdown", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.post(`${API}/lists/1/shares`, () =>
        HttpResponse.json({ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }, { status: 201 })
      ),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Sharing")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "2");
    await userEvent.click(screen.getByText("Share"));
  });

  it("removes a share", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }])
      ),
      http.delete(`${API}/lists/1/shares/2`, () =>
        new HttpResponse(null, { status: 204 })
      ),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // The "Remove" button in the sharing section (not the gift delete buttons)
    const removeButtons = screen.getAllByText("Remove");
    await userEvent.click(removeButtons[removeButtons.length - 1]);
  });

  it("hides add share when all connections already shared", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () =>
        HttpResponse.json([
          { id: 5, status: "accepted", user: { id: 2, name: "Alice", email: "alice@test.com" }, created_at: "2026-01-01", accepted_at: "2026-01-02" },
        ])
      ),
      http.get(`${API}/lists/1/shares`, () =>
        HttpResponse.json([{ id: 1, list_id: 1, user_id: 2, created_at: "2026-01-01" }])
      ),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // The share dropdown should not be present since Alice is already shared
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/ListDetail.test.tsx --reporter=verbose`

Expected: FAIL — the `OwnerView` has no sharing section yet.

- [ ] **Step 3: Add SharingSection to ListDetail.tsx**

Add the following imports to the top of `src/pages/ListDetail.tsx` (after the existing imports):

```tsx
import { getShares, createShare, deleteShare } from "../api/shares";
import { getConnections } from "../api/connections";
```

Add the `SharingSection` component at the bottom of the file (before the closing of the file, after the `ViewerGiftRow` component):

```tsx
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

  // Build a lookup from user_id to connection user info for displaying share names
  const connectionsByUserId = new Map((connections.data ?? []).map((c) => [c.user.id, c.user]));

  function handleAddShare(e: FormEvent) {
    e.preventDefault();
    if (selectedUserId) {
      addShareMutation.mutate(Number(selectedUserId));
    }
  }

  return (
    <>
      <hr className="border-gray-200" />
      <h2 className="text-lg font-semibold text-gray-900">Sharing</h2>

      {availableConnections.length > 0 && (
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
```

Then modify the `OwnerView` component to include `<SharingSection />` at the end of its returned fragment. Change the `OwnerView` return from:

```tsx
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
```

To:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/ListDetail.test.tsx --reporter=verbose`

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all tests pass (29 existing + 5 new = 34).
