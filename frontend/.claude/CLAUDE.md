# Boone Gifts Frontend

<!-- Specs/plans live under this repo's own docs/ (not the umbrella). This overrides the
     personal-skills DOCS_DIR auto-resolution so /planit, /implementit, /reviewit, and the loop
     resolve DOCS_DIR = <repo>/docs and find files in docs/superpowers/{specs,plans}. -->
specs_dir: docs

## Overview
React SPA frontend for the Boone Gifts platform. TypeScript, runs entirely in Docker (no host node_modules).

## Architecture
- **Toolchain**: Vite with React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7 (library/SPA mode)
- **Data fetching**: TanStack Query v5 + Axios
- **Auth**: Access token in memory (React context), refresh token in HttpOnly cookie (managed by backend). Silent refresh on page load restores sessions.
- **Task runner**: Taskfile.yaml
- **Testing**: Vitest + React Testing Library + MSW

## Development Workflow
```
task up              # Build image and start container (detached, runs Vite)
task logs            # Follow the app container logs
task restart         # Restart the app container
task build           # Production build
task test            # Run test suite (Vitest)
task test-file -- <path>  # Run a specific test file
task test-watch      # Run tests in watch mode
task stop            # Stop container without removing
task down            # Stop and remove container
```

## Dependency Management
```
task add -- <package>      # Install a package
task remove -- <package>   # Remove a package
task install               # Reinstall deps from lock file (use after pulling dependency updates)
```

## Project Structure
```
Dockerfile           # node:22-slim, npm ci, idles
docker-compose.yml   # App service on proxy network with Traefik labels
Taskfile.yaml        # All dev commands under app: namespace
index.html           # Vite entry HTML
vite.config.ts       # Vite + Tailwind + Vitest config
src/
  main.tsx           # React DOM entry point
  App.tsx            # Providers (QueryClient, Auth, Router, Sentry ErrorBoundary)
  index.css          # Tailwind import
  routes.tsx         # Route definitions
  api/
    client.ts        # Axios instance with withCredentials, JWT interceptors (setAccessToken/getAccessToken/clearAccessToken)
    auth.ts          # Auth API functions (login, register, refresh, logout, updateProfile, changePassword, toggleSimpleMode)
    lists.ts         # Gift list API functions (getLists accepts "owned"|"shared"|"family" filter)
    gifts.ts         # Gift API functions (CRUD + claim/unclaim)
    connections.ts   # Connections API functions
    shares.ts        # Shares API functions
    collections.ts   # Collections API functions
    families.ts      # Families API functions (13 functions — see Families section below)
    invites.ts       # Admin invite management API functions
    users.ts         # Admin user management API functions
    meta.ts          # URL metadata fetching function
  contexts/
    AuthContext.tsx   # Auth state provider (access token in memory, silent refresh on mount, async logout, toggleSimpleMode)
  hooks/
    useAuth.ts       # Auth context hook
    useTitle.ts      # document.title helper hook
  components/
    Layout.tsx            # App shell (nav + outlet; simple-mode nav branching; family-invite badge)
    ProtectedRoute.tsx    # Auth guard for routes
    AdminRoute.tsx        # Admin-role guard for /admin/* routes
    Badge.tsx             # Numeric badge overlay (used on nav icons)
    Icons.tsx             # Shared SVG icon components
    PendingFamilyInvites.tsx  # Inline accept/decline UI for incoming family invites
    Spinner.tsx           # Loading spinner
  pages/
    Login.tsx             # Login form
    Register.tsx          # Registration form — handles both admin-invite (?token=) and family-invite (?family_invite=) flows
    ForgotPassword.tsx    # Request password-reset email
    ResetPassword.tsx     # Consume reset token and set new password
    Dashboard.tsx         # Home page (summary cards, connection requests, shared lists) — full-mode only
    CreateList.tsx        # Create new gift list form
    Lists.tsx             # Gift lists page (owned + shared sections)
    ListDetail.tsx        # Single list view (owner editing, viewer claiming, sharing, URL auto-populate)
    Connections.tsx       # Connections management (send requests, accept/decline, remove)
    ConnectionProfile.tsx # View a connection's shared lists
    Collections.tsx       # Collections management (create, list, delete)
    CollectionDetail.tsx  # Single collection view (edit, manage lists)
    Families.tsx          # List owned families, create a family  → /families
    FamilyDetail.tsx      # View/manage a family (members, invites, rename, delete, leave)  → /families/:id
    FamilyLists.tsx       # Co-members' gift lists grouped by family  → /family-lists
    Account.tsx           # Account settings (display name, password, view-mode toggle)
    AdminInvites.tsx      # Admin: create and manage invite tokens
    AdminUsers.tsx        # Admin: view and manage user accounts
    list-detail/
      GiftsTab.tsx        # Gifts tab (extracted sub-component of ListDetail)
      SharedWithTab.tsx   # Shared-with tab (hidden in simple mode)
      CollectionsTab.tsx  # Collections tab within list detail
  types/
    index.ts         # TypeScript types matching backend Pydantic schemas
  test/
    setup.ts         # Vitest setup (Testing Library + MSW)
    mocks/
      handlers.ts    # MSW default handlers (includes /auth/refresh → 401)
      server.ts      # MSW server instance
```

## Routes

