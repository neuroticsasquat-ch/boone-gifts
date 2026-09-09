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

**Auth**: access token in memory (module-level variable in `api/client.ts`), refresh token in a backend-managed HttpOnly cookie. Silent refresh on mount restores sessions; a 401 triggers refresh and retry, skipping `/auth/` URLs to avoid loops, with a failed-request queue for concurrent 401s. When that refresh gives up, the interceptor calls the handler `AuthProvider` registered via `setSessionEndedHandler`, which clears the user and lands the viewer on `/login` rather than leaving a mounted page with a dead token.

**The query cache is dropped whenever the viewer changes** — an effect in `AuthProvider` keyed on `user?.id`, covering logout, an account switch, and a token-expiry re-login alike. This is *why* no `queryKey` carries a user id: don't "fix" the keys by adding one. A viewer *departing* triggers `queryClient.clear()`; a viewer *arriving* removes only unobserved entries (`removeQueries({ type: "inactive" })`), because a mutation can write its response in after the departure clear, while clearing an in-flight query would leave its observer pending forever. It is a **`useLayoutEffect`** and must stay one — a passive effect runs after paint, and after a mounting screen's own passive effect has claimed the stale entry and made it active, which spares it from the sweep. Keyed on the id, not the user object, so `updateProfile` renaming someone is not a change of viewer. `AuthProvider` therefore requires a `QueryClientProvider` above it — `App.tsx` and every test that renders it must supply one. See [ADR 0004](docs/adr/0004-the-query-cache-is-cleared-at-the-identity-boundary.md).

