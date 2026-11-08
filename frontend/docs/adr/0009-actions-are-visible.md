# ADR 0009 — Actions on a thing are visible

**Status:** Accepted (2026-09-12)
**Ticket:** [NEU-1322](https://linear.app/neuroticsasquatch/issue/NEU-1322)
**Spec:** [`docs/specs/NEU-1322-actions-are-visible.md`](../specs/NEU-1322-actions-are-visible.md)
**Amended by:** [ADR 0010](0010-a-header-may-collapse-its-actions-on-a-phone.md) (a header may
collapse a *group* of actions below `md`), [ADR 0011](0011-a-disclosure-carries-a-chevron.md)
(the disclosure is a word **and** a chevron). Nothing below was rewritten — read them in order.

## Context

This ADR **reverses a documented decision.** `HeaderMenu.tsx` stated its own reasoning plainly:

> The app's one overflow menu, wherever a `⋯` is the right way to hold actions back — in a page
> header, so the header can lead with the thing itself rather than with its controls, or on a row,
> so a list of people is a list of people rather than a column of red buttons.

That reasoning is about **restraint**, and it is good reasoning. It is also answered by a cheaper
means than hiding, which is what this ADR substitutes.

The complaint that opened NEU-1322 was that `⋯` does not read as a menu. The trigger was
`&#8943;` rendered as *text* — grey, borderless, transparent, gaining a tint only on hover. Nothing
about it said "control", and nothing about it said "there are things you can do here".

Two facts made the narrow fix — a better-looking `⋯` — the wrong one:

**Two of the four call sites were menus holding one item.** `ListDetail`'s viewer header held
`Add to a folder…` alone; a `People` row held `Remove` alone. Two clicks to reach one action, behind
a glyph nobody recognised.

**The app already contained the opposite answer, and preferred it.** `FolderDetail`'s header hung
Archive, Edit and Delete as three visible buttons and had always done so. Whatever this ADR decided,
one of the two patterns was going to lose.

## Decision

**Every action on the thing a page header or a list row is about is a visible control. Nothing that
acts on it is reached by first revealing it.** `HeaderMenu` is deleted; `ActionBar` replaces it.

```tsx
<ActionBar
  items={[
    { label: "Add to a folder…", onClick: onAddToFolder },
    { label: "Edit", onClick: onEdit },
    { label: "Archive", onClick: archive, pending: archiveMutation.isPending },
    { label: "Delete", onClick: confirmDelete, tone: "danger" },
  ]}
/>
```

- **`tone` is `ConfirmDialog`'s vocabulary, not a second one.** `"danger" | "primary" | "neutral"`
  already exists at `ConfirmDialog.tsx:11`; the action that opens a dialog and the action inside it
  now describe themselves with the same word.

- **Archive is `neutral`, and this corrects an existing contradiction.** `FolderDetail.tsx:206`
  painted Archive `bg-red-600` — the app's danger colour, identical to the Delete button beside it.
  `CONTEXT.md` rule 11 says archiving *"is reversible from a link on the page it was started from,
  and nobody else can tell. So it does not ask."* An action the repo holds to be so benign it needn't
  confirm cannot also be its loudest. `HeaderMenu`'s own `danger` flag agreed: it was set on exactly
  two items in the app, Delete and Remove, and never on Archive.

- **`danger` is restrained — red text or a red outline, not a solid fill.** This is what answers the
  "column of red buttons" objection that the `⋯` existed to avoid. The objection was about *visual
  weight*, never about needing a menu, and weight is answerable by treatment. Solid red is the
  loudest thing on a page and is wasted on a control that is one click from a confirmation anyway
  (ADR 0008).

- **Wrap; never scroll, never truncate.** The owner's list header is roughly 355px of buttons
  against about 343px of usable width at a 375px viewport, so it wraps to two rows on a phone. A
  horizontal scroll strip would push actions past the visible edge with only a faint cue they exist,
  which is this ticket's original complaint in a new costume.

- **Any pending item disables the whole bar; only the working item says so.** `HeaderMenu` got this
  free — with the menu shut, disabling the trigger disabled everything. Four separately-clickable
  buttons do not, and two mutations must never race on the same object. The working item carries a
  busy label (`Archiving…`), matching the `…` convention already used across the app's mutation
  buttons.

- **A row's action names its subject through `ariaLabel`, not through its visible text.** This is
  the one thing the `⋯` did better and had to be rebuilt. The trigger carried
  `aria-label="Actions for Jane Boone"`, so a screen-reader user heard the person before the verb.
  Without it, fifty rows each offer a button announced as nothing but "Remove". Items may therefore
  carry an optional `ariaLabel` (`"Remove Jane Boone"`) while their visible text stays short. Because
  the accessible name *contains* the visible label, this satisfies WCAG 2.5.3 Label in Name, so
  voice control still works on "click Remove". The three header sites need none of this: the page
  heading already says which list or occasion you are on.

- **`separatorBefore` dies.** It was used once, to fence Delete off from the rest, and that was
  always an ordering statement. Danger actions come last, with a wider gap before them.

## Consequences

Headers are taller on narrow screens — two rows of buttons where there was one glyph. That is the
price, and it is paid knowingly: the header now leads with the thing *and* its controls, where the
earlier decision led with the thing alone and hid the controls behind a character.

`ActionBar` is much smaller than `HeaderMenu` was. The outside-click effect, `aria-expanded`, the
`open` state and the focus dance all go. That last one is worth naming, because it was subtle:
`HeaderMenu` called `triggerRef.current?.focus()` *before* running an action, since choosing an item
unmounts the menu and a `ConfirmDialog` opened by that action captures whatever is focused at that
moment as the element to restore to. A visible button is already the focused element when clicked,
so the problem does not exist.

The rule this ADR establishes is `CONTEXT.md` **rule 12**, and it is rule 11's twin: rule 11 governs
when an action *asks*, rule 12 governs whether it is *seen*. Like rule 11 it is enforced by a policy
suite (`action-policy.test.tsx`) rather than by vigilance, because the failure mode is identical —
one contributor tucking a Delete back behind a glyph to keep a header clean, defensible where it
stands, wrong as a set.

Out of scope, deliberately: `GiftsTab`'s claim and purchase controls (the page's content, not
actions on its subject), `ActionableBanner` (a CTA), the admin pages, and `SharedAccountCard`. They
keep their solid-coloured buttons. This ADR governs action groups on a header or a row, and says
nothing about the rest.
