# NEU-1315 — The archive nudge in the actionable banner

**Ticket:** [NEU-1315](https://linear.app/neuroticsasquatch/issue/NEU-1315/archive-nudge-in-the-actionable-banner-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1310](https://linear.app/neuroticsasquatch/issue/NEU-1310/the-app-asks-me-to-close-out-an-occasion-thats-finished) — "The app asks me to close out an occasion that's finished"
**Milestone:** M4 — Correctness
**Depends on, merged:** [NEU-1294](https://linear.app/neuroticsasquatch/issue/NEU-1294) — the whole backend surface (PR #189); its spec is `boone-gifts-backend/docs/specs/NEU-1294-archive-prompt-eligibility-and-snooze.md` · [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293) — `ConfirmDialog` (PR #211, ADR 0008) · [NEU-1306](https://linear.app/neuroticsasquatch/issue/NEU-1306) — the `Modal` shell `ConfirmDialog` now composes
**Sibling in M4:** [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319) — the confirmation audit. It owns *which* actions confirm across lists, folders, families and connections. This ticket adds one new confirmed action and does not touch that table.
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §8, §7.3
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`is_archived` is only worth building on if somebody sets it, and nothing in the app has ever asked.
NEU-1294 shipped the backend that knows which occasions have gone quiet, who should be asked, and
that they said "not yet". This is the half the user sees: two more rows in `ActionableBanner`, and
the two calls behind them.

`ActionableBanner` is the home §8 and the M4 contract both name. It already renders nothing when
nothing is pending, already owns the accept/decline row shape, and is already mounted on the two
pages where a viewer would be interrupted. A second banner would be a second thing to dismiss.

## The contract this consumes

Shipped and merged; nothing here changes it.

```
GET  /occasions/archive-prompts                        →  ArchivePrompt[]
POST /occasions/{occasion_id}/archive-prompt/dismiss   →  204 No Content
```

```ts
export interface ArchivePrompt {
  id: number;          // the occasion's id — what archive and dismiss both take
  name: string;
  family_id: number;
  family_name: string;
}
```

Four fields, and NEU-1294 Decision 9 built them from scratch rather than off `OccasionRead`
precisely so there is no field here that could ever carry claim state. `GET` takes no parameter of
any kind, returns `200 []` for a caller with nothing to answer, and is ordered `id DESC` — **render
array order and do not re-sort**, the same rule the occasion index already carries. `POST` takes no
body: the 30 days is the server's rule.

**There is no 409 branch.** NEU-1294 Decision 5 deliberately does not re-check staleness on
dismissal, so a user who presses "Not yet" on a row that went active while it was on screen gets
`204`. Do not write an error arm for a race that cannot produce one.

### What NEU-1294 changed underneath us

Two decisions in that spec are load-bearing here and are not in this ticket's description:

- **Decision 1 — eligibility reads no claim, by anyone, the caller included.** Staleness is one fact
  about the occasion, identical for everyone eligible. The consequence for this ticket is a
  *negative* one worth stating: no other user's shopping can make a row appear or vanish, so there is
  nothing on this banner to infer from. Rule 2 is satisfied by the payload's shape, not by anything
  the banner does.
- **Decision 4 — `PUT /occasions/{id}` is now gated per field.** A rename needs an organizer; setting
  `is_archived` needs **an organizer *or* the occasion's creator**. Without this the nudge would be
  incoherent: a member who created an occasion would be asked to archive it and then handed a 403.
  The frontend has not caught up — see Decision 5.

## Acceptance criteria

1. An occasion the backend reports as quiet appears as a row in the banner, naming **the occasion and
   its family and nothing else** — no counts, no claimers, no gifts, no dates.
2. The row appears wherever `ActionableBanner` is mounted: `/lists` and `/people`.
3. Rows sit **after** the connection requests and family invites, in the same list.
4. The occasion's name links to `/occasions/:id`. The family name does not link.
5. **Archive** opens a `ConfirmDialog` naming the occasion, whose body says archiving stops new
   shares, withdraws none, and leaves the viewer's shopping where it is. Cancelling archives nothing
   and leaves the row.
6. Confirming archives the occasion; the row clears, and so does the occasion's card in the
   `/lists` strip.
7. **Not yet** records the snooze and the row clears, with nothing else refetched.
8. While either call for a row is in flight, **both** of that row's buttons are disabled and the
   other rows stay live — the existing per-row guard, unchanged.
9. The banner still renders nothing at all when all three sources are empty — no empty card, no
   heading.
10. A failed prompts query renders no rows and **says nothing**. A failed requests or invites query
    toasts exactly as it does today.
11. A member who created an occasion can archive it from `/occasions/:id` and from the family page's
    occasions section, and still cannot rename it from either.

## Decisions

### 1. The nudge follows the banner onto `/people`

`ActionableBanner` mounts three times — `Lists.tsx:252`, and `People.tsx:82` (above the spinner) and
`People.tsx:106`. The nudge goes to all of them, with **no new prop**.

One component that renders one thing is the property the ticket leans on when it says "mount the
nudge there rather than adding a second banner". A `showArchivePrompts` prop would mean the banner no
longer renders the same thing everywhere it mounts, and the next person adding a row would have to
decide the same question again.

`/people` is also not a strange home for it: an occasion belongs to a family, and families live
there. The two `People.tsx` mounts are mutually exclusive arms of the same render — the pending arm
returns early — so this is one query, and React Query dedupes it against `/lists` regardless.

### 2. Last in the list, and not set apart

A third `.map()` after the invites, in the same `<ul>`, same divider, same row geometry.

Requests and invites are **other people waiting on you**. A nudge is the app's own housekeeping and
outranks neither. Putting it first would put your admin above someone waiting for an answer; giving
it a sub-heading would be chrome over what is usually one row, and would make the "renders nothing
when nothing is pending" contract something to think about rather than something that falls out of
three empty arrays.

### 3. The occasion name links; the family name does not

```
Christmas 2025 · Boone Family has been quiet for a while     [Archive] [Not yet]
└─ /occasions/25
```

"Archive Christmas 2025?" is not answerable from the row. Whose lists are in it, whether anything
happened, whether you have shopping filed under it — the occasion page is the one place that answers,
and `CONTEXT.md` rule 3 licenses the link for exactly that reason: a heading links when its
destination carries something the naming does not, and `/occasions/:id` carries a budget and a
shopping tab. Going to look is the honest third answer beside Archive and Not yet.

The family name stays an **unlinked prefix**, which is the shape rule 3 already fixes for occasion
headings: the occasion name alone does not identify one occasion, and the family is how the viewer
recognises which.

The link makes Decision 5 mandatory rather than tidy — it is two clicks from the nudge to the page
that contradicts it.

### 4. `["occasions", "archive-prompts"]`, inside the prefix

`OccasionStrip` keys on `["occasions", "index", { archived: false }]` and its comment says why: a
literal segment keeps it clear of the per-family `["occasions", familyId]` entries **while sharing
the `["occasions"]` prefix, so one sweep invalidates both**. The prompts join that convention.

The payoff is that every existing archive call site already clears the banner. `OccasionDetail`'s
header and `OccasionsSection` both invalidate the bare `["occasions"]` prefix today; neither has to
learn that this query exists.

| Action | Invalidates |
|---|---|
| Archive, from the banner | `["occasions"]` and `["share-targets"]` — the same pair `OccasionDetail` fires, for the same reasons its comment gives |
| Archive, from anywhere else | `["occasions"]` — unchanged, and now reaches the prompts |
| **Not yet** | `["occasions", "archive-prompts"]` **only** |

A dismissal changes one row's visibility to one user and nothing else — no occasion moved, no share
target changed, no card re-sorted. Sweeping the bare prefix for it would refetch the strip and every
family's occasion list to hide one banner row.

### 5. The per-field gate is corrected on all three surfaces

NEU-1294 Decision 4 split the backend gate. The frontend still says organizer-only in three places,
and after this ticket a plain member who created an occasion is routinely sent to one of them.

| Surface | Rename | Archive / unarchive |
|---|---|---|
| The banner row (new) | — | organizer **or** creator |
| `OccasionDetail` header | organizer | organizer **or** creator |
| `family-detail/OccasionsSection` | organizer | organizer **or** creator |

Both pages already have what the check needs: `useAuth()` for the viewer, `created_by_id` on
`Occasion`, and an `isOrganizer` already derived. So:

```ts
const canRename  = isOrganizer;
const canArchive = isOrganizer || occasion.created_by_id === user?.id;
```

The single `ORGANIZER_ONLY` message — *"Only an organizer can rename or archive an occasion."* — is
now false by half and splits in two:

```ts
const RENAME_ONLY  = "Only an organizer can rename an occasion.";
const ARCHIVE_ONLY = "Only an organizer or the person who created this occasion can archive it.";
```

`OccasionsSection` carries the same pair, and gains `useAuth()` — its `isOrganizer` prop stays, since
it is the family's answer and the creator check is the occasion's.

**Why the family page too, when nothing here links to it.** One rule with two answers in the codebase
is one answer that will be wrong to whoever finds it second. The section is the family's occasion
*management* surface (NEU-1300) and the check is one line. Fixing two of three surfaces would leave
the question "who may archive an occasion" with a live disagreement in the repo that no test or
comment resolves.

`updateOccasion`'s docstring in `api/occasions.ts` currently reads *"Rename or (un)archive.
Organizer-only; the backend returns 403 otherwise."* It becomes the per-field rule. This is not
cosmetic: it is the sentence a reader consults before writing a call site.

**Unarchiving carries the same rule as archiving** — NEU-1294 Decision 4 gates the field, not the
direction, so a creator who closes an occasion by mistake can reopen it.

### 6. Its own button pair, borrowing `ActionButtons`' geometry

A second small component beside `ActionButtons`, same flex/gap/`px-3 py-1`/`disabled:opacity-50`,
same per-row `disabled`, same `aria-label` pattern:

```tsx
function ArchiveActions({ onArchive, onNotYet, disabled, describes })
```

Both buttons are `bg-gray-200 text-gray-700`. **Archive is not a green Accept**, and it is not a red
danger either — this whole row exists to say the action is mild. The ticket is explicit that
"archive" *reads* as destructive and here is not, and the confirm body spends two clauses saying so;
painting the button red would argue the opposite before the dialog got to deny it.

Generalising `ActionButtons` with `primaryLabel`/`secondaryLabel`/`tone` props was rejected: four
props to express two fixed pairs, and a component whose name stops saying what it does. Two shapes
exist; two components is honest about that.

`describes` keeps the existing accessible-name convention — `Archive Christmas 2025 in Boone Family`,
`Dismiss the prompt to archive Christmas 2025 in Boone Family`. The visible labels are two words and
several rows may be on screen at once, so the name has to carry the occasion.

### 7. The confirm wording names the occasion and says all three things

```tsx
<ConfirmDialog
  open={confirming !== null}
  title={`Archive ${confirming.name}?`}
  body="Lists already shared to it stay shared — archiving only stops new ones. Your shopping for it stays where it is."
  actions={[{ id: "archive", label: "Archive", tone: "danger" }]}
  pending={archiveMutation.isPending}
  onResolve={…}
/>
```

`OccasionDetail` keeps its own shorter body (*"Lists already shared to it stay shared."*). The two
are deliberately different, not an oversight to be deduplicated:

- Someone on the occasion page **went looking for the control**; they have the occasion's name in the
  heading above and its lists on screen.
- Someone in the banner **was interrupted by a question they did not ask**, on a page about something
  else, possibly with several rows. The title has to say which occasion, and the body has to carry
  the reassurance because there is no context around it to supply.

Sharing one exported string was rejected on the title alone: a shared constant cannot interpolate the
occasion name without becoming a function, and "Archive this occasion?" in a banner holding three
rows names nothing.

`tone: "danger"` on the action, matching `OccasionDetail`'s existing `ARCHIVE_ACTIONS`, and Cancel is
always rendered and never listed (ADR 0008).

### 8. A failed prompts query is silent

```ts
const loadFailed = requests.isError || invites.isError;   // unchanged
```

`prompts.isError` is not added to it. A request or invite failing means **somebody is waiting on you
and you cannot see them** — worth interrupting for. A nudge is the app's own suggestion about
housekeeping: if it fails to load, nothing is lost and it returns on the next visit.

`OccasionStrip` does toast, and the difference is the point: its absence is confusing on a page the
viewer came to for occasions, and it is the only thing that would render. A banner row that never
appears is not noticed, because nothing promised it. Adding a second toast would also mean one
failing backend fires two messages about occasions on `/lists`, where the strip sits directly below.

Handled by `prompts.data ?? []`, which the banner's existing two queries already do.

### 9. Confirmation state is one nullable prompt, not a boolean

```ts
const [confirming, setConfirming] = useState<ArchivePrompt | null>(null);
```

`OccasionDetail` gets away with a boolean because it has exactly one occasion. The banner may hold
several rows, and the dialog needs the name for its title and the id for its mutation. One
`ConfirmDialog` is rendered for the whole banner, not one per row.

This is the "small piece of what-am-I-confirming state" ADR 0008 accepted as the cost of the
declarative API, and it is what lets the dialog **stay open with every button disabled** while the
archive is in flight rather than vanishing mid-mutation.

### 10. Both mutations are plain refetch, not optimistic

The row clears when the query comes back. No `onMutate`, no cache surgery.

The banner's existing four mutations all work this way, the rows are cheap to re-render, and an
optimistic removal would have to be rolled back on an error into a list whose order comes from the
server. The per-row `disabled` guard already covers the only thing optimism would buy — a second
press on a row being answered.

The busy-row derivation extends the existing pattern: the guard is against answering one row twice,
not against answering a second row while the first is in flight.

## What to change

| File | Change |
|---|---|
| `src/types/index.ts` | new `ArchivePrompt` |
| `src/api/occasions.ts` | new `getArchivePrompts`, `dismissArchivePrompt`; `updateOccasion` docstring corrected to the per-field rule |
| `src/components/ActionableBanner.tsx` | third query, two mutations, the prompt rows, `ArchiveActions`, one `ConfirmDialog` |
| `src/pages/OccasionDetail.tsx` | `canArchive` split from `canRename`; `ORGANIZER_ONLY` split into `RENAME_ONLY` / `ARCHIVE_ONLY` |
| `src/pages/family-detail/OccasionsSection.tsx` | the same split; `useAuth()`; docstring |
| `src/test/mocks/handlers.ts` | default handler for `/occasions/archive-prompts` → `[]`, beside the existing invites default |
| `src/components/ActionableBanner.test.tsx` | the cases below |
| `src/pages/OccasionDetail.test.tsx`, `src/pages/family-detail/OccasionsSection.test.tsx` | the creator arm |
| `CONTEXT.md` | one new term, rule 6 amended — recorded below |

A default handler in `src/test/mocks/handlers.ts` is **required, not optional**: `ActionableBanner`
mounts on `/lists` and `/people`, so every existing page test for either would otherwise hit an
unhandled request.

## `CONTEXT.md` edits

Apply these in the implementation PR, not ahead of it — they describe the state after the code lands.

- **Terms** gains **Archive prompt** — "A standing question about one occasion that has gone quiet:
  archive it, or not yet. Asked of the occasion's creator or an organizer of its family, in the
  banner that already carries connection requests and family invites. Names the occasion and its
  family and nothing else. 'Not yet' is a dated snooze, not a permanent dismissal." Rendered by
  `components/ActionableBanner.tsx`.
- **Rule 6**'s sentence *"Archiving an occasion blocks new shares and nothing else — it never
  withdraws one, so an existing grant stays visible and revokable"* gains: **"An occasion nobody has
  shared into for a long time is prompted for archiving rather than archived — the flag is only
  trustworthy because a person sets it. Archiving is an organizer's, or the occasion creator's; a
  rename stays the organizer's alone."**

## Tests

**The row-clears-without-a-sweep test is the one that matters**, because Decision 4 is the only place
the two mutations differ and the difference is invisible on screen: assert that "Not yet" refetches
`["occasions", "archive-prompts"]` and leaves the occasion index query untouched, while Archive
refetches both. A `QueryClient` spy on `invalidateQueries`, in the shape
`ActionableBanner.test.tsx` already uses for its own `queryClient`.

Also cover:

- A prompt row renders the occasion name and the family name, links the first to `/occasions/:id`,
  and renders **nothing else**. The rule 2 guard is asserted against the row's full text content with
  fixture names chosen to make it meaningful — an occasion whose payload the backend could have
  widened (lists shared, claims filed) still produces a row reading only *name · family*. A "no
  digits" assertion would be simpler and wrong: occasion names carry years.
- Ordering: with a request, an invite and a prompt all pending, the prompt row is last.
- Archive opens the dialog, Cancel closes it with **no** `PUT` fired, confirming fires
  `PUT /occasions/{id}` with `{is_archived: true}` and clears the row.
- The dialog stays open with its buttons disabled while the archive is in flight (`delay` in the MSW
  handler, as the existing pending tests do).
- "Not yet" fires `POST /occasions/{id}/archive-prompt/dismiss` and clears the row.
- The per-row guard: two prompts pending, answering one leaves the other's buttons live.
- Prompts only, nothing else pending → the banner renders; all three empty → the banner is **absent**,
  not empty (`queryByRole("region", { name: "Waiting on you" })` is null).
- A failing prompts query renders no row and **fires no toast**, while a failing invites query still
  toasts — the two arms asserted together, since the point is that they differ.
- `OccasionDetail`: a non-organizer **creator** sees the Archive control and does not see Rename; a
  non-organizer non-creator sees neither; a 403 on archive shows `ARCHIVE_ONLY` and a 403 on rename
  shows `RENAME_ONLY`.
- `OccasionsSection`: the same creator arm on the family page.

Run in the container — `task test`, `task test-file -- src/components/ActionableBanner.test.tsx`,
`task lint` — and confirm a fresh CI run before calling it done (AGENTS.md).

## Out of scope

- **Everything backend.** NEU-1294 shipped it; no endpoint, threshold or eligibility rule changes.
- **The confirmation audit** — NEU-1319. Which *other* actions confirm is that ticket's table. This
  one adds a confirmed action and changes no existing one. In particular, `OccasionDetail`'s existing
  archive confirm keeps its current wording.
- **Unarchiving from the banner.** An archived occasion is not eligible, so it never has a row.
- **Any way to see or undo a snooze.** There is no endpoint for it and §8 did not ask; the date
  expires and the nudge returns.
- **Telling the viewer how long it has been quiet.** `ArchivePrompt` carries no date, deliberately
  (NEU-1294 Decision 9) — do not derive one from `last_activity_at` on the index, which is a
  different clock and a per-viewer one.
- **A badge or count anywhere for pending prompts.**
- **Nudging lists or folders.** Occasions only — M4's contract and §8 both settle it.