**Routing**: `routes.tsx` — public paths, then `ProtectedRoute` → `Layout` (nav shell) for authenticated pages. Every numeric `:id` route is wrapped in `<NumericId back="…">` (`components/NumericId.tsx`), which validates the id before the page mounts and renders a bad-address arm when it doesn't parse — so pages read the id with `useNumericId()` as a plain `number` and carry no `enabled:` id guard. `family-invites/:token` is deliberately unwrapped. `routes.test.tsx` walks the array and fails on an unwrapped `:id` route. See [ADR 0006](docs/adr/0006-route-ids-are-validated-at-the-route.md).

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
    gifts.ts         # Gift CRUD + claim/unclaim + purchase/unpurchase
                     # (purchase carries what the claimer paid)
    families.ts      # 13 functions — see "Families" below
    account.ts       # GET/PUT /account — the shared-account flag and its people
    occasions.ts     # A family's occasions: list, read, create, rename/archive,
                     # the lists shared to one, its shopping payload, and the
                     # caller's own budget for it (PUT/DELETE .../budget)
    claims.ts        # updateClaim — PATCH /claims/{id}, the only way to correct
                     # a recorded amount without re-stamping the purchase
    connections.ts, shares.ts, folders.ts, invites.ts, users.ts, meta.ts
  contexts/AuthContext.tsx   # Access token in memory, silent refresh on mount
  hooks/             # useAuth, useTitle, useTimeout (a setTimeout that clears on unmount)
  components/
    Layout.tsx            # App shell: one tab set (Lists · People) + outlet, badge queries
    ProtectedRoute.tsx    # Auth guard        AdminRoute.tsx — admin guard for /admin/*
    Badge.tsx             # Numeric badge overlay for nav icons
    HeaderMenu.tsx        # The `⋯` menu a page header hangs its actions off —
                          # list detail's owner and viewer menus, and the
                          # occasion page's organizer-only one
    Icons.tsx, Spinner.tsx
    ActionableBanner.tsx  # Pending connection requests + family invites, accept/decline
                          # inline. The one implementation; renders nothing when empty
    ListAttribution.tsx   # "from Jane" / "for Beth · kept by Tom" row lines
    MyShopping.tsx        # The My shopping tab both the occasion and folder
                          # pages mount — the viewer's own claims, grouped by
                          # list, with the purchase tick and what they paid
    BudgetLine.tsx        # The line at the top of that tab — the viewer's own
                          # spend against their own target, set/edited/cleared
                          # inline, always disclosing unpriced purchases
    TabBar.tsx            # The Lists · My shopping bar those two pages share
    ListForFields.tsx     # "Who is this list for?" — the shared-account picker,
                          # falling back to RecipientFields on a normal account
    RecipientFields.tsx   # The "this list is for someone else" control
  pages/             # One per route (see table below), plus Folders.tsx — the
                     # folder *index*, still unrouted; the Lists page's folder
                     # filter and list detail's "Add to a folder…" are where a
                     # user meets the concept
    ListsArchive.tsx    # /lists/archive — archived lists and folders, the one
                        # way in from the Lists dashboard
    FamilyArchive.tsx   # /people/families/:id/archive — a family's archived
                        # occasions, the one way in from its page
    OccasionDetail.tsx  # /occasions/:id — a family occasion, its lists, and
                        # the viewer's own shopping for it
    FolderDetail.tsx    # /folders/:id — the same two tabs for a user's folder
    family-detail/   # OccasionsSection (the family's occasions, its create
                     # action, and the organizer-only rename and archive)
    list-detail/     # GiftsTab (the page body), SharingSummary (the header's
                     # "Shared with …" line), SharingPanel (the combined people
                     # + families picker behind the header's Change control),
                     # FolderPicker (the ⋯ menu's "Add to a folder…")
  lib/               # list-grouping.ts — how Shared with me subdivides under Group by;
                     # attribution.ts, recipient.ts, list-for.ts — who a list is for,
                     # and how that reads on a row; occasion-choice.ts — the
                     # sharing control's one-, several-, no-occasion rule;
                     # money.ts — formatMoney, the one place money becomes text;
                     # shopping.ts — ShoppingScope and the shoppingKey cache key
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
| `/lists` | `Lists` | My lists + everything shared with me, under the actionable banner. Header controls: folder filter, sort, group by. **Active only** — the archive is its own page, linked at the foot |
| `/lists/archive` | `ListsArchive` | Archived lists (owned and shared) and archived folders. Read-only: rows link to the detail pages that own unarchive |
| `/lists/new` | `CreateList` | Also shows "Share with families" checkboxes |
| `/lists/:id` | `ListDetail` | Owner view or viewer/claimer view. No tab bar: header, then the gifts. Owner header carries the sharing summary line (+ **Change**) and a `⋯` menu holding Add to a folder…, Edit, Archive and Delete; a viewer gets the same menu holding the folder action alone |
| `/people` | `People` | The People tab: families, then individuals, under the actionable banner |
| `/people/:id` | `ConnectionProfile` | |
| `/people/families/:id` | `FamilyDetail` | Members, **active** occasions, invites, rename, delete, leave |
| `/people/families/:id/archive` | `FamilyArchive` | That family's archived occasions, each linking to `/occasions/:id`. Any member may look |
| `/occasions/:id` | `OccasionDetail` | A family occasion: header, tab bar (**Lists · My shopping**), and the lists shared to it. The `⋯` menu's rename and archive are organizer-only |
| `/folders/:id` | `FolderDetail` | One user's folder, with the same two tabs. There is no `/folders` index — `Folders.tsx` stays unrouted; a **Group by: Folder** heading on `/lists` is the one link here |
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
occasions are **not here at all**: a "View archive" link goes to `/people/families/:id/archive`
(NEU-1278), so the section holds one shape and nothing archived reaches the family page.

**The occasion page** (`pages/OccasionDetail.tsx`, `/occasions/:id`) is where an occasion is met on its
own: its name and family in the header, a back link to `/people/families/:id`, and a tab bar of
**Lists · My shopping**. **Lists** is every list shared to the occasion that the viewer can see, from
`/occasions/{id}/lists`, which filters by `can_view_list` so a list the viewer cannot see is *absent*
rather than greyed; **My shopping** is `components/MyShopping.tsx` scoped to this occasion. The bar is
driven by a `TABS` array and the body by the active key, which is what made the second tab an entry
plus a panel rather than a reshaping. The `⋯` menu carries rename and archive, **organizer
only** and gated on the family's members exactly as the family page's controls are — the backend
enforces both, so a 403 still has a message. An **archived** occasion renders like any other, carrying
an Archived pill and offering Unarchive: archiving takes an occasion out of the default views and does
nothing else (project spec §5.4).

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

