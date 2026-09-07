# Boone Gifts Frontend — Agent Guide

React 19 SPA for Boone Gifts. TypeScript, Vite, Tailwind v4. Runs entirely in Docker — no host `node_modules`.

## Quick start
```bash
cp .env.example .env              # VITE_API_URL points at the backend
task -d .. up                     # start the whole stack (api, web, mail)
```
Dev web on `http://localhost:5173`, API on `http://localhost:8000`, Mailpit on `http://localhost:8025`.

## Commands

**Stack lifecycle lives in the workspace root** (`~/project/Taskfile.yml`), not here — the compose file is one level up and is rendered by the Coder template, so don't edit it in the workspace:
- `task up` / `task down` / `task ps` — whole stack
- `task restart -- web` / `task rebuild -- web` / `task logs -- web` / `task shell -- web`

**Repo tasks** (from this directory, or prefixed `fe:` from the root). Every one runs **inside the container**:
- `task test` — `npx vitest run`
- `task test-file -- <path>` — a single test file
- `task test-watch` — `npx vitest` in watch mode
- `task lint` — `npx oxlint`
- `task build` — `npx vite build` (production build)
- `task add -- <pkg>` / `task remove -- <pkg>` — npm install/uninstall
- `task install` — `npm ci`, after pulling lockfile changes

## Stack & config
- **React 19** / **TypeScript 7** / **Vite 8** / **Tailwind v4** (Vite plugin, no PostCSS)
- **React Router v7** in library/SPA mode via `createBrowserRouter`
- **TanStack Query v5** + **Axios** (`withCredentials: true`) — API functions are plain async functions called directly in `queryFn`/`mutationFn`; no custom query hooks (YAGNI)
- **Testing**: Vitest (jsdom) + React Testing Library + MSW
- **Lint**: oxlint with react-hooks rules enforced (`rules-of-hooks`, `exhaustive-deps`)
- **Build**: `tsc -b && vite build` — TypeScript errors block the build
- **tsconfig strict**: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`

## Architecture

**Entry**: `src/main.tsx` → `App.tsx` (providers: QueryClient, Auth, Router, Sentry ErrorBoundary).

**Auth**: access token in memory (module-level variable in `api/client.ts`), refresh token in a backend-managed HttpOnly cookie. Silent refresh on mount restores sessions; a 401 triggers refresh and retry, skipping `/auth/` URLs to avoid loops, with a failed-request queue for concurrent 401s.

**Routing**: `routes.tsx` — public paths, then `ProtectedRoute` → `Layout` (nav shell) for authenticated pages.

```
Dockerfile           # node:22-slim, npm ci, idles
Taskfile.yml         # Repo tasks (stack lifecycle lives one level up)
index.html           # Vite entry HTML
vite.config.ts       # Vite + Tailwind + Vitest + Sentry plugin config
src/
  main.tsx           # React DOM entry
  App.tsx            # Providers
  routes.tsx         # Route definitions
  index.css          # Tailwind import
  api/
    client.ts        # Axios instance, JWT interceptors (set/get/clearAccessToken)
    auth.ts          # login, register, refresh, logout, updateProfile, changePassword, toggleSimpleMode
    lists.ts         # getLists("owned"|"shared"|"family"), createList (family_ids),
                     # getListFamilies / shareListWithFamily / unshareListFromFamily
    gifts.ts         # Gift CRUD + claim/unclaim
    families.ts      # 13 functions — see "Families" below
    connections.ts, shares.ts, occasions.ts, invites.ts, users.ts, meta.ts
  contexts/AuthContext.tsx   # Access token in memory, silent refresh on mount, toggleSimpleMode
  hooks/             # useAuth, useTitle
  components/
    Layout.tsx            # App shell: nav + outlet, simple-mode branching, badge queries
    ProtectedRoute.tsx    # Auth guard        AdminRoute.tsx — admin guard for /admin/*
    Badge.tsx             # Numeric badge overlay for nav icons
    Icons.tsx, Spinner.tsx
    PendingFamilyInvites.tsx  # Inline accept/decline for incoming family invites
    ListAttribution.tsx   # "from Jane" / "for Beth · kept by Tom" row lines
    RecipientFields.tsx   # The "this list is for someone else" control
  pages/             # One per route (see table below)
    list-detail/     # GiftsTab, SharedWithTab, FamiliesTab, OccasionsTab
  lib/               # attribution.ts, recipient.ts — list recipient/attribution logic
  types/index.ts     # Types mirroring the backend Pydantic schemas
  test/
    setup.ts         # Vitest setup (Testing Library + MSW)
    mocks/           # handlers.ts (includes /auth/refresh → 401), server.ts
