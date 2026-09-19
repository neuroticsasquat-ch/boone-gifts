# ADR 0010 — A header may collapse its actions on a phone

**Status:** Accepted (2026-09-12)
**Ticket:** [NEU-1323](https://linear.app/neuroticsasquatch/issue/NEU-1323)
**Spec:** [`docs/specs/NEU-1323-a-linked-eyebrow-and-collapsible-headers.md`](../specs/NEU-1323-a-linked-eyebrow-and-collapsible-headers.md)
**Amends:** [ADR 0009 — Actions on a thing are visible](0009-actions-are-visible.md)
**Amended by:** [ADR 0011](0011-a-disclosure-carries-a-chevron.md) — the trigger's *treatment*.
Every behavioural decision below still stands.

## Context

ADR 0009 was accepted the same day this one was, and its decision sentence admits no width:

> Every action on the thing a page header or a list row is about is a visible control. Nothing that
> acts on it is reached by first revealing it.

It also wrote down the price it was paying, and named the screen it was paying it on:

> Headers are taller on narrow screens — two rows of buttons where there was one glyph. That is the
> price, and it is paid knowingly.

That price turned out to be higher than the estimate, because it is not paid alone. NEU-1321 landed
on the same day and put the family name into the occasion page's `<h1>`. `OccasionHeader` is also the
one page header in the app that never stacked — it uses `flex items-start justify-between`, where
`ListHeader` has always used `flex flex-col gap-3 md:flex-row`. At a 375px viewport those three facts
compound: the heading column is left roughly **128px** beside Rename and Archive, and `Christmas 2026`
alone wraps to two lines at `text-2xl` before the family qualifier is considered at all.

So the complaint that opened NEU-1323 was not "I dislike seeing the buttons". It was that a header
carrying a heading *and* a group of actions has, on a phone, no width for either.

## Decision

**A header carrying a *group* of actions may collapse them behind a labelled disclosure below `md`.
It is opt-in per call site, and it is granted to two.**

```tsx
<ActionBar collapseOnMobile items={[...]} />   // occasion header, list owner header
<ActionBar items={[...]} />                    // everything else, unchanged
```

- **Opt-in, never the default.** The prop is absent at six of the eight call sites and their
  behaviour is byte-for-byte what ADR 0009 shipped. This ADR narrows that ADR; it does not retire it.

- **A *group*, which is the whole limiting principle.** `ListDetail`'s viewer header holds
  `Add to a folder…` and nothing else — one of the two single-item menus ADR 0009 was filed against,
  by name. Collapsing it would rebuild the exact fault, so it does not get the prop, and neither does
  `FolderDetail`, whose three buttons are the pattern ADR 0009 held up as the one the others should
  match. A header with one action has nothing to group.

- **A row never collapses, at any width.** Rows are where the single-item menu did its worst damage
  (`People`'s lone `Remove`), and a row has no heading competing for the width in the first place.

- **The disclosure is a word, not a glyph.** This is the part of ADR 0009 that survives untouched and
  is in fact its most important finding: the complaint that opened NEU-1322 was never "a menu exists",
  it was that `⋯` *"does not read as a menu"*. The trigger says `Actions`, carries `aria-expanded`,
  and expands **in place** — it is a disclosure, not a floating menu, so `HeaderMenu`'s outside-click
  effect and its focus-restore dance stay deleted.

- **Driven in JavaScript, not in CSS.** Two copies of the bar behind `hidden`/`md:flex` would put
  every action name in the DOM twice, which breaks `action-policy.test.tsx`'s `getByRole` uniqueness
  query and doubles the accessibility tree. A `useMediaQuery` hook renders one set. The consequence
  is that `src/test/setup.ts`'s `matchMedia` stub — which answered `matches: false` to every query,
  so the whole suite would have rendered the collapsed arm — now answers `true` for
  `(min-width: 768px)`, making the desktop arm the suite's default and the mobile arm a deliberate
  per-test override.

## Consequences

**Good**

- The occasion page's heading gets the full width of its card on a phone, which is what NEU-1323 was
  filed for. The list owner's header stops spending two rows on five buttons above the fold.
- Both arms are now *asserted*, where ADR 0009's guarantee was only ever checked at jsdom's single
  width. `action-policy.test.tsx` gains a mobile case per collapsing header: the actions are behind a
  disclosure, the disclosure is not a glyph, and one interaction reaches every one of them.

**Bad, and accepted**

- **An owner on a phone needs one more tap to reach any action on a list**, including sharing, which
  NEU-1323 also moves into this bar from `SharingSummary`'s own `Change` control. That is two changes
  pushing the same way on the same surface, and it is the cost of the header fitting.
- **The rule is no longer stateable in one sentence.** ADR 0009's strength was that it had no
  exceptions; rule 12 now has one, and one exception is where a rule starts to erode. The guard is
  that the exception is *mechanical* rather than tasteful — a call site either passes the prop or it
  does not, the policy suite asserts both arms at both of the two sites that pass it, and a seventh
  site quietly adopting it fails that file.
- **A contributor reading ADR 0009 alone now gets the wrong answer**, one day after it was written.
  The header there is what carries the correction; nothing in the file was rewritten.

## Alternatives rejected

- **Fix the width without touching the actions.** Stack `OccasionHeader` under `md` the way
  `ListHeader` already does, and shrink the family qualifier to `text-sm` — which NEU-1321's own
  acceptance criterion 6 asked for ("visually subordinate") and which the shipped code did not do:
  the span inherits `text-2xl`, carrying only colour and weight. This genuinely recovers most of the
  occasion page's width and was the cheaper answer. It was rejected because it leaves the list
  owner's header — five actions after sharing moves in — spending two rows above the fold, and
  because a qualifier that is honestly smaller stops belonging on the same line as a 24px heading
  anyway.
- **Collapse every `ActionBar`.** One rule, no call-site flag, nothing to remember. It puts a lone
  `Remove` behind a reveal on `People` and `MembersSection` rows, which is not an amendment to
  ADR 0009 but a repeal of it.
- **A horizontal scroll strip instead of a disclosure.** Already rejected by ADR 0009 for the reason
  that still holds: it pushes actions past the visible edge with only a faint cue they exist.
- **Keep the buttons and shrink them below `md`.** Five actions at any legible size still wrap on a
  375px screen, and the smallest of them starts failing the 44px touch target.
