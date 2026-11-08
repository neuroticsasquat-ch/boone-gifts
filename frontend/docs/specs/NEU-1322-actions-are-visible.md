# NEU-1322 — Actions are visible

**Ticket:** [NEU-1322](https://linear.app/neuroticsasquatch/issue/NEU-1322) — "'...' isn't a clear,
intuitive indicator of the presence of a menu with actions"
**ADR:** [`docs/adr/0009-actions-are-visible.md`](../adr/0009-actions-are-visible.md)

## What to build and why

The app hides actions behind a `⋯` that nobody reads as a menu. `HeaderMenu.tsx` renders
`&#8943;` as *text* in a borderless, transparent button that only gains a tint on hover — so it
reads as truncation or decoration rather than a control, and gives no hint that anything is behind
it.

The fix is not a better glyph. **Delete `HeaderMenu` and surface actions as visible controls**, via
one new `ActionBar` component. The full reasoning, including why this reverses `HeaderMenu`'s own
documented decision, is in ADR 0009; this spec is what to build.

Grounds for going past a cosmetic fix: two of the four `⋯` call sites were menus holding a *single*
item (a viewer's `Add to a folder…`, a `People` row's `Remove`), and `FolderDetail`'s header already
showed its actions as plain buttons — so the app already held both answers and one had to lose.

## The component

`src/components/ActionBar.tsx`, replacing `src/components/HeaderMenu.tsx` (deleted).

```tsx
export type ActionBarItem = {
  label: string;
  onClick: () => void;
  tone?: "danger" | "primary" | "neutral";   // default "neutral"
  pending?: boolean;                          // this item's mutation is in flight
  pendingLabel?: string;                      // e.g. "Archiving…"; defaults to `${label}…`
  ariaLabel?: string;                         // overrides the accessible name; rows only
};

export function ActionBar({ items }: { items: ActionBarItem[] }): React.ReactNode;
```

- **`tone` is `ConfirmDialog`'s existing vocabulary** (`ConfirmDialog.tsx:11`), not a new one. Lift
  the tone→class map so both components read from one place.
- **`neutral`** is the default and covers Edit, Archive, Unarchive and `Add to a folder…`.
- **`danger`** is restrained — red text or a red outline, **not** a solid fill. Used only on Delete
  and Remove.
- **Layout wraps** (`flex flex-wrap`). Labels are never truncated and the bar never scrolls
  horizontally.
- **Danger actions come last**, with a wider gap before them. This replaces `HeaderMenu`'s
  `separatorBefore`, which was used once and always meant exactly this.
- **Any item with `pending` disables every button in the bar**; only the pending item changes its
  label. Two mutations must never race on the same object.
- **`ariaLabel` overrides the accessible name** while the visible text stays short. It must
  *contain* the visible label (WCAG 2.5.3 Label in Name), so `"Remove Jane Boone"` is correct and
  `"Delete connection"` is not.
- **No component-level `ariaLabel` prop.** `HeaderMenu` needed one to name its trigger; a group of
  self-labelled visible buttons does not.

What `ActionBar` does **not** carry, all of it dead with the menu: `open` state, the outside-click
effect, `aria-expanded`, and the `triggerRef.current?.focus()` dance. That last one existed because
choosing a menu item unmounted the trigger before a `ConfirmDialog` could capture it as the
focus-return target. A visible button is already focused when clicked, so it is not needed — but do
confirm focus return still works from `ListDetail`'s Delete, since that is the path it was protecting.

## Call sites — all eight

**Headers** (the `⋯` becomes a bar):

| Site | Items |
|---|---|
| `ListDetail.tsx:236` (owner) | `Add to a folder…`, `Edit`, `Archive`/`Unarchive`, `Delete` (danger) |
| `ListDetail.tsx:309` (viewer) | `Add to a folder…` |
| `OccasionDetail.tsx:380` | `Rename` and/or `Archive`/`Unarchive`, still organizer/creator-gated |
| `FolderDetail.tsx:203` | `Archive`/`Unarchive`, `Edit`, `Delete` (danger) |

**Rows:**

| Site | Items |
|---|---|
| `People.tsx:243` | `Remove` (danger), `ariaLabel: \`Remove ${conn.user.name}\`` |
| `Folders.tsx:77` | `Delete` (danger), `ariaLabel` naming the folder |
| `FolderDetail.tsx:281` | `Remove` (danger), `ariaLabel` naming the list |
| `MembersSection.tsx:104` | promote/demote (neutral) + `Remove` (danger), `ariaLabel` naming the member |

The four non-`⋯` sites currently use solid `bg-red-600` / `bg-green-600` buttons and adopt the tone
model. **`FolderDetail.tsx:206`'s red Archive and green Unarchive become `neutral`** — see
"Constraints" below.

Existing gating, confirmation and mutation wiring is unchanged throughout. `OccasionDetail`'s menu
is still rendered only when `canRename || canArchive`, and still carries only what the viewer may
do. Every `ConfirmDialog` that an action opens today still opens.

## Constraints

1. **`CONTEXT.md` rule 11 is not weakened.** Archiving stays unconfirmed *and* stops being painted
   red. The red Archive at `FolderDetail.tsx:206` contradicts the rule today; this ticket is where
   that dies, not somewhere it is documented and left standing.
2. **Rule 2 is untouched.** No action label, `ariaLabel` or busy state may reveal claim state.
3. **Nothing gains or loses an action.** This is an affordance change. If a viewer could not delete
   a list before, they still cannot.
4. **No new colours.** Everything comes from the `tone` map.

## Acceptance criteria

- `src/components/HeaderMenu.tsx` no longer exists, and no source file renders `&#8943;` or `⋯` as a
  control.
- All eight sites above render their actions as visible controls, reachable with **no prior
  interaction**.
- Archive and Unarchive are visually neutral everywhere; only Delete and Remove are `danger`, and
  `danger` is not a solid fill.
- At a 375px viewport the owner's list header wraps to multiple rows with every label intact, and
  the page does not scroll horizontally.
- Each row action's accessible name names its subject; each contains its visible label.
- Triggering any action disables every button in that bar and gives the triggered one a busy label
  until the mutation settles.
- Focus return from a `ConfirmDialog` opened by an `ActionBar` action still lands on the button that
  opened it.
- `task lint`, `task test` and `task build` pass.

## Documentation deliverables

- **`docs/adr/0009-actions-are-visible.md`** — written, accepted 2026-09-12. No further work.
- **`CONTEXT.md` rule 12** — to be added *with the code*, since the rules describe shipped
  behaviour. Rule 11's twin: rule 11 governs when an action asks, rule 12 whether it is seen. State
  that an action on the thing a header or row is about is always visible; that hiding one behind a
  glyph is the fault NEU-1322 named; that danger is reserved for what cannot be undone, which is why
  archiving — reversible and private (rule 11) — is never painted as danger; and that `GiftsTab`,
  `ActionableBanner`, the admin pages and `SharedAccountCard` are outside the rule.
  **No glossary entry.** "Action bar" is not a word the user meets; the term table is for words they
  do, and `CONTEXT.md` must stay free of implementation detail.
- **`AGENTS.md`** — nine `⋯` references need updating: the component tree entry for `HeaderMenu.tsx`
  (line ~82), the `FolderPicker` note (~149), the `/lists/:id` and `/occasions/:id` routes-table rows
  (~181, ~186), the occasion section (~253), the folders section (~480, ~485) and the archive note
  (~563–564).

## Tests

- **`src/components/action-policy.test.tsx`** — new, modelled on `confirmation-policy.test.tsx`,
  including a docstring saying in English why the *set* is what is asserted. It renders all eight
  sites and asserts every action is present and enabled **before any interaction**, and that no
  control in the app must be activated to reveal another. Phrase it against the rule, not the
  markup, so a future `⋯` fails it automatically.
- **`ActionBar.test.tsx`** — unit coverage for tone classes, wrapping, the whole-bar pending
  disable, the busy label, danger-last ordering, and `ariaLabel` override.
- **Per-site suites** — `ListDetail`, `OccasionDetail`, `People`, `FolderDetail`, `Folders` and
  `MembersSection` tests currently open the menu before asserting; they query the button directly
  now. `HeaderMenu`'s own tests are deleted.

## Out of scope

- **`GiftsTab`** (`:570`, `:693`, `:837`), **`ActionableBanner`** (`:285`), **`AdminUsers`**
  (`:267`), **`AdminInvites`** (`:89`, `:135`), **`FamilySettingsSection`** (`:235`) and
  **`SharedAccountCard`.** Roughly twelve more solid-coloured buttons. They are content controls,
  CTAs, or off the main product surface — not action groups on a header or row. They keep their
  current treatment, and rule 12 is written so as not to claim otherwise.
- **Any change to which actions exist, who may perform them, or which ones confirm.** Confirmation
  policy was settled by NEU-1319 and ADR 0008 and is not reopened.
- **An icon system for actions.** Labels stay textual.
