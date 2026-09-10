# Domain model — Boone Gifts frontend

The vocabulary the UI uses, and which module owns each concept. Conventions, commands, and
architecture live in [`AGENTS.md`](AGENTS.md); this file is only about what the words mean.

## Terms as the user meets them

| UI word | Means | Rendered by |
|---|---|---|
| **My lists** | Lists this account owns | `pages/Lists.tsx` |
| **Shared with me** | Every list someone else has made visible to me, **however it reached me** — a direct share, or an occasion of a family I belong to. One section, never two destinations | `pages/Lists.tsx` |
| **from Jane** / **Boone Family** | The source label on a shared row. A list may have arrived several ways at once, and **direct wins**: a row that also came through an occasion still reads "from Jane", because the direct share is the grant that survives the viewer leaving the family. An occasion-only row is labelled with its **family** — the occasion is how the share was made, the family is who the viewer recognises — and with every distinct family, comma-joined, when more than one carried it | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Share route** | One way a list reached me: a direct share, or an occasion of a family I belong to. A list can have several; `shared_via` is the array of all of them | `lib/attribution.ts`, `lib/list-grouping.ts` |
| **for Beth** | This list is kept for a person with no account | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **Group by** | How I ask *Shared with me* to subdivide — by occasion, person, or folder. Off by default; every grouping keeps a "Not in a …" bucket so nothing vanishes | `pages/Lists.tsx`, `lib/list-grouping.ts` |
| **People** | Connections and families together — everyone I share with | `pages/People.tsx` |
| **Family** | A named group of people. A list reaches one **through an occasion of that family**, never the family itself | `pages/FamilyDetail.tsx` |
| **Folder** | My saved grouping of lists — "Christmas 2026". Was called a *collection*, then an *occasion*. Has a page (`/folders/:id`) but no index | `pages/FolderDetail.tsx` |
| **Occasion** | A family's shared gifting occasion — "Christmas 2026". The unit a list is shared *to*, and the only thing that makes a family shareable | `pages/OccasionDetail.tsx`, `pages/family-detail/OccasionsSection.tsx`, `lib/occasion-choice.ts` |
| **Occasion strip** | The row of occasion cards at the top of `/lists`: every non-archived occasion in every family I belong to, most recently active first, four at a time. Absent entirely when I have none. Carries no money | `pages/lists/OccasionStrip.tsx` |
| **Claim** / "I'll get this" | My private intent to buy a gift. Never visible to the list's owner | `pages/list-detail/GiftsTab.tsx` |
| **My shopping** | Everything *I* have claimed within one occasion or one folder — what I still have to buy, what I bought, and what I paid. Never anyone else's, in any aggregate | `components/MyShopping.tsx` |
| **Account person** | A named person on a shared login; a list can be marked as being for one | `components/ListForFields.tsx` |
| **Budget** | A spending target *I* set for myself against one occasion or one folder, and what I have spent toward it. Private to me — organizers name an occasion and never see any money | `components/BudgetLine.tsx` |

Words the UI must **not** use: "collection" (rejected outright — it reads too close to "connection"),
"occasion" for a folder (the word is reserved for a family's shared occasion — see
[`docs/adr/0002-occasion-and-folder.md`](docs/adr/0002-occasion-and-folder.md)), "family list" (a list shared via a family
is just a shared list, labelled with the family), "family grant" / "family share" as a thing
pointing at a family (it points at an occasion — project spec §4), "connect"/"collect" as navigation labels, "they use
this app", "simple mode" (retired in NEU-1261 — the full-mode behaviour is the only
behaviour).

## Rules the UI must respect

1. **The backend is always the gate.** Hidden or read-only controls are a courtesy, never a
   permission. Anything the UI hides is also refused server-side — *unless the control is disabled
   because the grant would be redundant rather than forbidden*. The one such case is a person the
   sharing panel disables because a family occasion already reaches them (rule 6): the API still
   accepts that direct share, because a direct share is the grant that survives the person leaving
   the family or the occasion share being revoked.

2. **Owners are blind to claims, and no user sees another's.** No screen, count, badge, or error
   message may reveal claim state on a list the viewer owns — including the revoke-a-share dialog,
   which offers a choice without naming gifts, claimers, or counts. The **My shopping** tabs are the
   same rule seen from the other side: they show only the viewer's own claims, and no endpoint
   behind them takes a parameter that could widen that. The rule holds across an account switch
   and not only per request: the client's query cache is dropped whenever the viewer changes, so
   one person's fetched data is never painted for the next on a shared device.

3. **Source is a label, not a destination.** How a list reached the viewer is rendered on the row.
   It never becomes its own page, tab, or filter-by-default. It may become a *heading* — but only
   inside **Shared with me**, only because the viewer switched Group by on, and never as a link:
   the one grouping whose heading leads anywhere is Folder, which is the viewer's own grouping and
   not a source at all (see [`docs/adr/0005-grouping-returns-as-an-opt-in.md`](docs/adr/0005-grouping-returns-as-an-opt-in.md)).
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
   existing grant stays visible and revokable.
   The same "listed, disabled, reason given" shape covers a **person an active occasion share
   already reaches**: their box is dead because ticking it would change nothing, and the row names
   every family that covers them. It applies only to an *unticked* box — a direct share already
   made stays revokable, because this panel is the only place to revoke one. Archived shares are
   outside the rule: they still grant sight, but the row stays live, since a direct share is what
   the owner would want as that occasion winds down.

7. **A wrong address is not a missing thing, and neither is a slow one.** An `:id` in a route is a
   positive integer or it is not an address at all — the page it names is never asked for, never
   loaded, and never spun on. The viewer is told plainly that the address is wrong and given one way
   back, with no retry offered, because retrying a malformed address cannot help. This is enforced at
   the route rather than in the pages, so a page that renders has a real id by construction (see
   [`docs/adr/0006-route-ids-are-validated-at-the-route.md`](docs/adr/0006-route-ids-are-validated-at-the-route.md)).
   Distinct from a *reachability* failure: a valid id the viewer may not see stays the backend's
   answer, and keeps its own arm.
