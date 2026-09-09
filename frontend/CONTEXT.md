# Domain model — Boone Gifts frontend

The vocabulary the UI uses, and which module owns each concept. Conventions, commands, and
architecture live in [`AGENTS.md`](AGENTS.md); this file is only about what the words mean.

## Terms as the user meets them

| UI word | Means | Rendered by |
|---|---|---|
| **My lists** | Lists this account owns | `pages/Lists.tsx` |
| **Shared with me** | Every list someone else has made visible to me, **however it reached me** — a direct share, or an occasion of a family I belong to. One section, never two destinations | `pages/Lists.tsx` |
| **from Jane** / **Boone Family** | The source label on a shared row — `shared_via` from the API. An occasion share is labelled with its **family**: the occasion is how the share was made, the family is who the viewer recognises | `components/ListAttribution.tsx` |
| **for Beth** | This list is kept for a person with no account | `components/ListAttribution.tsx`, `lib/attribution.ts` |
| **People** | Connections and families together — everyone I share with | `pages/People.tsx` |
| **Family** | A named group of people. A list reaches one **through an occasion of that family**, never the family itself | `pages/FamilyDetail.tsx` |
| **Folder** | My saved grouping of lists — "Christmas 2026". Was called a *collection*, then an *occasion*. Has a page (`/folders/:id`) but no index | `pages/FolderDetail.tsx` |
| **Occasion** | A family's shared gifting occasion — "Christmas 2026". The unit a list is shared *to*, and the only thing that makes a family shareable | `pages/OccasionDetail.tsx`, `pages/family-detail/OccasionsSection.tsx`, `lib/occasion-choice.ts` |
| **Claim** / "I'll get this" | My private intent to buy a gift. Never visible to the list's owner | `pages/list-detail/GiftsTab.tsx` |
| **My shopping** | Everything *I* have claimed within one occasion or one folder — what I still have to buy, what I bought, and what I paid. Never anyone else's, in any aggregate | `components/MyShopping.tsx` |
| **Account person** | A named person on a shared login; a list can be marked as being for one | `components/ListForFields.tsx` |

Words the UI must **not** use: "collection" (rejected outright — it reads too close to "connection"),
"occasion" for a folder (the word is reserved for a family's shared occasion — see
[`docs/adr/0002-occasion-and-folder.md`](docs/adr/0002-occasion-and-folder.md)), "family list" (a list shared via a family
is just a shared list, labelled with the family), "family grant" / "family share" as a thing
pointing at a family (it points at an occasion — project spec §4), "connect"/"collect" as navigation labels, "they use
this app", "simple mode" (retired in NEU-1261 — the full-mode behaviour is the only
behaviour).

## Rules the UI must respect

1. **The backend is always the gate.** Hidden or read-only controls are a courtesy, never a
   permission. Anything the UI hides is also refused server-side.

2. **Owners are blind to claims, and no user sees another's.** No screen, count, badge, or error
   message may reveal claim state on a list the viewer owns — including the revoke-a-share dialog,
   which offers a choice without naming gifts, claimers, or counts. The **My shopping** tabs are the
   same rule seen from the other side: they show only the viewer's own claims, and no endpoint
   behind them takes a parameter that could widen that.

3. **Source is a label, not a destination.** How a list reached the viewer is rendered on the row.
   It never becomes its own page, tab, or filter-by-default.

4. **A list is for an account person, or for someone with no account, or for neither.** The two
   controls are mutually exclusive; picking one clears the other.

5. **A share points at an occasion, not a family.** A family with no active occasion is listed and
   disabled with the reason, never hidden; a family with several is not shared to until one is
   chosen. Archiving an occasion blocks new shares and nothing else — it never withdraws one, so an
   existing grant stays visible and revokable.