## Claims and purchases

A claim lives on its own row on the backend (backend ADR 0003), and `GiftRead` flattens it onto the
gift for the people the list was shared with: `claimed_by_id`, `claimed_at`, `purchased_at` and
`amount_paid`. **`GiftOwnerView` carries none of them**, so an owner-facing surface has nothing to
leak — the rule is structural, not serializer discipline, and `list-detail/GiftsTab.tsx` renders the
purchase controls from the viewer branch alone.

**`amount_paid` is what the *claimer* paid; `price` is the *owner's* asking price.** They are never
interchangeable. Both arrive as **strings**, because the backend serialises `Decimal` that way
(Pydantic v2 default). Anywhere a number is actually needed, coerce with `Number(...)`, as the
viewer's price sort already does. **Anywhere one is displayed, go through `formatMoney`**
(`src/lib/money.ts`) — never a hardcoded `$` before a raw value. It pads short decimals, groups
thousands, and returns `null` for absent/blank/unparseable so the call site can guard its markup on
the formatted value. Currency is single and implicit (ADR 0003).

`PurchaseControl` (in `GiftsTab.tsx`) is the tick and the amount prompt:

- **Ticking reveals the prompt; it does not record the purchase.** **Save** and **Skip** are what
  commit it, so an amount the user meant to type is never lost to a tick they wandered away from.
  **Skip is one click** and records the purchase with no amount. Unticking an unanswered prompt
  abandons it — nothing was recorded, so there is nothing to undo.
- The field **arrives empty**, seeded only from the claimer's *own* recorded amount when they are
  editing one. The owner's asking price sits beside it as "listed at $39" and **never inside it** —
  a budget pre-filled from someone else's wishlist price looks precise and is a guess
  (project spec §6.3).
- **Omitting `amount_paid` and sending an explicit `null` are different requests**, and the backend
  tells them apart by whether the field is set. `purchaseGift(listId, giftId)` omits it, leaving any
  recorded amount alone; `purchaseGift(listId, giftId, null)` clears it. That distinction is what
  makes unticking and re-ticking non-destructive, so don't collapse the two.
- **Unticking leaves the amount** (the server keeps it for re-ticking); **unclaiming discards it**,
  because the claim row goes with it and there is no explicit reset to write.
- A purchase with no amount says "no amount recorded" rather than showing nothing: an understated
  total must read as an understatement (project spec §7).
- On an **archived list** the control goes read-only rather than disappearing — the tick is disabled
  but what the claimer already bought still shows, the same way `✓ Yours` survives while the claim
  and unclaim buttons don't.

**Filing a claim under an occasion** is asked about only when there is genuinely a choice. The
viewer payload carries `claim_candidates` (the backend's `suggested` set) and `claim_options` (the
wider `allowed` set); **`claim_candidates.length >= 2` is the entire prompting rule**. At 0 or 1 the
row claims on one click and sends no `occasion_id` at all — the server files it — and that path must
not regress, because it is nearly every claim.

- **Prompt from the payload, never from an error.** A stale `occasion_id` now returns **201 with the
  filing corrected**, deliberately: claiming is competitive and a revoked share must never cost
  someone the gift. The only claim-path error left is **400 `ambiguous_occasion`**, which means this
  client failed to prompt. It is handled — refetch, then ask again, since a share added while the
  page sat open is the one innocent way to reach it — and **reported to Sentry**, because a client
  that has silently stopped prompting files every claim under nothing and nothing else would ever
  catch it. It is a bug signal, not a branch to design around. `PATCH /claims/{id}` **does** 403 on an occasion outside `allowed`; that one is real.
- `ClaimOccasionPrompt` (in `GiftsTab.tsx`) is the picker. Nothing is pre-selected and Save is
  disabled until an occasion is chosen — the same refuse-before-committing rule the sharing control
  applies to the identical question. Every choice reads "Boone Family · Christmas 2026", because two
  families routinely both have a "Christmas 2026", and an archived one says "— archived".
