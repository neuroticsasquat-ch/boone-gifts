# Domain model — Boone Gifts frontend

The vocabulary the UI uses, and which module owns each concept. Conventions, commands, and
architecture live in [`AGENTS.md`](AGENTS.md); this file is only about what the words mean.

## Terms as the user meets them

| UI word | Means | Rendered by |
|---|---|---|
| **My lists** | Lists this account owns | `pages/Lists.tsx` |
| **Shared with me** | Every list someone else has made visible to me, **however it reached me** — a direct share, or an occasion of a family I belong to. One section, never two destinations | `pages/Lists.tsx`, `components/SharedListRows.tsx` |
| **from Jane** / **Boone Family** | The source label on a shared row. A list may have arrived several ways at once, and **direct wins**: a row that also came through an occasion still reads "from Jane", because the direct share is the grant that survives the viewer leaving the family. An occasion-only row is labelled with its **family** — the occasion is how the share was made, the family is who the viewer recognises — and with every distinct family, comma-joined, when more than one carried it | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Share route** | One way a list reached me: a direct share, or an occasion of a family I belong to. A list can have several; `shared_via` is the array of all of them | `lib/attribution.ts`, `lib/list-grouping.ts` |
| **for Beth** | This list is kept for a person with no account | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Group by** | How I ask *Shared with me* to subdivide — by occasion, person, or folder. Off by default; every grouping keeps a "Not in a …" bucket so nothing vanishes; held in the URL as `?group=`, so it survives a round trip and can be shared | `pages/Lists.tsx`, `lib/list-grouping.ts` |
| **People** | Connections and families together — everyone I share with | `pages/People.tsx` |
| **A person's page** | Every list that person owns which I can see, **however it reached me**. Derived from the shared scope rather than fetched as its own index; it lists no occasions, and it is a label's destination rather than a second index | `pages/ConnectionProfile.tsx` |
| **Family** | A named group of people. A list reaches one **through an occasion of that family**, never the family itself. Its page administers the family — members, occasions, settings — and is **not** the way in to an occasion | `pages/FamilyDetail.tsx` |
| **Folder** | My saved grouping of lists — "Christmas 2026". Was called a *collection*, then an *occasion*. Has a page (`/folders/:id`) but no index | `pages/FolderDetail.tsx` |
| **Add a List** | The folder's picker: **every list I can see** that is not already in this folder — mine and ones shared with me, since a folder groups the people I'm buying for, who are by definition not me. The third list-choosing surface and the only one holding both populations, so it labels per row rather than per section: a row someone else owns carries its attribution line, a row I own carries only "for Beth" or nothing. Inline on the Lists tab, with no filter of its own | `pages/FolderDetail.tsx` |
| **Occasion** | A family's shared gifting occasion — "Boone Family · Christmas 2026". The unit a list is shared *to*, and the only thing that makes a family shareable. **Always named with its family** — as a linked eyebrow above the name on its own page's heading, and as an unlinked prefix in every heading that points at it — two families routinely both call one "Christmas 2026" | `pages/OccasionDetail.tsx`, `pages/lists/OccasionStrip.tsx` (finding one), `pages/family-detail/OccasionsSection.tsx` (managing one), `lib/occasion-choice.ts` |
| **Who can see this list** | The owner's one sharing surface — families and connections in a single dialog, with one filter box across both sections and a line saying what is ticked. Over a list that exists it sits behind the header's **Sharing…** action, in the same bar as everything else you can do to the list, and every tick is a write; **New List mounts the same dialog** behind `Choose…`, holding its ticks until the list is created and starting from **nothing ticked**. Its open-ness is the address: `?share=open` | `components/SharingModal.tsx` (the rows), `ListSharingModal.tsx` / `DraftSharingModal.tsx` (the two modes) |
| **Share a list** | The **other** sharing direction: the occasion is fixed and the *list* is chosen, from lists I own. The same dialog chrome, a different population and a different write — one `PUT` per tick, add-only, and a list already here is ticked and dead. Offered from the occasion page's Lists tab in both its states, and from an empty card in the occasion strip | `components/OccasionSharingModal.tsx` (the rows), `ShareIntoOccasionButton.tsx` (the control), `SharingShell.tsx` (the chrome both modes wear) |
| **Occasion strip** | The row of occasion cards at the top of `/lists`: every non-archived occasion in every family I belong to, most recently active first, four at a time. Absent entirely when I have none. Carries no money | `pages/lists/OccasionStrip.tsx` |
| **Archive prompt** | A standing question about one occasion that has gone quiet: archive it, or not yet. Asked of the occasion's creator or an organizer of its family, in the banner that already carries connection requests and family invites. Names the occasion and its family and nothing else. "Not yet" is a dated snooze, not a permanent dismissal | `components/ActionableBanner.tsx` |
| **Claim** / "I'll get this" | My private intent to buy a gift. Never visible to the list's owner | `pages/list-detail/GiftsTab.tsx` |
| **My shopping** | Everything *I* have claimed within one occasion or one folder — what I still have to buy, what I bought, and what I paid. Never anyone else's, in any aggregate | `components/MyShopping.tsx` |
| **Account person** | A named person on a shared login; a list can be marked as being for one | `components/ListForFields.tsx` |
| **Budget** | A spending target *I* set for myself against one occasion or one folder, and what I have spent toward it. Private to me — organizers name an occasion and never see any money | `components/BudgetLine.tsx` |

