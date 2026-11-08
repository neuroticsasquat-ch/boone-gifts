# Domain model — Boone Gifts

The vocabulary this codebase uses, and the invariants that hold across it. The backend's terms
and invariants come first; the words the UI uses, and the rules the frontend must respect, follow
under [Frontend](#frontend). Conventions, commands, and architecture live in
[`AGENTS.md`](AGENTS.md); this file is only about what the words mean and what must stay true.

## Terms

| Term | Means | Where it lives |
|---|---|---|
| **Account** | One login. The unit of identity everywhere: one family member, one connection, one claimer | `users` |
| **List** | A gift list owned by exactly one account | `lists` |
| **Gift** | An item on a list. Carries the owner's asking price, and nothing about who has claimed it | `gifts` |
| **Claim** | One account's private intent to buy a gift, with what it cost. Invisible to the list's owner | `claims` |
| **Amount paid** | What the *claimer* spent. Distinct from `gifts.price`, the owner's asking price, which every viewer sees | `claims.amount_paid` |
| **Connection** | An accepted relationship between two accounts. A prerequisite for a direct share — **not** itself a grant of visibility | `connections` |
| **Direct share** | A grant of one list to one account | `list_shares` |
| **Family** | A named group of accounts, with organizers and members | `families`, `family_members` |
| **Occasion share** | A grant of one list to one family occasion. Not implied by co-membership. Was a *family grant*, pointed at the family itself | `list_occasion_shares` |
| **Share route** | One way a list reached a viewer: a direct share, or an occasion share of a family they belong to. A list can have several, and a viewer's routes to it are computed at read time — never stored | computed, `app/lists/repository.py:get_share_routes` |
| **Folder** | An account's private grouping of lists it can see — "Christmas 2026". Was called an *occasion*, and before that a *collection* | `folders`, `folder_items` |
| **Occasion** | A family's shared gifting occasion — "Boone Family · Christmas 2026". Owned by a family, carries **no dates** | `occasions` |
| **Active occasion** | An occasion with `is_archived = false` | `occasions.is_archived` |
| **Occasion activity** | The clock an occasion sorts by: the later of the last share into it and the *viewer's own* claim or purchase filed under it, floored at the occasion's creation. Per-viewer by construction — never another user's claim | computed, `app/occasions/repository.py:last_activity_at_expr` |
| **Shared activity** | The clock the archive nudge ages an occasion by: the later of the last share into it and its own creation. Reads no claim, by anyone — so no user's shopping can create or remove another user's prompt. The first term of *Occasion activity*, and the whole of what the nudge sees | computed, `app/occasions/repository.py:shared_activity_at_expr` |
| **Archive prompt** | A standing question to one account about one occasion that has gone quiet: archive it, or not yet. "Not yet" is a dated snooze, not a permanent dismissal | `occasion_archive_prompts` |
| **Budget** | What one account means to spend on one occasion, or on one folder — the *overall* target. Private to the account that set it; there is no family budget. May be left unset while giftee budgets exist, in which case it *reads as* their sum and is never written from it | `budgets` |
| **Giftee** | Who a list is *for*: its owner, or the account person it is marked for, or the recipient it is kept for. Derived from the list — never its own row — and identified by those three facts, so two lists for the same person are one giftee. The unit a shopping tab groups by and a giftee budget hangs off | computed, `app/budgets/giftees.py` |
| **Giftee budget** | What one account means to spend on one giftee within one occasion or one folder. As private as a budget. A giftee may have one, several may share an overall budget, and either may exist without the other | `giftee_budgets` |
| **Rollup** | A budget with the caller's own spend counted against it — target, spent, remaining, and the bought/total/unpriced counts. The overall rollup also carries how much of it is *allocated* to giftees; each giftee has a rollup of its own over that giftee's lists | computed, `app/budgets/service.py` |
| **Recipient** | A person with **no account** for whom an account keeps a list | `lists.recipient_name` |
| **Shared account** | An account used by more than one person, e.g. a couple sharing one login | `users.is_shared_account` |
| **Account person** | A named person on a shared account. **A label, never an identity** | `account_people` |

Deliberately *not* in the vocabulary: "collection" (renamed to occasion, then to folder),
"family list" (a list reached through an occasion share is just a shared list), and "simple mode"
(retired entirely — see `docs/adr/0004-simple-mode-is-retired.md`). **"Occasion" now means the
family's, never the user's** — the user's curated set is a *folder*, and the name `occasions` was
vacated by the rename precisely so the family concept could claim it.

## Invariants

1. **The owner never sees claims on their own list.** This is structural, not discipline: the claim
   is its own row and there is nothing claim-shaped left on `gifts`, so an owner-facing serializer
   has nothing to forget (ADR 0003). `claimed_count` and `my_unpurchased_claim_count` live on
   `GiftListViewerRead`. `app/lists/service.py:to_summary` is the single place that decides which
   schema a list row gets, and `to_summaries` is the seam that wraps it — route new list-row
   responses through `to_summaries` rather than naming a schema at the endpoint, and they inherit
   both the right schema and their `shared_via` routes. Every surface that could leak claim state
   to an owner — including the 409 on revoking an occasion share — reveals only *that* claims
   exist, never counts, gift names, claimer names, or **a timestamp that dates one**. The last of
   those is why the occasion strip's sort key is per-viewer ([ADR 0005](docs/adr/0005-occasion-activity-is-per-viewer.md)):
   a value nothing claim-shaped appears in can still disclose a claim by the order it imposes.
   `tests/integration/test_owner_blindness.py` sweeps the owner-facing responses for it.

2. **Visibility has exactly one predicate.** `can_view_list` in `app/access.py`: owner, OR a
   `ListShare` row, OR the list is shared to an occasion of a family the viewer belongs to. Claims
   route through it, and so do folder membership and folder *reads* — a `folder_items` row that
   outlived the share behind it is not a grant. A connection alone grants nothing; bare family
   co-membership grants nothing. It follows that the shared scope is the only per-person read there
   is — `GET /connections/{id}/lists` was retired in v0.6.0 because it answered a narrower question
   (direct shares only) than the one predicate, and there is no server-side index of one person's
   lists to replace it. It does **not** consult `occasions.is_archived` — archiving blocks new
   shares and nothing else, so it never withdraws visibility.

3. **An occasion share row implies the owner is still a member of the occasion's family.** Read
   queries rely on this and do not re-check it, so every membership departure deletes the affected
   share rows — on every occasion of that family, not just one.

4. **`users_share_access` is not `can_view_list`.** It answers "is there a standing relationship"
   — used to decide cascade cleanup when a relationship ends — and is deliberately not gated on
   shares.

5. **A shared account is one identity.** Its people are labels on its lists. They are not members,
   not connections, not claimers, and they never receive their own visibility. It follows that
   claims stay hidden on every list a shared account owns, including a list marked for the other
   person — accepted deliberately, see [ADR 0001](docs/adr/0001-shared-accounts-are-one-identity.md).

6. **An account marked shared always has at least two people.** Marking it with fewer is refused,
   and deleting down to one un-marks the account rather than leaving it in a one-person state.

7. **A list is for an account person, or for a recipient, or for neither — never both.**
   `lists.account_person_id` and `lists.recipient_name` are mutually exclusive, enforced in the
   service layer. "Neither" is a legitimate state on a shared account: it is a household list,
   belonging to everyone who uses the login.

8. **A recipient has no account.** `recipient_name is not None` means the list is kept on behalf of
   someone who will never log in, so its keeper cannot see claims on it and cannot claim from it.

9. **An occasion belongs to exactly one family, and has no dates.** Any member may read and create
   one; **only an organizer may rename one; an organizer or the occasion's creator may archive or
   unarchive one.** The split is deliberate: archiving is reversible, withdraws no shares and still
   serves every My shopping tab, while a rename changes a label everyone sees and everyone's budgets
   are filed under. It is also what makes the archive nudge coherent — the audience asked to archive
   an occasion is exactly the audience allowed to. Creating a second *active* occasion is allowed
   and flagged (`has_other_active`), never refused — a family with no active occasion cannot be
   shared to at all, so nobody may be blocked waiting on an absent organizer.
   Deleting the family deletes its occasions, and the shares pointing at them first.
   **A list is shared to an occasion, never to a family**, and archiving one refuses new shares
   (409) without withdrawing the shares already made.
   See [ADR 0002](docs/adr/0002-family-shares-target-an-occasion.md).

10. **A budget is private, and belongs to exactly one scope.** One per `(user, occasion)` and one
    per `(user, folder)`, always the caller's own: no endpoint anywhere returns another user's
    budget, spend or counts, and no spend is aggregated across accounts at any time — that is
    invariant 1's reasoning applied to money. `budgets.occasion_id` and `budgets.folder_id` are
    mutually exclusive with exactly one set, enforced in `app/budgets/service.py`.
    **The money total always discloses its own incompleteness**: a purchase whose `amount_paid` is
    null counts toward `bought_count` and `unpriced_count` and never toward `spent`, and is never
    guessed at from the owner's asking price. **Spend follows the tick**: an amount held on a
    claim that is not ticked bought is kept, so re-ticking need not retype it, but counts as
    nothing until it is. A budget dies with its scope — deleting a folder, a
    family (through its occasions) or a user clears the budgets pointing at it.
    **The same holds for a giftee budget**: one per `(user, scope, giftee)`, always the caller's
    own, counted over the caller's own claims on that giftee's lists. Allocating to giftees never
    writes the overall budget: an overall left unset *reads as* the sum of the giftee budgets and
    an overall that is set reports how much of it is allocated, but the two rows are independent
    and may disagree (over-allocation is shown, not refused). A giftee budget dies with its scope,
    with the user who set it, with the account whose list it names, and with the account person it
    names; a recipient renamed on a list is *not* followed — the old row survives as an empty,
    labelled group until its user removes it.

## Frontend

The vocabulary the UI uses, and which module owns each concept. A term the backend table above
already defines keeps that definition; its row here adds only what the UI does with it. Paths in
*Rendered by* are under `frontend/src/`. The UI's rules are numbered on their own ("rule 3"),
apart from the backend's invariants ("invariant 1").

### Terms as the user meets them

| UI word | Means | Rendered by |
|---|---|---|
| **My lists** | Lists this account owns | `pages/Lists.tsx` |
| **Shared with me** | Every list someone else has made visible to me, **however it reached me** — a direct share, or an occasion of a family I belong to. One section, never two destinations | `pages/Lists.tsx`, `components/SharedListRows.tsx` |
| **from Jane** / **Boone Family** | The source label on a shared row. A list may have arrived several ways at once, and **direct wins**: a row that also came through an occasion still reads "from Jane", because the direct share is the grant that survives the viewer leaving the family. An occasion-only row is labelled with its **family** — the occasion is how the share was made, the family is who the viewer recognises — and with every distinct family, comma-joined, when more than one carried it. **Except where the surface has already established that family**, which today means the occasion page alone: there the row names the **owner** instead, because a family repeated from the page's own heading identifies nobody (NEU-1324). This is rule 3's test one level down — the family qualifies a row where it disambiguates, and steps aside where the viewer has arrived. A folder is *not* such a surface: it is my grouping, not a family's, and one routinely spans two | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Share route** | *Share route* above, seen from the client: `shared_via` is the array of all of a list's routes to me | `lib/attribution.ts`, `lib/list-grouping.ts` |
| **for Beth** | This list is kept for a person with no account | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Group by** | How I ask *Shared with me* to subdivide — by occasion, person, or folder. Off by default; every grouping keeps a "Not in a …" bucket so nothing vanishes; held in the URL as `?group=`, so it survives a round trip and can be shared | `pages/Lists.tsx`, `lib/list-grouping.ts` |
| **People** | Connections and families together — everyone I share with | `pages/People.tsx` |
| **A person's page** | Every list that person owns which I can see, **however it reached me**. Derived from the shared scope rather than fetched as its own index; it lists no occasions, and it is a label's destination rather than a second index | `pages/ConnectionProfile.tsx` |
| **Family** | *Family* above. A list reaches one **through an occasion of that family**, never the family itself. Its page administers the family — members, occasions, settings — and is **not** the way in to an occasion | `pages/FamilyDetail.tsx` |
| **Folder** | *Folder* above. Has a page (`/folders/:id`) but no index | `pages/FolderDetail.tsx` |
| **Add a List** | The folder's picker: **every list I can see** that is not already in this folder — mine and ones shared with me, since a folder groups the people I'm buying for, who are by definition not me. The third list-choosing surface and the only one holding both populations, so it labels per row rather than per section: a row someone else owns carries its attribution line, a row I own carries "for Beth" or "Mine". Inline on the Lists tab, with no filter of its own | `pages/FolderDetail.tsx` |
| **Occasion** | *Occasion* above — the unit a list is shared *to*, and the only thing that makes a family shareable. **Always named with its family** — as a linked eyebrow above the name on its own page's heading, and as an unlinked prefix in every heading that points at it — two families routinely both call one "Christmas 2026" | `pages/OccasionDetail.tsx`, `pages/lists/OccasionStrip.tsx` (finding one), `pages/family-detail/OccasionsSection.tsx` (managing one), `lib/occasion-choice.ts` |
| **Who can see this list** | The owner's one sharing surface — families and connections in a single dialog, with one filter box across both sections and a line saying what is ticked. Over a list that exists it sits behind the header's **Sharing…** action, in the same bar as everything else you can do to the list, and every tick is a write; **New List mounts the same dialog** behind `Choose…`, holding its ticks until the list is created and starting from **nothing ticked**. Its open-ness is the address: `?share=open` | `components/SharingModal.tsx` (the rows), `ListSharingModal.tsx` / `DraftSharingModal.tsx` (the two modes) |
| **Share a list** | The **other** sharing direction: the occasion is fixed and the *list* is chosen, from lists I own. The same dialog chrome, a different population and a different write — one `PUT` per tick, add-only, and a list already here is ticked and dead. Offered from the occasion page's Lists tab in both its states, and from an empty card in the occasion strip | `components/OccasionSharingModal.tsx` (the rows), `ShareIntoOccasionButton.tsx` (the control), `SharingShell.tsx` (the chrome both modes wear) |
| **Occasion strip** | The row of occasion cards at the top of `/lists`: every non-archived occasion in every family I belong to, most recently active first, four at a time. Absent entirely when I have none. Carries no money | `pages/lists/OccasionStrip.tsx` |
| **Archive prompt** | *Archive prompt* above. Asked of the occasion's creator or an organizer of its family, in the banner that already carries connection requests and family invites. Names the occasion and its family and nothing else | `components/ActionableBanner.tsx` |
| **Claim** / "I'll get this" | *Claim* above; "I'll get this" is how the UI offers one | `pages/list-detail/GiftsTab.tsx` |
| **My shopping** | Everything *I* have claimed within one occasion or one folder — what I still have to buy, what I bought, and what I paid — grouped by **giftee**, with a group for every giftee in scope even when I have claimed nothing for them yet. Never anyone else's, in any aggregate | `components/MyShopping.tsx` |
| **Giftee** | *Giftee* above — the person a shopping group is about. Named by the person alone, with the keeper added only when two groups would otherwise read the same | `lib/giftees.ts`, `components/MyShopping.tsx` |
| **Account person** | *Account person* above; a list can be marked as being for one | `components/ListForFields.tsx` |
| **Budget** | *Budget* and *Giftee budget* above. Organizers name an occasion and never see any money. An overall I have not set reads as the sum of the split, and says so | `components/BudgetLine.tsx` |

Words the UI must **not** use: "collection" (rejected outright — it reads too close to "connection"),
"occasion" for a folder (the word is reserved for a family's shared occasion — see
[`docs/adr/0008-occasion-and-folder.md`](docs/adr/0008-occasion-and-folder.md)), "family list" (a list shared via a family
is just a shared list, labelled with the family), "family grant" / "family share" as a thing
pointing at a family (it points at an occasion — project spec §4), "connect"/"collect" as navigation labels,
"connections" and "families" as navigation labels (both name a *section* of `/people` rather than the page — the same
fault, retired in NEU-1302; the destinations are **Lists**, **People**, or a family's own name), "they use
this app", "simple mode" (retired in NEU-1261 — the full-mode behaviour is the only
behaviour).

### Rules the UI must respect

1. **The backend is always the gate.** Hidden or read-only controls are a courtesy, never a
   permission. Anything the UI hides is also refused server-side — *unless the control is disabled
   because the grant would be redundant rather than forbidden*. The one such case is a person the
   sharing modal disables because a family occasion already reaches them (rule 6): the API still
   accepts that direct share, because a direct share is the grant that survives the person leaving
   the family or the occasion share being revoked.

2. **Owners are blind to claims, and no user sees another's.** No screen, count, badge, or error
   message may reveal claim state on a list the viewer owns — including the revoke-a-share dialog,
   which offers a choice without naming gifts, claimers, or counts. The **My shopping** tabs are the
   same rule seen from the other side: they show only the viewer's own claims, and no endpoint
   behind them takes a parameter that could widen that. The rule holds across an account switch
   and not only per request: the client's query cache is dropped whenever the viewer changes, so
   one person's fetched data is never painted for the next on a shared device.

3. **Source is a label; a heading links only when its page carries more.** How a list reached the
   viewer is rendered on the row. It never becomes a filter-by-default. It may become a *heading* —
   but only inside **Shared with me**, and only because the viewer switched Group by on.

   A person's page and Group by → Person are keyed **differently, on purpose**: the page holds every
   list that person **owns**, while the grouping buckets only the lists a **direct route** of theirs
   carried, leaving an occasion-only one in "Not shared directly by a person". So the page is the
   **wider** of the two, and nothing the grouping files under a person is missing from their page.
   Re-keying the grouping on ownership was rejected: every shared list has an owner, so that bucket
   could never fill again, and a bucket whose name is a lie is worse than the asymmetry.

   A heading links when its destination carries something the grouping does not: `/occasions/:id`
   has a budget and a shopping tab, `/folders/:id` has membership management. `/people/:id` does
   not — it is a filtered cut of the same shared scope, carrying no fact the reader could not get by
   ungrouping — so a person heading leads nowhere
   ([`docs/adr/0013-occasions-are-a-destination.md`](docs/adr/0013-occasions-are-a-destination.md),
   amending [ADR 0011](docs/adr/0011-grouping-returns-as-an-opt-in.md)). An occasion heading names
   its family as an unlinked prefix, because the occasion name alone does not identify one occasion.
   The occasion **page's** own heading names the family too, but as a **linked eyebrow above** the
   occasion name rather than a prefix beside it: at a phone's width the two halves on one line left
   neither of them readable (NEU-1323). The family half is a link *here* and nowhere else — on the
   page the viewer has arrived, so the family stops disambiguating one occasion among several and
   becomes the parent that administers it, which is a destination by the test above. The eyebrow is
   part of the heading rather than a line above it, so the heading still announces both; only the
   occasion half is editable.

   A list may appear under **several** occasion headings, as it already could under several folders:
   grouping fans out over every route, where the row's *label* picks one (direct wins).
   Every grouping keeps its "Not in a …" bucket, because a section that claims to hold everything
   shared with the viewer may never quietly drop a list that fits no bucket.

4. **A list is for an account person, or for someone with no account, or for neither.** The two
   controls are mutually exclusive; picking one clears the other.

5. **A budget is one person's, and says where it is incomplete.** Every figure on a budget line is
   the viewer's own; nothing is aggregated across people, and no endpoint behind it names whose
   budget to read. A purchase recorded with no amount counts as bought and never toward the money
   total, so the count of them is shown whenever it is non-zero — an understated total must read as
   an understatement, never as fact. Going over is stated plainly, not as an error: a budget is a
   target, not a limit. A budget may be split per giftee, and the split is as private and as
   honest as the whole: allocating never writes the overall, an overall left unset reads as the
   sum of the split and is labelled as derived, allocating more than the overall is stated rather
   than refused, and a giftee with no budget yet is told what is left to allocate without having
   it typed in for them.

6. **A share points at an occasion, not a family.** A family with no active occasion is listed and
   disabled with the reason, never hidden; a family with several is not shared to until one is
   chosen. Archiving an occasion blocks new shares and nothing else — it never withdraws one, so an
   existing grant stays visible and revokable. An occasion nobody has shared into for a long time is
   prompted for archiving rather than archived — the flag is only trustworthy because a person sets
   it. Archiving is an organizer's, or the occasion creator's; a rename stays the organizer's alone.
   The same "listed, disabled, reason given" shape covers a **person an active occasion share
   already reaches**: their box is dead because ticking it would change nothing, and the row names
   every family that covers them. It applies only to an *unticked* box — a direct share already
   made stays revokable, because this panel is the only place to revoke one. **In occasion mode the
   tick is the dead one**: the dialog opened from an occasion is add-only, and the reason points at
   where revoking lives — `Already shared here — change this from the list`. The clause above is
   what flips it: the list's own modal *is* another place to revoke, and it is the one with the
   owner's context, the family named, and the release-or-keep question a claim needs. Archived shares are
   outside the rule: they still grant sight, but the row stays live, since a direct share is what
   the owner would want as that occasion winds down.
   The rule is defined on a **live share**, so it is inert while a list is being created: a draft
   tick grants nothing until the list exists and can be withdrawn before it does, so no person row
   is greyed on the create form however many families are ticked. A list created with both a family
   share and a direct share to one of its members renders on the list page with that person ticked,
   live and revokable — exactly as if the owner had made the same pair from the list page.

7. **A wrong address is not a missing thing, and neither is a slow one.** An `:id` in a route is a
   positive integer or it is not an address at all — the page it names is never asked for, never
   loaded, and never spun on. The viewer is told plainly that the address is wrong and given one way
   back, with no retry offered, because retrying a malformed address cannot help. This is enforced at
   the route rather than in the pages, so a page that renders has a real id by construction (see
   [`docs/adr/0012-route-ids-are-validated-at-the-route.md`](docs/adr/0012-route-ids-are-validated-at-the-route.md)).
   Distinct from a *reachability* failure: a valid id the viewer may not see stays the backend's
   answer, and keeps its own arm.

8. **View state lives in the URL, and its mode says what kind of state it is.** A filter, a sort, a
   grouping and an expansion are *preferences about a page you are already on*: they **replace**, so
   one Back press leaves a page you glanced at. A tab and an open modal are *places you can be*:
   they **push**, so they are linkable and Back closes them. Every call site states which — the mode
   is required and never defaulted, because the wrong answer is felt only through the Back button,
   where nobody looks. A value the URL carries but the app does not recognise is replaced by the
   default and removed from the address, so what the link says and what the page shows never
   disagree. Where one page can open **several** dialogs of the same kind, the key's *value* names
   which: `/occasions/7?share=open` on a page whose path already says which occasion, and
   `/lists?share=7` on the strip, where fifteen cards make `open` meaningless. A value that names
   something the viewer cannot reach is healed the way an unrecognised one is — but **only once the
   query that could recognise it has answered**, because scrubbing on the first render would strip a
   good id before anything knew it was good. **The rule stops at the dialog edge**: a modal's own open-ness is URL-held view state,
   but scratch input *inside* it — the sharing modal's filter box — is component state, because
   nobody links to a half-typed filter and one write per keystroke can reach Safari's `replaceState`
   throttle. **Closing a pushed modal pops rather than writing the default**: the app pushed that
   entry, so `navigate(-1)` undoes it, and writing through the push-mode setter would add a second
   entry, leaving Back to reopen what was just closed. With nothing of ours behind the page — a deep
   link straight into the open modal — closing replace-strips the key instead.

9. **Back follows how you arrived, and says so when it can't.** A page's back control returns you to
   the page you came from when the app knows you came from one, and renders as a plain `← Back`.
   When it doesn't — a deep link, a new tab, a reload — it goes to that page's one named parent and
   says its name. A generic label that is always true beats a specific one that is sometimes a lie,
   and the control never takes the viewer off the site. Every destination has one word: **Lists**,
   **People**, or the family's own name. A *wrong address* keeps its own fixed way back (rule 7) and
   is not history-aware, because the page it names was never asked for.

10. **A failure names its own cause, and a request the server never answered is not a rejection.**
    A page may only tell the user their credentials, their invite or their link were rejected when
    the server actually said so. A request that never arrived, one the server refused to process
    yet, and one our own side failed on are three different facts, and each is said plainly —
    because the message is the only thing the user can act on, and the destructive action a wrong
    message invites is resetting a password that was always correct. The cross-cutting sentences are
    written once (`lib/request-failure.ts`) and name nothing page-specific; anything the server
    rejected outright is the page's own business. This is rule 7 one layer out: a wrong address is
    not a missing thing, a slow one is not either, and neither is an unreachable server.

11. **A confirmation is for what cannot be undone, or what lands on somebody else.** Archiving is
    neither: it is reversible from a link on the page it was started from, and nobody else can tell.
    So it does not ask, and neither does anything else that only rearranges the viewer's own view of
    their own things. Removing a member, leaving a family, removing a connection and revoking a share
    all do ask, because each deletes shares and releases claims that re-inviting does not bring back
    — and the body says so, conditionally and without a count, a gift or a claimer, which is rule 2's
    limit and not a lower one. Unclaiming asks only when there is a recorded purchase to lose;
    unticking a purchase never does, because the amount survives it. The dialog itself is settled and
    is not the subject of this rule — see ADR 0014.

12. **An action on the thing a header or a row is about is always visible.** Rule 11's twin: rule 11
    governs when an action *asks*, this one whether it is *seen*. Nothing that acts on a list, a
    folder, an occasion, a connection or a member is reached by first revealing it — hiding one
    behind a glyph is the fault NEU-1322 named, and the glyph in question hid a menu of a single
    item at two of the four call sites that used it. A row's action says more than its visible text
    where the row alone identifies it, so a roster is not fifty buttons all announced as "Remove".
    Danger treatment is reserved for what cannot be undone, which is why archiving — reversible and
    private, which is why rule 11 holds it needn't ask — is never painted as danger. An action the
    repo holds to be so benign it does not stop to ask cannot also be its loudest. **One exception,
    and it is a width exception rather than a taste one** (NEU-1323, ADR 0016): a header carrying a
    *group* of actions may collapse them behind a labelled disclosure below `md`, where the
    alternative is two rows of buttons stacked above a heading with no room left either. It is
    opt-in per call site and granted to exactly two — the occasion header and a list owner's —
    because a header holding a single action has nothing to group, and hiding that one would rebuild
    the single-item menu this rule was written against. A row never collapses, at any width; and the
    disclosure is a word **and** a chevron carrying `aria-expanded` — never a glyph alone, and
    never dressed as one of the buttons it hides (ADR 0017). This governs action groups on a
    header or a row and nothing else: `GiftsTab`'s claim and purchase controls are a page's content,
    `ActionableBanner` is a CTA, and the admin pages and `SharedAccountCard` are off the main
    product surface. See ADR 0015.
