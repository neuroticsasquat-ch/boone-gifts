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
    auth.ts          # login, register, refresh, logout, updateProfile, changePassword
    lists.ts         # getLists("owned"|"shared"), createList (occasion_ids),
                     # getShareTargets / shareListWithOccasion / unshareListFromOccasion
    gifts.ts         # Gift CRUD + claim/unclaim
    families.ts      # 13 functions — see "Families" below
    account.ts       # GET/PUT /account — the shared-account flag and its people
    occasions.ts     # A family's occasions: list, create, rename/archive
    connections.ts, shares.ts, folders.ts, invites.ts, users.ts, meta.ts
  contexts/AuthContext.tsx   # Access token in memory, silent refresh on mount
  hooks/             # useAuth, useTitle
  components/
    Layout.tsx            # App shell: one tab set (Lists · People) + outlet, badge queries
    ProtectedRoute.tsx    # Auth guard        AdminRoute.tsx — admin guard for /admin/*
    Badge.tsx             # Numeric badge overlay for nav icons
    Icons.tsx, Spinner.tsx
    ActionableBanner.tsx  # Pending connection requests + family invites, accept/decline
                          # inline. The one implementation; renders nothing when empty
    ListAttribution.tsx   # "from Jane" / "for Beth · kept by Tom" row lines
    ListForFields.tsx     # "Who is this list for?" — the shared-account picker,
                          # falling back to RecipientFields on a normal account
    RecipientFields.tsx   # The "this list is for someone else" control
  pages/             # One per route (see table below), plus Folders.tsx and
                     # FolderDetail.tsx — still unrouted; the Lists page's
                     # folder filter and list detail's "Add to a folder…"
                     # are where a user meets the concept now
    family-detail/   # OccasionsSection (the family's occasions, its create
                     # action, and the organizer-only rename and archive)
    list-detail/     # GiftsTab (the page body), SharingSummary (the header's
                     # "Shared with …" line), SharingPanel (the combined people
                     # + families picker behind the header's Change control),
                     # FolderPicker (the ⋯ menu's "Add to a folder…")
  lib/               # attribution.ts, recipient.ts, list-for.ts — who a list is for,
                     # and how that reads on a row; occasion-choice.ts — the
                     # sharing control's one-, several-, no-occasion rule
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
| `/` | — | Redirects to `/lists`; the app's entry point, not a page |
| `/lists` | `Lists` | My lists + everything shared with me, under the actionable banner. Header controls: folder filter, sort, archive |
| `/lists/new` | `CreateList` | Also shows "Share with families" checkboxes |
| `/lists/:id` | `ListDetail` | Owner view or viewer/claimer view. No tab bar: header, then the gifts. Owner header carries the sharing summary line (+ **Change**) and a `⋯` menu holding Add to a folder…, Edit, Archive and Delete; a viewer gets the same menu holding the folder action alone |
| `/people` | `People` | The People tab: families, then individuals, under the actionable banner |
| `/people/:id` | `ConnectionProfile` | |
| `/people/families/:id` | `FamilyDetail` | Members, occasions, invites, rename, delete, leave |
| `/account` | `Account` | Via the user menu |
| `/admin/invites`, `/admin/users` | `AdminInvites`, `AdminUsers` | Admin-only |

## Navigation

`Layout.tsx` holds **one** `tabs` array — **Lists · People** — driving both the mobile bottom bar and
the desktop nav, with the same labels and destinations at every screen size. The account menu holds
Account Settings and the admin links; it never duplicates a nav destination.

`ActionableBanner` is mounted on `/lists` above the lists as well as on `/people`, so a pending
connection request or family invite is reachable from either.

## Families

`src/api/families.ts` — `getFamilies`, `createFamily`, `getFamily`, `renameFamily`, `deleteFamily`, `removeMember`, `updateMemberRole`, `createInvite`, `getInvites`, `revokeInvite`, `getIncomingFamilyInvites`, `acceptFamilyInvite`, `declineFamilyInvite`. **Accept and decline take the invite `token` string, not the numeric id.**

Types: `Family` (summary with `role`, `member_count`), `FamilyMember`, `FamilyDetail`, `FamilyRef` (lightweight, embedded in `GiftList.families`), `FamilyInvite`, `IncomingFamilyInvite`. `ListFamilyShareState` is `{ id, name, shared }`, one per family the list's owner belongs to. `InviteInfo.family_name` is `null` for admin invites and the family name for family invites.