Words the UI must **not** use: "collection" (rejected outright — it reads too close to "connection"),
"occasion" for a folder (the word is reserved for a family's shared occasion — see
[`docs/adr/0002-occasion-and-folder.md`](docs/adr/0002-occasion-and-folder.md)), "family list" (a list shared via a family
is just a shared list, labelled with the family), "family grant" / "family share" as a thing
pointing at a family (it points at an occasion — project spec §4), "connect"/"collect" as navigation labels,
"connections" and "families" as navigation labels (both name a *section* of `/people` rather than the page — the same
fault, retired in NEU-1302; the destinations are **Lists**, **People**, or a family's own name), "they use
this app", "simple mode" (retired in NEU-1261 — the full-mode behaviour is the only
behaviour).

## Rules the UI must respect

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
   ([`docs/adr/0007-occasions-are-a-destination.md`](docs/adr/0007-occasions-are-a-destination.md),
   amending [ADR 0005](docs/adr/0005-grouping-returns-as-an-opt-in.md)). An occasion heading names
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
   target, not a limit.

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
   [`docs/adr/0006-route-ids-are-validated-at-the-route.md`](docs/adr/0006-route-ids-are-validated-at-the-route.md)).
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
    is not the subject of this rule — see ADR 0008.

12. **An action on the thing a header or a row is about is always visible.** Rule 11's twin: rule 11
    governs when an action *asks*, this one whether it is *seen*. Nothing that acts on a list, a
    folder, an occasion, a connection or a member is reached by first revealing it — hiding one
    behind a glyph is the fault NEU-1322 named, and the glyph in question hid a menu of a single
    item at two of the four call sites that used it. A row's action says more than its visible text
    where the row alone identifies it, so a roster is not fifty buttons all announced as "Remove".
    Danger treatment is reserved for what cannot be undone, which is why archiving — reversible and
    private, which is why rule 11 holds it needn't ask — is never painted as danger. An action the
    repo holds to be so benign it does not stop to ask cannot also be its loudest. **One exception,
    and it is a width exception rather than a taste one** (NEU-1323, ADR 0010): a header carrying a
    *group* of actions may collapse them behind a labelled disclosure below `md`, where the
    alternative is two rows of buttons stacked above a heading with no room left either. It is
    opt-in per call site and granted to exactly two — the occasion header and a list owner's —
    because a header holding a single action has nothing to group, and hiding that one would rebuild
    the single-item menu this rule was written against. A row never collapses, at any width; and the
    disclosure is a word carrying `aria-expanded`, never a glyph. This governs action groups on a
    header or a row and nothing else: `GiftsTab`'s claim and purchase controls are a page's content,
    `ActionableBanner` is a CTA, and the admin pages and `SharedAccountCard` are off the main
    product surface. See ADR 0009.