- **"Show past occasions"** reveals what is in `claim_options` but not `claim_candidates` — archived
  occasions, in practice. Without it the correction path exists in the API and no UI can reach it, and
  a January purchase could never be filed under the Christmas it was actually for.

**On list detail, correcting an amount is untick-then-tick**, and there is deliberately no in-place
edit there. Post-hoc correction belongs to the **shopping tabs** (project spec §6.2), which carry the
`claim_id` that `PATCH /claims/{id}` needs and the list-detail payload does not. An edit built on a
second `POST /purchase` would re-stamp `purchased_at` to today (`app/gifts/service.py` sets it
unconditionally), silently moving a purchase across an occasion boundary — so `api/claims.ts` is the
only path an amount edit takes.

## My shopping

`components/MyShopping.tsx` is the **My shopping** tab, mounted by both the occasion page and the
folder page and scoped by a `ShoppingScope` — `{ kind: "occasion" | "folder", id }`. One component,
because the two reads (`GET /occasions/{id}/shopping`, `GET /folders/{id}/shopping`) return the same
`ShoppingItem[]` from the same backend select and differ only in what bounds the set: an occasion the
claims are *filed under*, or a folder the claimed-from lists are *in*. Keyed `["shopping", kind, id]`.

- **Only ever the viewer's own claims.** The endpoints take no parameter that could widen it, so this
  is structural rather than a filter applied here (`CONTEXT.md` rule 2).
- **Grouped on `list_id`, never on `list_name`** — two lists routinely share a name and grouping on
  it would silently merge them under one heading. Order comes from the backend and is stable.
- **Two amount paths, deliberately not one.** Ticking an unbought claim reveals the same prompt list
  detail's `PurchaseControl` does — Save and Skip commit, the asking price is a "listed at $39" hint
  beside the field and never inside it. A claim that is *already* bought is corrected in place
  instead: **Add amount** / **Edit** opens the field and saves through `PATCH /claims/{id}`. Saving
  it empty clears the amount; **Cancel** is the way out without changing anything.
- **Both fields seed from the claimer's own `amount_paid` and from nothing else** — empty on a claim
  never priced, and carrying the last answer on one that was unticked. Unticking leaves `amount_paid`
  standing on the server so re-ticking need not retype it (project spec §10.4), and because a blank
  field saves as an explicit `null`, a prompt that arrived blank would quietly destroy it.
- An archived occasion still serves its shopping payload — archiving takes an occasion out of the
  default views and does nothing else.
- A change here invalidates `["list", listId]` too, because it is the same claim list detail renders.
- **The read is a payload, not a list.** `GET .../shopping` returns `{ budget, items }` — the rollup
  travels *with* the claims because the two are one screen and must agree, and a budget line fetched
  behind a second request can render a total the list beneath it contradicts. A purchase moves
  `spent` as well as the row, so one invalidation of that key refreshes both.
- **The cache key is `lib/shopping.ts`'s `shoppingKey(scope)`, not a literal.** Two components read
  and write the entry (`MyShopping` the whole payload, `BudgetLine` its budget half), and a key
  restated in a second file is a cache bug waiting to happen. `ShoppingScope` lives there with it —
  out of the component modules so Fast Refresh keeps working.

## Budget line

`components/BudgetLine.tsx` sits at the top of **My shopping**, on both pages, rendered from the
`budget` half of the payload (project spec §7, §9.2):

```
$142 of $200 spent · $58 left            [ Edit budget ]
3 of 7 bought · 2 purchases with no amount recorded
```

- **Every figure is the viewer's own.** No endpoint aggregates spend across accounts, so there is
  nothing here that could be anyone else's (`CONTEXT.md` rule 5).
- **The unpriced count renders whenever it is non-zero**, and is not dropped to tidy the layout. A
  purchase with no amount counts as bought and never toward `spent`, so without that clause the
  money line reads as fact when it is an understatement. This is the honesty requirement, not a
  nicety.