**Badges**: `Layout.tsx` runs three background queries on every page — `["unseen-shares"]` badges **Lists**, while `["connectionRequests"]` and `["familyInvites"]` are **summed into the single People badge**. Rendered as `<Badge count={n}>` inside each mobile tab icon and inline in the desktop links.
`ActionableBanner` invalidates both keys after an accept or decline, so acting on an item clears its
row and drops the badge.

**Occasions** (`src/api/occasions.ts` — `getFamilyOccasions`, `createOccasion`, `updateOccasion`): a
family's shared gifting occasion, listed on the family page by
`pages/family-detail/OccasionsSection.tsx` under `["occasions", familyId, { archived }]`. **Creating is
open to any member** — a family with no active occasion cannot be shared to at all, so nobody waits on
an absent organizer — while **rename and archive are organizer-only**, gated the same `isOrganizer` way
the member controls are. A second active occasion is warned about, never blocked: the warning names the
occasions the family already has, built from the list already on the page — `has_other_active` cannot be
read before the write it rides on, so it back-stops that warning afterwards when the list was stale. A
family with no active occasion says so outright, because that is what makes it unshareable. Archived
occasions sit behind the same in-page toggle the Lists page uses, carrying **Unarchive** so Archive is
never a one-way door; NEU-1278 replaces both toggles with one archive view.

**Register via family invite**: `Register.tsx` reads `?family_invite=<token>`; `getInviteInfo(token)` then returns a non-null `family_name`, the email field is pre-filled and locked, and a "Join the \<family\> family" subtitle is shown.

## Actionable items

`components/ActionableBanner.tsx` is the **single** implementation of accept/decline for incoming
connection requests and family invites — the logic that used to live once in `Dashboard.tsx` (deleted
in NEU-1231) and once in `PendingFamilyInvites.tsx` (replaced by this).

- Mounted on `/lists` above the lists, and on `/people`.
- Renders **nothing** when nothing is pending — no empty card, no heading.
- While an item's accept/decline is in flight, both of that item's buttons are disabled, so a
  decision cannot be taken twice. Other rows stay actionable.
- A 409 on a family invite means it was already accepted, declined, or expired: the row is refreshed
  away and the user is told the invite is no longer valid.

## List sharing

Visibility is an explicit grant on the backend — per-(list, user) for people, per-(list, occasion) for families, never implied by co-membership. **The backend is always the gate — hidden or read-only UI is not.**

**A list is shared to an occasion, never to a family** (project spec §5.1, frontend ADR 0002). The
family is still the row a user sees, because that is who they recognise; the occasion underneath is
what the share points at. `lib/occasion-choice.ts` states the resulting three-state rule once, for
both surfaces that render it:

| The family has | The row |
|---|---|
| Exactly one active occasion | Its name is **displayed, not offered** — ticking shares to it, and sharing stays one click |
| Several | A `<select>` accompanies the checkbox; ticking before choosing is **refused client-side**, as it is server-side |
| None | Rendered, **disabled**, with the reason — a family with no active occasion cannot be shared to at all |

An **archived** occasion is never a choice, but it still arrives on a family whose share was made
before it was archived: archiving blocks new shares and nothing else, so the row stays operable (it
is the only way to switch that grant off) and names the occasion "— archived".

- **Who can see this list** (`list-detail/SharingPanel.tsx`) — the one owner-facing sharing surface, opened by the header's **Change** control. A **People** group (one checkbox per connection, checked when shared) and a **Families** group (one per family, per the table above), in that order — the same order the summary line reads in. It writes through `/lists/{id}/shares` and `/lists/{id}/occasions/{occasion_id}`; there is no combined sharing endpoint. The **families half reads `/lists/{id}/families`** — the resource is still "which families can this list reach", each carrying its occasions. A family with several keeps its select once shared, **disabled** and naming the occasion reached: the row holds one shape as the box is ticked, and moving a share is untick-then-tick, which is also the only order in which the claims question can be asked.
- A **409 on the PUT** means the occasion was archived after the panel loaded. It is surfaced as its own message naming the cause and the way out — not the generic failure toast, which would leave the owner clicking a box that is never going to tick.
- **Owner-only.** The header summary line names who the list actually reaches — people first, then each occasion as "Boone Family · Christmas 2026", because naming the family alone would claim more reach than the list has — and always carries the Change control that opens the panel. A list that reaches **nobody** says so outright — "This list isn't shared with anyone." in a line set apart from the ordinary summary — because since simple mode was retired nothing grants a list to a family on the owner's behalf (project spec §8). It is the mitigation for that, not decoration — but it is not a warning either, because a private list is a legitimate choice. A failed `shares` or `families` fetch is **not** an empty one and says so instead. Like every owner-facing surface it reveals nothing about claims.
- A **409 on `POST /lists`** is the same archived occasion, caught between the create form loading and being submitted. It gets its own message for the same reason: "try again" is a lie when the identical submission will keep failing.
- **Create form** (`CreateList.tsx`) — a "Share with families" fieldset posting `occasion_ids`, with the same three row shapes. **Pre-checked, narrowed by M3**: a family arrives checked only when it has **exactly one active occasion**, the only shape where ticking needs no further answer. Hidden when the user belongs to no families. The default lives in `tickedFamilyIds` as `null` meaning "untouched", so a late answer still arrives checked without an effect re-seeding over a deliberate uncheck; the selects' values live in a separate `picked` map, because naming an occasion is not the same as saying the list should reach that family. There is no endpoint answering "my families and their occasions" in one call, so the form fans out over `useQueries` — a user's families are few. Submit is blocked while any of those are pending (posting no `occasion_ids` would silently skip the pre-check) and while any ticked family has no occasion chosen.
- **Revoke dialog** — a 409 from the occasion DELETE means members of that occasion's family hold claims that revoking would orphan. The modal offers **Release those claims** / **Keep them claimed** / **Cancel**, re-issuing with `claims=release` or `claims=keep`. It shows **no counts and no gift or claimer names**: owners are blind to claim state on their own lists.

