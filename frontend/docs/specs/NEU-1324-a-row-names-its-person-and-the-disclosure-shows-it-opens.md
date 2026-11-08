# NEU-1324 — A row names its person, and the disclosure looks like one

**Ticket:** [NEU-1324](https://linear.app/neuroticsasquatch/issue/NEU-1324/a-list-row-says-whose-list-it-is-and-the-actions-control-looks-like-a) —
"when lists are listed (like on an occasion page), the author/recipient name should be included so
that if they don't put it in the list title, other family members will know whose list it is" and
"the actions button … shouldn't be a button indistinguishable from the buttons it reveals but should
be a simpler label with a glyph making it clear that it can be opened/collapsed."
**ADR:** [`docs/adr/0011-a-disclosure-carries-a-chevron.md`](../adr/0011-a-disclosure-carries-a-chevron.md),
amending [ADR 0010](0010-a-header-may-collapse-its-actions-on-a-phone.md) and narrowing one line of
[ADR 0009](0009-actions-are-visible.md).
**Repos:** `boone-gifts-frontend` **only**. Every field Part 1 needs is already on `GiftList`; the one
surface that *can't* be fixed without a backend change is named in "Out of scope".
**Project:** Boone Gifts: Maintenance. **No milestone, no project description, no project spec** — no
shared contracts beyond `CONTEXT.md` and the ADRs named here.
**Related:** [NEU-1323](https://linear.app/neuroticsasquatch/issue/NEU-1323) (merged), whose
`collapseOnMobile` trigger Part 2 restyles and whose **constraint 4** Part 2 reverses.
**Branch from and target:** `main`. `release/v0.6.0` has shipped and no release branch is open.

## What to build and why

Two unrelated complaints, filed together because both are a control or a row failing to say what it
is at a glance.

1. **A listed list names a person.** Today a row can name nobody, and on the one surface the ticket
   calls out by name it usually names the *wrong* thing.
2. **The `Actions` trigger reads as a disclosure**, not as a sixth button identical to the five it
   hides.

### Part 1's real fault is not the one the ticket describes

The ticket says other family members can't tell whose list it is. That is true, but not for the
reason it assumes — and the actual cause is one line of precedence, not a missing field.

`src/lib/attribution.ts:65`, `attributionFor`, ranks four answers:

| # | Condition | Renders |
|---|---|---|
| 1 | `recipient_name` is set | `for Beth · kept by Tom` |
| 2 | a `direct` share route exists | `from Jane` |
| 3 | **an occasion route exists** | **`Boone Family`** — a family, not a person |
| 4 | no routes at all | `from Jane` |

On `/occasions/:id` a list normally arrives through **that occasion and nothing else** — that is what
the page *is* — so it lands on **branch 3** and the row reads `Boone Family`. On a page already
headed `Boone Family → Christmas 2026`, every other person's list repeats the page's own family and
identifies nobody.

`OccasionDetail.tsx:510` claims the opposite in a comment — *"the row names the person it came from
rather than repeating the family overhead"* — and it is simply wrong: that only happens when the
owner **also** shared directly with the viewer. NEU-1323's fixture carried both routes, which is why
the page has always looked correct under test.

The family label is **not** a bug in general. On `/lists` → *Shared with me* it is the useful answer:
it says *how* a list reached you, which is the thing NEU-1235 added it for. It is only redundant
where the surface has already established the family. So the rule is not "stop naming families" — it
is "name the family where it disambiguates, and the person where it doesn't."

**This is rule 3's test applied one level down**, and the symmetry is deliberate: NEU-1323 made the
occasion heading's family a link *on the page the viewer has arrived at* and a plain prefix
everywhere else, because arriving is what stops the family from disambiguating. The same sentence
decides this row.

### The second fault: a row can name nobody at all

`RecipientLine` (`src/components/ListAttribution.tsx:28`) returns `null` when `recipientLabel()` is
null — i.e. when a list has neither `recipient_name` nor `account_person_name`. That is the **default
state of an ordinary list on a non-shared account**, not an edge case, and it leaves a bare title on
five surfaces:

`Lists.tsx:307`, `OccasionDetail.tsx:514`, `FolderDetail.tsx:277`, `FolderDetail.tsx:434`,
`ListsArchive.tsx:80` — every one of them the *viewer's own* list. A list someone else owns can never
be nameless, because `ListAttributionLine` always renders text.

## Part 1 — A row names its person

### 1.1 `attributionFor` learns what the surface already knows

`src/lib/attribution.ts`:

```ts
export function attributionFor(
  list: ListLike,
  { withinFamily = false }: { withinFamily?: boolean } = {},
): ListAttribution
```

When `withinFamily` is set, **branch 3 is skipped** and an occasion-only list falls through to
branch 4 — `{ kind: "owner", subject: list.owner_name }` — which renders `from Jane`. Nothing else
about the function moves: branches 1, 2 and 4 are untouched at both settings, and the default is
`false`, so every existing caller keeps today's behaviour with no edit.

- **A second argument, not a second function.** One precedence list, read one way, with one step
  conditional. An `attributionWithinFamily()` beside it would be that list written twice.
- **The option names what the *surface* has established, not what to hide.** `withinFamily` is a fact
  about where the row is being drawn; `omitFamily` would be an instruction about what to do with it,
  and the caller would then be the thing deciding policy.

### 1.2 `ListAttributionLine` passes it through

```tsx
<ListAttributionLine list={list} withinFamily />
```

Same name, same meaning, forwarded straight to `attributionFor`. Default `false`.

### 1.3 Exactly one call site sets it

| Site | `withinFamily` | Why |
|---|---|---|
| `OccasionDetail.tsx:516` — the Lists tab | **yes** | The page heading is the family. The row's job here is *who*, not *how* |
| `Lists.tsx` → *Shared with me* (`SharedListRows`) | no | The family **is** the answer — how this list reached you (NEU-1235) |
| `ConnectionProfile.tsx:104` (`SharedListRows`) | no | Same component, same reason; scoped to one person already, but the route still informs |
| `FolderDetail.tsx:277` — folder lists | no | **A folder is not family-scoped.** `CONTEXT.md` defines it as "my saved grouping of lists"; one folder routinely holds lists from two families, so nothing has been established |
| `FolderDetail.tsx:434` — Add a List picker | no | Same |
| `ListsArchive.tsx:96` — archived shared lists | no | No family established |

**The folder pages are the limiting case, and they are a deliberate "no".** A folder looks family-ish
— it is often literally named "Christmas 2026" — and that is exactly the trap: the folder's name is
the *user's* word for a grouping, carries no family, and may span several. Setting the flag there
would replace a true label with a guess.

### 1.4 An owned row that names nobody says `Mine`

`RecipientLine` stops returning `null`:

```tsx
export function RecipientLine({ list }: { list: ListLike }) {
  return <p className="mt-0.5 text-sm text-gray-500">{recipientLabel(list) ?? "Mine"}</p>;
}
```

- **`Mine`, not `from Tom`.** `OccasionDetail.tsx:510` and `FolderDetail.tsx:271` both record why the
  owner's own name is not read back to them, and that objection stands. `Mine` is not the viewer's
  name; it is the row's relationship to them.
- **One word, and it does real work on a mixed screen**: on the occasion page it is what tells your
  list from the four others in the occasion at a glance.
- **Everywhere, including `/lists` and `/lists/archive`**, where every row is yours and the word is
  therefore mildly redundant. That redundancy is accepted in exchange for one rule: `RecipientLine`
  means "your own row" at every call site, and a per-surface split would need a second rule and a
  second assertion in the consistency suite.
- **`RecipientLine` is owner-only at every one of its five call sites** — three gate on
  `owner_id === user?.id` or `isOwn`, two are inside an owned-scope section — so the fallback cannot
  reach a list the viewer doesn't own. **Any new call site must preserve that**, and the consistency
  test is where that is enforced.

### 1.5 `owner_name` is trimmed like every other name

`attributionFor` guards neither of its `owner_name` reads, while `recipientNameOf` (`:146`) and
`accountPersonNameOf` (`:126`) both `.trim()` and collapse `""` to `null`. A blank owner therefore
renders the literal `from ` with nothing after it — and Part 1 makes branch 4 far more reachable, so
the hole stops being theoretical. Trim it in both branch 1 (`keeper`) and branch 4 (`subject`), and
fall back to the existing text rather than inventing a name: a list whose owner has no name renders
the family if it has one, and otherwise nothing rather than a dangling preposition.

## Part 2 — The disclosure looks like a disclosure

### 2.1 What changes

`src/components/ActionBar.tsx`'s `collapseOnMobile` trigger currently uses
`ACTION_TONE_CLASSES.neutral` — byte-for-byte the treatment of the buttons it reveals. It becomes:

```tsx
<button type="button" aria-expanded={open} disabled={busy} onClick={…}>
  Actions <span aria-hidden="true">⌄</span>
</button>
```

- **The word stays.** `Actions` is still the label, so ADR 0009's finding — the complaint was that
  `⋯` **alone** does not read as a menu — survives untouched. This ticket adds an affordance; it does
  not take the word away.
- **The chevron points down at rest and up when open**, and is `aria-hidden`. `aria-expanded` is
  already the accessible statement of the same fact; a screen reader must not hear it twice.
- **The button chrome goes.** No border, no filled background — a quieter, link-ish treatment so the
  control that *opens* the bar is visibly not one of the things inside it.
- **The trigger keeps its disabled state** while any item is pending, and still greys with the rest.

### 2.2 Where the treatment lives

In `ActionBar.tsx`, **not** in `tone.ts`. `tone.ts`'s own docstring says it is "the app's one
vocabulary for how loud an *action* is, shared by the dialog that asks and the bar that offers" — and
a disclosure trigger is not an action on the subject at all. It acts on the bar. Adding a
`disclosure` entry to a `Record<Tone, string>` would put chrome into a vocabulary about danger.

**This reverses NEU-1323's constraint 4** — *"No new colours and no new tone. The disclosure trigger
uses the existing `neutral` classes from `tone.ts`"* — and that is the point of the ticket. No new
*colour* is introduced: the treatment is existing greys and the existing focus ring.

### 2.3 What it does not change

Everything ADR 0010 decided about *behaviour*: the two call sites that opt in, the six that don't,
rows never collapsing, the panel expanding in place, and **the panel staying open when an action
inside it is triggered** (which is load-bearing for focus return, not cosmetic). This part is
treatment only.

## Constraints

1. **`expectNoGlyphControls()` keeps its meaning and its teeth.** It asserts no control's *whole*
   label is a glyph (`/^[⋯….·]+$/` over trimmed `textContent`). `Actions ⌄` passes it because the
   word is still there — **not** because the assertion was weakened. The test must not be edited to
   accommodate this change; if it ever needs to be, the change has gone wrong.
2. **No row loses a person it names today.** Every change here adds or substitutes; nothing that
   currently reads `for Beth`, `from Jane` or `for Beth · kept by Tom` may stop doing so.
3. **`/lists` → *Shared with me* is untouched.** The family label is the answer there, and a diff
   that changes that page's rows has misread the rule.
4. **No backend change**, and no new field consumed. Everything Part 1 needs is already required on
   `GiftList` (`types/index.ts:50`).
5. **No new `ActionBar` call site gains `collapseOnMobile`**, and the two that have it keep it. Part 2
   is treatment; ADR 0010's grant list is closed.
6. **`RecipientLine` stays owner-only.** Its `Mine` fallback is correct *only* because every call site
   has already established the viewer owns the row.

## Acceptance criteria

**The occasion page names people**

1. On `/occasions/:id`, a list owned by someone else and shared **only** into that occasion reads
   `from <owner>`, not the family name.
2. The same list on `/lists` → *Shared with me* still reads `Boone Family` — the family label is
   unchanged off this page.
3. A list on `/occasions/:id` that also carries a **direct** share still reads `from <person>`
   (branch 2 wins as it always did), and one with a recipient still reads
   `for Beth · kept by Tom`.
4. A list reached through **two** families still comma-joins them on `/lists`, unchanged.

**No row is nameless**

5. The viewer's own list with no recipient and no account person reads `Mine` on all five surfaces:
   `/lists`, `/lists/archive`, `/occasions/:id`, `/folders/:id`, and the folder's **Add a List**
   picker.
6. The viewer's own list **with** a recipient still reads `for Beth` — `Mine` is a fallback, never a
   replacement.
7. A list whose `owner_name` is blank never renders a dangling `from ` or `kept by ` with nothing
   after it.

**The folder pages are unchanged**

8. `/folders/:id` and its picker render exactly what they render today for every list, owned and
   shared alike, except for criterion 5's `Mine`.

**The disclosure**

9. Below 768px the occasion header and the list owner's header render one control whose accessible
   name is `Actions`, carrying `aria-expanded`, with a chevron that is `aria-hidden` and therefore
   absent from that accessible name.
10. The chevron's direction reflects the state, and `aria-expanded` still carries it for assistive
    technology.
11. The trigger is visually distinct from the action buttons it reveals: it has neither the border
    nor the filled background they carry.
12. One press still reveals **every** action, enabled, tones and ordering intact; triggering one
    still leaves the panel open; a pending item still disables the panel and its trigger.
13. `expectNoGlyphControls()` passes **unmodified**.
14. At ≥ 768px all eight call sites render exactly as they do today.

**Everything**

15. `task lint`, `task test` and `task build` pass.

## Documentation deliverables

- **`docs/adr/0011-a-disclosure-carries-a-chevron.md`** — written, accepted 2026-09-12. Follows the
  house convention ADR 0010 set: a new ADR, with a header pointer added to the one it amends and
  **nothing rewritten in the old file's body**.
- **`CONTEXT.md`** — two rows and one rule are **already edited in the working tree**; ship them with
  the code. The **from Jane / Boone Family** term (`:12`) now states the "family where it
  disambiguates, person where it doesn't" rule; the **Add a List** row (`:20`) no longer says an owned
  row carries "only 'for Beth' or nothing"; rule 12 gains the chevron.
- **`AGENTS.md`** — update with the code:
  - the `ActionBar.tsx` entry — the trigger's treatment and its chevron.
  - the `lib/` entry for `attribution.ts` — `withinFamily` and what it is for.
  - the `/occasions/:id` routes-table row and the occasion prose — the Lists tab names owners.
  - the testing section's case count.
- **No glossary entry for `Mine`** — it is a word the user meets, but it is one word on a row and the
  **from Jane / Boone Family** term already covers what a row's second line is for.

## Tests

**`src/lib/attribution.test.ts`**
- `withinFamily` omitted → all four branches behave exactly as today (the regression guard on the
  default).
- `withinFamily: true` + an occasion-only list → `{ kind: "owner", subject: owner_name }`.
- `withinFamily: true` + a **direct** route → still `from <person>`; the flag must not outrank
  branch 2.
- `withinFamily: true` + a **recipient** → still `for Beth · kept by Tom`; branch 1 is untouched.
- A blank/whitespace `owner_name` renders no dangling preposition, in both branch 1 and branch 4.

**`src/components/ListAttribution.consistency.test.tsx`** — extend the existing cross-page guard,
which today covers four call sites and **misses two**.
- Add `/occasions/:id` (`ListsTab`) and `/lists/archive` to the covered set.
- The occasion case asserts the *inverted* answer: the same fixture that reads `Boone Family` on
  `/lists` reads `from Jane` here. This pair is the whole rule, in one file.
- Every owned-row case asserts `Mine` where there is no recipient.

**`src/components/ActionBar.test.tsx`**
- The trigger's **accessible name is exactly `Actions`** — the chevron is `aria-hidden` and does not
  leak into it.
- The chevron flips with the state, and `aria-expanded` flips with it.
- The trigger carries neither the border nor the fill the action buttons carry — asserted against
  the buttons in the same bar, so a future restyle of both together doesn't silently pass.
- Every existing case in the file keeps passing unchanged.

**`src/components/action-policy.test.tsx`** — `expectNoGlyphControls()` is **not** edited. Both mobile
cases keep passing over the new trigger, which is the assertion that the word survived.

**`src/pages/OccasionDetail.test.tsx`**
- A list shared only into the occasion, owned by someone else, reads `from Jane`.
- The viewer's own recipient-less list on that page reads `Mine`.

## Out of scope / deferred

- **`MyShopping`'s list headings** (`components/MyShopping.tsx:83`), on both the occasion and folder
  shopping tabs. It is a genuine list-of-lists that names nobody, and two people's "Christmas List"
  are indistinguishable there — but its payload is `ShoppingItem` (`types/index.ts:366`), which
  carries `list_id` and `list_name` and **no owner, recipient or routes at all**. Fixing it needs a
  backend change or a second request, which is a different ticket in a different repo.
- **`OccasionSharingModal`'s rows** (`components/sharing-rows.tsx:105`). They deliberately carry only
  the list name; the population is owner-only, so nothing is ambiguous about whose they are. Already
  documented at `OccasionSharingModal.tsx:210`.
- **The list detail page's own header.** `ListDetail.tsx` is a detail surface, not a row, and its
  payload carries no `shared_via` at all — so `attributionFor` there can never reach branch 3 and has
  nothing to suppress.
- **Any change to how `/lists` groups or labels shared rows.** NEU-1235's family label is the answer
  on that page and stays exactly as it is.
- **Naming an account person to a viewer.** `attribution.ts:18` records why an account person is a
  label *inside* an account and never a viewer-side name; unchanged.
- **Avatars, initials or any non-text identity on a row.** Considered and not taken — a row's second
  line is text everywhere in this app.
- **Widening `collapseOnMobile` to a seventh call site.** ADR 0010's grant list is closed and its
  policy test enforces it.