```

## Routes

| Path | Component | Notes |
|---|---|---|
| `/login` | `Login` | Public |
| `/register` | `Register` | Public; reads `?token=` (admin invite) or `?family_invite=` (family invite) |
| `/forgot-password` | `ForgotPassword` | Public |
| `/reset-password` | `ResetPassword` | Public |
| `/family-invites/:token` | `AcceptFamilyInvite` | Authenticated, outside `Layout` |
| `/` | `Dashboard` | Summary + connection requests; no nav entry in simple mode |
| `/lists` | `Lists` | Owned + directly shared lists |
| `/lists/new` | `CreateList` | Full mode also shows "Share with families" checkboxes |
| `/lists/:id` | `ListDetail` | Owner view or viewer/claimer view |
| `/connections` | `Connections` | Hidden from simple-mode nav |
| `/connections/:id` | `ConnectionProfile` | |
| `/occasions` | `Occasions` | Hidden from simple-mode nav |
| `/occasions/:id` | `OccasionDetail` | |
| `/families` | `Families` | Hidden from simple-mode nav |
| `/families/:id` | `FamilyDetail` | Members, invites, rename, delete, leave |
| `/family-lists` | `FamilyLists` | Co-members' lists grouped by family; simple mode's second tab |
| `/account` | `Account` | Both modes, via the user menu |
| `/admin/invites`, `/admin/users` | `AdminInvites`, `AdminUsers` | Admin-only |

## Simple mode

A reduced navigation for users who only need their own lists and their family's.

- `AuthUser.simple_mode` is decoded from the JWT payload by the same `decodePayload()` call that reads `role`
- `AuthContext.toggleSimpleMode()` calls the API, receives a new JWT, stores it, and re-decodes user state
- The Account page's **View mode** card is the toggle, reachable in both modes

| Mode | Tabs (desktop and mobile) |
|---|---|
| Full | Home · Lists · Connect · Families · Occasions |
| Simple | My Lists · Family Lists |

`Layout.tsx` picks `simpleTabs` or `fullTabs` from `user?.simple_mode` for the mobile bottom bar, and renders the same split inline in the desktop nav.

## Families

`src/api/families.ts` — `getFamilies`, `createFamily`, `getFamily`, `renameFamily`, `deleteFamily`, `removeMember`, `updateMemberRole`, `createInvite`, `getInvites`, `revokeInvite`, `getIncomingFamilyInvites`, `acceptFamilyInvite`, `declineFamilyInvite`. **Accept and decline take the invite `token` string, not the numeric id.**

Types: `Family` (summary with `role`, `member_count`), `FamilyMember`, `FamilyDetail`, `FamilyRef` (lightweight, embedded in `GiftList.families`), `FamilyInvite`, `IncomingFamilyInvite`. `ListFamilyShareState` is `{ id, name, shared }`, one per family the list's owner belongs to. `InviteInfo.family_name` is `null` for admin invites and the family name for family invites.

**Badges**: `Layout.tsx` runs three background queries on every page — `["connectionRequests"]` → Connections, `["unseen-shares"]` → Lists, `["familyInvites"]` → Families — rendered as `<Badge count={n}>` inside each mobile tab icon and inline in the desktop links.

**Register via family invite**: `Register.tsx` reads `?family_invite=<token>`; `getInviteInfo(token)` then returns a non-null `family_name`, the email field is pre-filled and locked, and a "Join the \<family\> family" subtitle is shown.

## Per-family list sharing

Family visibility is an explicit per-(list, family) grant on the backend, not implied by co-membership. **The backend is always the gate — hidden or read-only UI is not.**

- **Create form** (`CreateList.tsx`) — a "Share with families" fieldset of **unchecked** checkboxes posting `family_ids`. Hidden when the user belongs to no families, and in simple mode, where the backend shares with every family regardless and a control would be a lie.
- **List detail** (`list-detail/FamiliesTab.tsx`) — owner-only. Full mode renders one toggle per family. Simple mode **still shows the tab** — unlike "Shared with", which stays hidden — read-only, plus a link to Account settings, because a simple-mode user can own a list created in full mode and deliberately left unshared.
- **Revoke dialog** — a 409 from the DELETE means members of that family hold claims that revoking would orphan. The modal offers **Release those claims** / **Keep them claimed** / **Cancel**, re-issuing with `claims=release` or `claims=keep`. It shows **no counts and no gift or claimer names**: owners are blind to claim state on their own lists.

## Recipients

A list can name a recipient. `RecipientFields.tsx` is the shared "this list is for someone else" control (create form and edit header); `lib/recipient.ts` holds its value type and payload mapping, `lib/attribution.ts` turns a list into its display line, and `ListAttribution.tsx` renders it — "from Jane" for a list someone shared, "for Beth · kept by Tom" for one kept on behalf of a person with no account.

## Testing
- ~215 test cases across 26 files, run inside the container via `task test`
- MSW mocks live in `src/test/mocks/handlers.ts` (default `/auth/refresh → 401`); setup in `src/test/setup.ts`

## Critical conventions
- **Docker**: `node_modules` lives in a named volume so the bind mount can't shadow it. After `task add`, rebuild the image.
- **Vite HMR**: WSS on port 443 (`clientPort`) so it works behind the workspace's TLS proxy.
- **Never store the access token in localStorage** — `src/api/client.ts` keeps it in memory and exports `setAccessToken` / `getAccessToken` / `clearAccessToken`.
- **Type imports**: use `import type { ... }` — `verbatimModuleSyntax` is on.
- **Types** in `src/types/index.ts`: `AuthUser` is decoded from the JWT payload (`simple_mode` + `role`), and `Gift` vs `GiftOwnerView` are separate because owners get responses without claim fields.

## Debugging CI failures
- **If told a CI/workflow run failed, always investigate via `gh` first** before running anything locally or claiming it's fixed: `gh run list -w CI` to find the failed run, then `gh run view <id> --log-failed`.
- **Never report something as fixed based on local runs alone** — CI runs `npx oxlint` and `npx vitest run` in a clean node environment and may surface issues local runs miss. Push, then confirm a fresh CI run passes before declaring done.

## Pre-commit (planned, not yet installed)
Pre-commit will live **on the host** (system Python), not in the container; its hooks delegate to `task` commands that run the checks inside Docker (`task lint`, `task test`). Never install pre-commit or its hooks inside the container.

## Production
- **Deploy**: push `main` → Cloudflare Pages builds (`npm ci && npm run build`) and deploys to the CDN.
- **Domain**: `app.boone.gift`
- **Sentry**: `VITE_SENTRY_DSN`, initialised in `main.tsx`; the Sentry Vite plugin uploads source maps with `SENTRY_AUTH_TOKEN`.

## Environment essentials
| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL (prod: `https://api.boone.gift`) |
| `VITE_SENTRY_DSN` | Leave empty to disable Sentry |
| `SENTRY_AUTH_TOKEN` | Build-time only, for source map upload |