- **Over budget is stated plainly** — `$12.00 over`, no red, no `role="alert"`. A budget is a target,
  not a limit, and a line that scolds is one people stop setting.
- **No budget set** still shows the spend and the tally, with `[ Set budget ]` in place of
  `[ Edit budget ]`; `amount === null` is the whole signal for which.
- **Set/edit is `PUT`, clearing is its own `DELETE` button** — an empty field does *not* clear, unlike
  the claim amount field, because clearing is a different request and the backend answers 404 when
  there is no budget to remove. Zero is a real target and saves; empty and negative do not.
- **The field enforces exactly what `BudgetWrite` accepts** — `/^\d{1,8}(\.\d{1,2})?$/`, matching
  `ge=0`, `decimal_places=2`, `max_digits=10`. A looser check turns `199.999` into a generic
  "failed to save" toast instead of an answerable message.
- **Both writes return the recomputed rollup and it is written into the cache**, so the line is one
  round trip rather than a write followed by a re-read. A *failed* write re-reads instead: the line
  may be asserting a budget someone already removed elsewhere.
- The editor seeds from the target already set, never from the spend so far.
- **Every clause is built from a formatted value and dropped when that value will not format**
  (ADR 0003). Nothing falls back to the raw wire string under a bare `$`, and nothing substitutes a
  zero. An overspend moves the sign into the word — the leading `-` is dropped and `$12.00 over`
  printed — rather than round-tripping the amount through `Number`.

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
`docs/adr/0002-occasion-and-folder.md`). A folder has a **page** again — `/folders/:id`, rebuilt in
NEU-1274 with the occasion page's two tabs — but still **no index**: `Folders.tsx` stays unrouted, so
the **folder filter on `/lists` is the primary place a user meets the concept**, and it carries the
explanation the old page's blurb used to. The **one link to `/folders/:id`** is a Group by: Folder
heading on `/lists` (NEU-1277). Its back link and its post-delete redirect both go to `/lists`,
because there is no folder index to return to.

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

**Group by subdivides Shared with me, and only when asked** (NEU-1277, project spec §9.1,
[ADR 0005](docs/adr/0005-grouping-returns-as-an-opt-in.md)). A fourth header control —
**None · Occasion · Person · Folder** — with **None the default**, so the flat section ADR 0001
decided on is still what a viewer who asks for nothing sees.

- `lib/list-grouping.ts` holds the whole rule as a pure function over the rows the page has already
  filtered and sorted. Order inside a bucket is the order it was handed; the buckets themselves are
  alphabetical, leftover last, so they do not reshuffle as lists arrive.
- **Every grouping renders its leftover bucket** — "Not in an occasion", "Not shared directly by a person",
  "Not in a folder". Each keys on something a list may not have (a direct share belongs to no
  occasion, a family share to no person), and without it those lists silently vanish from a section
  that claims to hold everything shared with the viewer. This is the failure mode to test first.
- **Occasion and Person both come off `shared_via`**, which is one value per list, so those buckets
  are exclusive. **Folder membership is many-to-many** and a list filed under two folders renders
  under each — the same rule the folder filter already applies.
- A **folder heading is a link** to `/folders/:id`, the page's only entry point; an occasion or
  person heading is not a link, because a source is a label and not a destination
  (`CONTEXT.md` rule 3).
- Grouping by folder needs every folder's membership, so it fans out `getFolder` over
  `folders.data` with `useQueries` on the same `["folder", id]` keys the filter uses — **enabled only
  while that grouping is chosen**, and the section shows a spinner rather than filing lists under
  "Not in a folder" and then moving them.
- A membership read that **failed** is not an empty one: the grouping is abandoned, the section says
  so and stays flat, and every row stays on the page. Filing those lists under "Not in a folder"
  would answer a question the page cannot currently answer — and losing them is the failure this
  control exists to avoid.
- Grouping composes with the filter and the sort rather than replacing them: it subdivides whatever
  the filter left, in the order the sort put it. My Lists is untouched.
- The control sits **in the header row** beside the folder filter and the sort, where project spec
  §9.1 draws it on its own line under the page title. Same deliberate divergence as the sort control
  above: one row holds every control that reshapes the page.

