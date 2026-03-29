# Frontend Finishing Touches — Design Spec

## Overview

Implement the three placeholder frontend pages (Connections, Collections, CollectionDetail) and add a sharing section to the existing ListDetail page. All backend API endpoints and frontend API functions already exist — this is purely building React components and wiring up TanStack Query.

## Design Decisions

- **Interaction style:** Mix — inline for quick actions (accept/decline, remove, claim) but separate forms for creation (send request, create collection).
- **Connections page:** Shows everything — accepted connections, pending incoming requests, and send request form. Dashboard keeps its request section too (both places).
- **List sharing UI:** Below the gifts list on ListDetail, owner-only. Dropdown of connections filtered by existing shares.
- **Testing:** All new pages get tests following the existing Vitest + RTL + MSW pattern.

## Connections Page (`src/pages/Connections.tsx`)

Rewrite from placeholder. Three sections top to bottom:

### 1. Send Request Form

- Text input for email address + "Send Request" button.
- Calls `sendConnectionRequest({ email })`.
- Clears input on success.
- Error handling:
  - 400 → "You cannot send a request to yourself."
  - 404 → "No user found with that email."
  - 409 → "A connection already exists with this user."
  - Generic fallback for other errors.

### 2. Pending Requests

- Same pattern as Dashboard: list of incoming requests showing user name + email.
- Accept button → `acceptConnection(id)`.
- Decline button → `deleteConnection(id)`.
- Hidden when no pending requests.
- Query: `getConnectionRequests()` with key `["connectionRequests"]`.

### 3. My Connections

- List of accepted connections showing user name + email.
- Remove button on each → `deleteConnection(id)`.
- Empty state: "No connections yet."
- Query: `getConnections()` with key `["connections"]`.

### Query Invalidation

All mutations (accept, decline, remove, send) invalidate: `["connections"]`, `["connectionRequests"]`, `["lists", "shared"]`, `["collections"]`.

## Collections Page (`src/pages/Collections.tsx`)

Rewrite from placeholder. Two sections:

### 1. Create Collection Form

- Inline form at the top: name input (required), description input (optional), "Create" button.
- Calls `createCollection({ name, description })`.
- Clears inputs on success.
- Error message on failure.

### 2. My Collections List

- List of collections showing name and description.
- Each links to `/collections/:id`.
- Delete button on each with confirmation (window.confirm).
- Empty state: "No collections yet."
- Query: `getCollections()` with key `["collections"]`.

### Query Invalidation

Create and delete invalidate `["collections"]`.

## CollectionDetail Page (`src/pages/CollectionDetail.tsx`)

Rewrite from placeholder. Three sections:

### 1. Header

- Collection name + description displayed.
- Edit button toggles inline edit mode for name and description (same pattern as ListDetail's EditListHeader).
- Delete button with confirmation → navigates to `/collections` after delete.
- Calls `updateCollection(id, data)` and `deleteCollection(id)`.

### 2. Lists in Collection

- Each item shows list name and owner name, linking to `/lists/:id`.
- Remove button on each → `removeCollectionItem(collectionId, listId)`.
- Empty state: "No lists in this collection."
- Data comes from the `CollectionDetail` response which includes nested `lists`.

### 3. Add List Form

- Dropdown/select populated from `getLists()` (all lists user can access: owned + shared).
- Filtered to exclude lists already in the collection.
- "Add" button → `addCollectionItem(collectionId, listId)`.
- Error handling: 409 (already in collection), 403 (no access to list).

### Query Invalidation

All mutations invalidate `["collection", id]` and `["collections"]`.

## ListDetail Sharing Section (`src/pages/ListDetail.tsx`)

Added below the gifts list, owner view only.

### 1. Separator + Heading

- Horizontal rule + "Sharing" heading, visually separating from the gifts section.

### 2. Add Share

- Dropdown populated from `getConnections()` (owner's accepted connections).
- Filtered to exclude users who already have a share (from `getShares(listId)`).
- "Share" button → `createShare(listId, userId)`.
- Hidden if no connections available to share with (all already shared or no connections).

### 3. Current Shares

- List of shared users showing name and email.
- Remove button on each → `deleteShare(listId, userId)`.
- Hidden if no shares exist.

### Data Sources

- Connections query: `getConnections()` with key `["connections"]`.
- Shares query: `getShares(listId)` with key `["shares", listId]`.

### Query Invalidation

Add/remove share invalidates `["shares", listId]`, `["list", listId]`, `["lists"]`.

### Type Note

`getShares()` returns `ListShare[]` which has `user_id` but not user name/email. The connections query provides the name/email mapping. For the current shares list, cross-reference `shares[].user_id` against the connections list to display names. If a share exists for a user not in the connections list (edge case from data inconsistency), show just the user ID.

## Testing

Each page gets its own test file. Pattern: MSW handlers mock API responses, render helper wraps component in QueryClientProvider + MemoryRouter, assertions on rendered content and mutation side effects.

### `src/pages/Connections.test.tsx`

- Renders pending connection requests with Accept/Decline buttons
- Renders accepted connections with Remove button
- Sends connection request (success clears input)
- Shows error for self-request / not found / duplicate
- Hides pending section when empty

### `src/pages/Collections.test.tsx`

- Renders collections list with links and delete buttons
- Creates a collection (success clears form)
- Deletes a collection
- Shows empty state

### `src/pages/CollectionDetail.test.tsx`

- Renders collection header and lists
- Edits collection name/description
- Removes a list from collection
- Adds a list to collection
- Shows empty state for lists

### `src/pages/ListDetail.test.tsx`

- Renders sharing section for owner
- Does not render sharing section for viewer
- Adds a share from connections dropdown
- Removes a share
- Hides add share when all connections already shared

## File Map

| File | Action |
|------|--------|
| `src/pages/Connections.tsx` | Rewrite |
| `src/pages/Collections.tsx` | Rewrite |
| `src/pages/CollectionDetail.tsx` | Rewrite |
| `src/pages/ListDetail.tsx` | Modify (add sharing section) |
| `src/pages/Connections.test.tsx` | Create |
| `src/pages/Collections.test.tsx` | Create |
| `src/pages/CollectionDetail.test.tsx` | Create |
| `src/pages/ListDetail.test.tsx` | Create |

## Styling

All Tailwind utility classes following existing patterns: `text-gray-900`/`text-gray-600` palette, `shadow` + `rounded-lg` for cards, `bg-blue-600 hover:bg-blue-700 text-white` for primary buttons, `bg-red-600 hover:bg-red-700` for destructive buttons, `bg-green-600 hover:bg-green-700` for accept/confirm actions, standard spacing (`p-6`, `space-y-4`, `gap-4`).