## Recipients

A list can name a recipient, and since NEU-1241 that means exactly one thing: **a person who does not use the app**. The co-resident case the old "they use this app" radio described is the account-people picker instead (see below), so a recipient name is on its own the whole predicate — claims are hidden from the keeper and the keeper cannot claim, always.

`RecipientFields.tsx` is the shared "this list is for someone else" control (create form and edit header); `lib/recipient.ts` holds its value type and payload mapping, `lib/attribution.ts` turns a list into its display line, and `ListAttribution.tsx` renders it — "from Jane" for a list someone shared, "for Beth · kept by Tom" for one kept on behalf of a person with no account. The keeper's warning under the name field is unconditional: it is the only case left.

## Who is this list for?

On a **shared account** every list says which of the account's people it is for, and the create form
and edit header ask outright: a required radio group naming each person, plus "Both of us" and
"Someone else" (NEU-1237). `ListForFields.tsx` is that picker and the single control both forms
mount; `lib/list-for.ts` holds the answer as one tagged union and maps it to the two fields the API
takes.

- **The requirement lives on the client.** `POST /lists` accepts a list that names neither person nor
  recipient — that is a household list — so nothing server-side forces an answer. "Both of us" is how
  the household case is said out loud, and it sends `null` for both fields.
- **Exclusivity is structural.** `account_person_id` and `recipient_name` are mutually exclusive on
  the API (400 either way round); modelling the answer as a union means switching branches drops the
  other's value, so both can never travel set. Choosing a person clears a typed recipient name and
  choosing "Someone else" clears the person — in the UI as well as the payload.
- **"Someone else" is a branch of the picker, not a sibling.** `RecipientFields`' disclosure checkbox
  is *the* control on a non-shared account and is absent on a shared one, where the radio is the
  disclosure; both render the same `RecipientDetails` body underneath.
- **A non-shared account sees no picker at all** — the form is today's. `GET /account` (`["account"]`,
  shared with the Account page's card) is what tells the two apart, and until it answers the form
  renders the non-shared shape.
- The owner-side label — "for Gran" on their own rows and in the list header — comes from
  `recipientLabel` in `lib/attribution.ts`. A *viewer* is told nothing about account people: to
  everyone else the account is one identity (project spec §5.1).

## Folders

A folder is a user's saved grouping of lists — called a "collection" until NEU-1229 and an
"occasion" until NEU-1259, which vacated that word for a family's shared occasion (see
`docs/adr/0002-occasion-and-folder.md`). It has **no top-level route** any more, so the **folder
filter on `/lists` is the primary place a user meets the concept**, and it carries the explanation
the old page's blurb used to.

**Membership is an action on the list, not a tab.** `list-detail/FolderPicker.tsx` is opened by
"Add to a folder…" in list detail's `⋯` menu — a checkbox per folder, ticked where this list is
already a member, plus a field that creates one and files the list under it in a single step. It
replaces the tab retired in NEU-1240.

- **Owner or viewer.** Filing someone else's list under "Christmas 2026" is the main use of the
  feature, so the `⋯` menu exists on the viewer header too, holding this one item. It is a viewer's
  only entry point to folders, so it must keep working for them.
- A folder is private to whoever owns it: the picker always shows the *viewer's* own folders,
  and nothing about the list or its owner travels through it.
- Membership writes through `/folders/{id}/items`; the checked state comes from
  `/folders/for-list/{list_id}` (`["folders-for-list", listId]`).