## Archive views

**Archived things have one way in each, and it is a page** (NEU-1278, project spec §9.5). Before this
the Lists page and the family page each carried a *toggle* that swapped the surface into an archived
state; both are gone, and neither dashboard has a code path left that can *read* archived rows.

One thing archived still surfaces by name, deliberately: under **Group by: Occasion**, a list shared
before its occasion was archived is filed under that occasion's heading (`lib/list-grouping.ts`). The
list is live and the heading is a truthful label for where it came from — archiving blocks new shares
and nothing else (project spec §5.4) — and `SharedVia`'s occasion arm carries no `is_archived` for a
client to filter on anyway. Dropping those lists, or the heading, would lose live lists from a
section that claims to hold everything shared with the viewer.

| Page | Holds | Entry point |
|---|---|---|
| `pages/ListsArchive.tsx` (`/lists/archive`) | Archived lists — owned and shared — and archived folders | "View archive", at the **foot** of `/lists` |
| `pages/FamilyArchive.tsx` (`/people/families/:id/archive`) | That family's archived occasions | "View archive", beside the Occasions heading on the family page |

- **The dashboards no longer have an archived state.** `Lists.tsx` reads `{ archived: false }`
  unconditionally and `OccasionsSection` likewise; the `showArchived` state, both toggle buttons and
  every branch that hung off them are deleted. That is what makes "nothing archived appears in a
  default view" structural rather than a default someone has to keep choosing.
- **Nothing is unarchived from an archive view.** List detail's `⋯` menu, the folder page's header
  and the occasion page's organizer-only `⋯` menu already own that mutation — with its confirm, its
  403 handling and its gating — so the rows are **links to those pages** and the archive stays a way
  of finding them. A second copy of Unarchive would be a second thing to keep honest, and the
  occasion one would have to re-derive organizer-ness the occasion page already knows.
- Archive is still not a one-way door; the door just lives on the thing itself.
- The queries reuse the dashboards' keys with `archived: true`
  (`["lists", "owned", { archived: true }]`, `["folders", { archived: true }]`,
  `["occasions", familyId, { archived: true }]`), so archiving from a detail page — which invalidates
  the `["lists"]` / `["folders"]` / `["occasions", familyId]` prefixes — refreshes the archive too.
- **A failed read is not an empty one**, the same rule the folder grouping follows. Each section says
  which read failed and the rows that did arrive stay on the page. "You haven't archived anything
  yet" is one line in place of three "No archived …" ones, and it renders **only** when all three
  reads have actually succeeded and come back empty.
- The same rule reaches the *header*: `FamilyArchive` reads the family and its occasions
  independently, and a failed family read says so rather than letting the back link settle on the
  bare word "Family" — a failure wearing a plausible default is the case this rule is about.
- The Lists entry point sits at the foot of the page, where project spec §9.1 draws it, rather than in
  the header row with the folder filter, sort and group-by. Those reshape what is on the page; this is
  a destination. Same reasoning, opposite conclusion to the sort and group-by placement above.
- The family archive is readable by **any member**. Looking at what was archived is not an
  organizer-only act; unarchiving is, and that is enforced where it happens.

## Testing
- 476 test cases across 39 files, run inside the container via `task test`
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

**Releases are cut by hand, driven by two tasks.** `task release-branch` cuts the next `release/vX.Y.Z` off `main` — a minor bump from the latest GitHub release by default, `-- --major` or `-- --patch` to change that. `task release-notes` branches off the current release branch, regenerates `RELEASE_NOTES.md` with `git cliff --tag <version> -u --prepend`, opens a PR against the release branch, waits for CI and squash-merges it; the version comes from the release branch name, so nothing else has to track it. Both run on the host, not in the container. There is still no release *workflow*: the tag (`tag_pattern = "v[0-9].*"`) and the GitHub release are made by hand. Nothing regenerates the notes afterwards, so a subject that was wrong at merge time can only be fixed by rewriting history or editing the notes directly. `git cliff --unreleased` previews what the next release will read like.

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