| Path | Component | Notes |
|---|---|---|
| `/login` | `Login` | Public |
| `/register` | `Register` | Public; reads `?token=` (admin invite) or `?family_invite=` (family invite) |
| `/forgot-password` | `ForgotPassword` | Public |
| `/reset-password` | `ResetPassword` | Public |
| `/` | `Dashboard` | Full-mode home (summary + connection requests) |
| `/lists` | `Lists` | Owned + shared lists |
| `/lists/new` | `CreateList` | |
| `/lists/:id` | `ListDetail` | Owner view or viewer/claimer view |
| `/connections` | `Connections` | Hidden from simple-mode nav |
| `/connections/:id` | `ConnectionProfile` | |
| `/collections` | `Collections` | Hidden from simple-mode nav |
| `/collections/:id` | `CollectionDetail` | |
| `/families` | `Families` | Hidden from simple-mode nav |
| `/families/:id` | `FamilyDetail` | |
| `/family-lists` | `FamilyLists` | Simple-mode primary view (co-members' lists grouped by family) |
| `/account` | `Account` | Accessible in both modes via user menu |
| `/admin/invites` | `AdminInvites` | Admin-only |
| `/admin/users` | `AdminUsers` | Admin-only |

## Families Feature

### API client (`src/api/families.ts`) — 13 functions
- `getFamilies()` — list families the current user belongs to
- `createFamily(data)` — create a new family
- `getFamily(id)` — get family detail (members, metadata)
- `renameFamily(id, data)` — rename a family
- `deleteFamily(id)` — delete a family
- `removeMember(familyId, userId)` — remove a member
- `updateMemberRole(familyId, userId, data)` — change a member's role
- `createInvite(familyId, data)` — invite someone by email
- `getInvites(familyId)` — list pending/accepted invites for a family
- `revokeInvite(familyId, inviteId)` — revoke an outstanding invite
- `getIncomingFamilyInvites()` — list invites addressed to the current user
- `acceptFamilyInvite(token)` — accept an invite by token
- `declineFamilyInvite(token)` — decline an invite by token

Accept and decline use the invite **token** string (not the numeric invite id).

### Types (`src/types/index.ts`)
New types added for the families feature:
- `Family` — `{ id, name, role, member_count }` (summary list item)
- `FamilyMember` — `{ user_id, name, role }`
- `FamilyDetail` — `{ id, name, created_by_id, members: FamilyMember[] }`
- `FamilyRef` — `{ id, name }` (lightweight reference embedded in `GiftList`)
- `FamilyInvite` — full invite record including `token`, `status`, `simple_mode` flag, timestamps
- `IncomingFamilyInvite` — invite addressed to the current user; includes `family: FamilyRef`, `invited_by`, `token`, `role`

Existing type changes:
- `GiftList` now has `families?: FamilyRef[]` — populated when the list is shared to families
- `AuthUser` now has `simple_mode: boolean` — decoded from the JWT payload alongside `role`
- `InviteInfo` has `family_name: string | null` — `null` for admin-invite tokens, family name string for family-invite tokens

### Pending invites + nav badge
`Layout.tsx` runs three background queries on every page:
1. `["connectionRequests"]` → badge on Connections
2. `["unseen-shares"]` → badge on Lists
3. `["familyInvites"]` → badge on Families (via `getIncomingFamilyInvites`)

The badge component is `<Badge count={n}>` rendered inside each mobile tab icon and inline in the desktop nav links. `PendingFamilyInvites.tsx` renders the accept/decline card list for incoming invites on the Families page.

### Register via family invite
`Register.tsx` reads `?family_invite=<token>` from the URL in addition to the original `?token=` param. When a family-invite token is present, `getInviteInfo(token)` returns `InviteInfo` with a non-null `family_name`, the email field is pre-filled and locked, and a subtitle "Join the \<family\> family on Boone Gifts." is shown.

## Simple Mode

Simple mode is a reduced navigation experience for users who only need to see their own lists and their family's lists.

### Storage and toggling
- `AuthUser.simple_mode: boolean` — decoded from the JWT payload (same `decodePayload()` call that reads `role`)
- `AuthContext.toggleSimpleMode()` — calls `apiToggleSimpleMode()`, receives a new JWT, stores it, and re-decodes user state
- Account page (`/account`) exposes a **View mode** card that calls `toggleSimpleMode()`; accessible in both modes via the user menu

### Nav branching (`Layout.tsx`)
| Mode | Desktop / mobile tabs |
|---|---|
| Full | Home · Lists · Connect · Families · Collect |
| Simple | My Lists · Family Lists |

`Layout.tsx` selects `simpleTabs` or `fullTabs` based on `user?.simple_mode` and passes the result to the mobile bottom-tab bar. The desktop top nav renders the same conditional split inline.

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (e.g., `https://boone-gifts-api.localhost`) |

## Testing
- 144 tests across 20 test files: 1 App smoke + 4 API client + 13 families API + 4 AdminRoute + 12 Layout + 11 PendingFamilyInvites + 2 ProtectedRoute + 7 AuthContext + 8 Account + 8 CollectionDetail + 4 Collections + 5 Connections + 4 Dashboard + 8 Families + 16 FamilyDetail + 6 FamilyLists + 4 ForgotPassword + 15 ListDetail + 7 Register + 5 ResetPassword
- Tests run inside the Docker container via `task test`

## Key Design Decisions
- Container runs Vite dev server directly on `app:up` — no separate `app:run` needed
- **`node_modules` in a named Docker volume** — survives the bind mount (`.:/app`)
- **Access token in memory, refresh token in HttpOnly cookie** — access token never in localStorage (XSS protection), refresh token invisible to JS. Sessions survive page refreshes via silent refresh on mount.
- **Axios `withCredentials: true`** — sends cookies cross-origin to the backend
- **Axios interceptors handle token refresh** — 401 triggers silent refresh and request retry (skips `/auth/` URLs to prevent loops). Failed queue mechanism handles concurrent requests during refresh.
- **API functions are plain async functions** — no custom hooks wrapping each query (YAGNI). TanStack Query calls them directly in queryFn/mutationFn.
- **Vite HMR configured for Traefik** — WebSocket connects via wss on port 443 (clientPort)