- The picker and the sharing panel share the header's one panel slot, so opening either closes the
  other.
- The filter is a `<select>` in the Lists page header, defaulting to "All lists". It narrows **both**
  sections at once; a list in several folders is matched by each of them.
- It renders only when the viewer has at least one folder — a select whose sole option is
  "All lists" would name a concept it cannot explain.
- Membership comes from `getFolder(id).lists` (`["folder", id]`), not from a per-list lookup, so
  one request answers the whole page.

**Sort is one page-level control, not one per section.** The Lists page used to hold two independent
sort selects (`ownedSort`, `sharedSort`); NEU-1238 moved sort into the header row shared with the
folder filter, and a page-level control that sorts one section is a lie. So the two states
collapsed into one `sortBy` governing both — the same both-sections-at-once reach the folder filter
has. This deliberately diverges from the project spec §4.2 wireframe, which still draws `[sort ▾]`
against each section heading.

## Testing
- ~335 test cases across 31 files, run inside the container via `task test`
- MSW mocks live in `src/test/mocks/handlers.ts` (default `/auth/refresh → 401`); setup in `src/test/setup.ts`

## Critical conventions
- **Docker**: `node_modules` lives in a named volume so the bind mount can't shadow it. After `task add`, rebuild the image.
- **Vite HMR**: WSS on port 443 (`clientPort`) so it works behind the workspace's TLS proxy.
- **Never store the access token in localStorage** — `src/api/client.ts` keeps it in memory and exports `setAccessToken` / `getAccessToken` / `clearAccessToken`.
- **Type imports**: use `import type { ... }` — `verbatimModuleSyntax` is on.
- **Types** in `src/types/index.ts`: `AuthUser` is decoded from the JWT payload (`role`), and `Gift` vs `GiftOwnerView` are separate because owners get responses without claim fields.

## Debugging CI failures
- **If told a CI/workflow run failed, always investigate via `gh` first** before running anything locally or claiming it's fixed: `gh run list -w CI` to find the failed run, then `gh run view <id> --log-failed`.
- **Never report something as fixed based on local runs alone** — CI runs `npx oxlint` and `npx vitest run` in a clean node environment and may surface issues local runs miss. Push, then confirm a fresh CI run passes before declaring done.

## Commits and release notes

**Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/), and this is load-bearing**: `RELEASE_NOTES.md` is generated from the commit history by [git-cliff](https://git-cliff.org/), configured in `cliff.toml` at the repo root. A commit subject *is* its release-note entry.

```
<type>(<scope>): <description> (NEU-1234)
```

- **Type decides whether the commit appears at all.** Only `feat`, `fix`, `perf` and `revert` are kept. `chore`, `ci`, `test`, `build`, `style`, `refactor` and `docs` are skipped outright, as is anything that doesn't parse as a conventional commit (`filter_unconventional = true`). A breaking change survives whatever its type (`protect_breaking_commits = true`).
- **Every commit carries a scope.** `type(scope):`, never a bare `type:`. This is a hard rule, not a preference: entries are grouped by *scope*, not by type, so the scope **is** the section heading — `feat(families):` and `fix(families):` land together under `### Families`. Omit it and the entry falls into the `### General` catch-all (`default_scope = "general"`), which is where release notes go to become unreadable.
- **Scope the skipped types too.** `docs`, `chore`, `test` and friends never reach the notes today, but scoping them costs nothing, keeps the log uniform to read and grep, and means the history is already correct if `cliff.toml`'s parsers ever change. Pick the scope from the area of the codebase the change lives in — the same vocabulary the existing sections use.
- **The description is the entire entry.** git-cliff renders the description alone, capitalised, with the `type(scope):` prefix stripped. The line has to stand on its own without the type or scope for context: imperative mood, ≤72 chars, no trailing period.
- **Ticket ID last, as a trailing parenthetical.** The squash merge appends the PR number, and both are rewritten into links (Linear, GitHub) when the notes render.

**No co-author lines, no footers** — they land in the generated notes.

**One ticket, at most one entry.** Work branches are squash-merged, so a ticket contributes exactly one commit. That is why the PR title has to be a well-formed Conventional Commit subject: it becomes the squash commit's subject, and thence the release-note line.

**Releases are cut by hand.** There is no release workflow — `git cliff` is run locally to update `RELEASE_NOTES.md`, then the release is tagged (`tag_pattern = "v[0-9].*"`) and pushed. Nothing regenerates the notes afterwards, so a subject that was wrong at merge time can only be fixed by rewriting history or editing the notes directly. `git cliff --unreleased` previews what the next release will read like.

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
