# ADR 0011 — A disclosure carries a chevron, and does not dress as a button

**Status:** Accepted (2026-09-12)
**Ticket:** [NEU-1324](https://linear.app/neuroticsasquatch/issue/NEU-1324)
**Spec:** [`docs/specs/NEU-1324-a-row-names-its-person-and-the-disclosure-shows-it-opens.md`](../specs/NEU-1324-a-row-names-its-person-and-the-disclosure-shows-it-opens.md)
**Amends:** [ADR 0010 — A header may collapse its actions on a phone](0010-a-header-may-collapse-its-actions-on-a-phone.md),
and narrows one sentence of [ADR 0009 — Actions on a thing are visible](0009-actions-are-visible.md)

## Context

ADR 0010 shipped a disclosure and said what its trigger must be:

> **The disclosure is a word, not a glyph.** This is the part of ADR 0009 that survives untouched and
> is in fact its most important finding: the complaint that opened NEU-1322 was never "a menu
> exists", it was that `⋯` *"does not read as a menu"*.

That was right about the word and silent about everything else, and NEU-1323 then made the silence
explicit — constraint 4: *"No new colours and no new tone. The disclosure trigger uses the existing
`neutral` classes from `tone.ts`."*

The result is a trigger rendered in **byte-for-byte the treatment of the five buttons it hides**.
Same border, same fill, same padding, same size. On a phone the owner's list header is a single
control that looks exactly like an action on the list — so the one thing on screen that behaves
differently from everything around it is the one thing indistinguishable from it. And nothing about
it says it opens: the only statement that it expands is `aria-expanded`, which a sighted pointer user
never encounters.

So ADR 0009's finding was **half** a finding. "`⋯` does not read as a menu" is true, and the
conclusion drawn from it — *use a word* — is necessary but not sufficient. A bare word does not read
as a menu either; it reads as a button. What was missing from `⋯` was never only the noun. It was the
noun **and** the affordance, and NEU-1322 could only see the noun missing because the glyph it was
complaining about happened to be a bad one.

## Decision

**A disclosure trigger is a word *and* a chevron, and wears neither the border nor the fill of the
controls it reveals.**

```tsx
<button type="button" aria-expanded={open}>
  Actions <span aria-hidden="true">⌄</span>
</button>
```

- **The word is not negotiable, and ADR 0009 is not repealed.** `Actions` stays. This ADR adds an
  affordance beside the label; it never trades the label for one. A trigger whose whole content is a
  glyph remains forbidden, and `expectNoGlyphControls()` remains the thing that forbids it —
  **unmodified**, which is the test that this change stayed on the right side of the line.

- **The chevron is decoration, and says so.** It is `aria-hidden`, because `aria-expanded` already
  carries the state to assistive technology and a screen reader must not hear the same fact twice.
  It is for the eye, which has no other way to learn that the control opens.

- **The trigger does not dress as an action.** No border, no filled background. This is what reverses
  NEU-1323's constraint 4, and the reasoning behind that constraint is what makes the reversal safe:
  it was written to stop a *new tone* entering `tone.ts`'s vocabulary, and this does the opposite —
  it takes the trigger **out** of that vocabulary. `tone.ts` is "how loud an **action** is", and a
  disclosure is not an action on the list. It acts on the bar. The treatment therefore lives in
  `ActionBar.tsx` and no `Tone` is added.

- **Behaviour is untouched.** The two call sites that opt in, the six that do not, rows never
  collapsing, the panel expanding in place, and the panel staying open when an action inside it is
  triggered — all of ADR 0010's decisions stand. This ADR changes what the trigger *looks like* and
  nothing about what it *does*.

## Consequences

**Good**

- The control that opens the bar is now distinguishable from the controls inside it, which on a phone
  is the difference between one visual group and six peers.
- The affordance is visible rather than only announced. `aria-expanded` was doing work no sighted
  user could see.
- ADR 0009's rule comes out **stronger and more honest**: "a word, not a glyph" was a proxy for "say
  what it holds *and* say that it opens", and the rule now states both halves instead of one.

**Bad, and accepted**

- **Three ADRs now describe one control**, and a contributor must read 0009 → 0010 → 0011 in order to
  know what the trigger is. That is the cost of amending rather than rewriting, and it is the cost
  this repo has already chosen twice.
- **A written constraint is reversed six weeks after it was written**, by the ticket immediately
  following the one that wrote it. Constraint 4 was a reasonable instinct — do not grow a second
  vocabulary — applied to the wrong object.
- **"Not a glyph" is now a rule with an inside and an outside** rather than a flat prohibition, and
  flat prohibitions are easier to hold. The guard is that `expectNoGlyphControls()` still asserts the
  flat version over every control in the app, and this trigger passes it on the merits.

## Alternatives rejected

- **A lighter treatment with no chevron.** Restyle the trigger so it stops looking like a button, but
  keep the bare word. Needs no ADR at all, since it contradicts nothing written. Rejected because it
  fixes only half the complaint: the control would stop *looking* like the buttons without ever
  saying it opens, leaving the affordance in `aria-expanded` where the eye cannot reach it.
- **A chevron with no word.** The smallest header footprint, and the honest reading of "the glyph was
  fine, `⋯` was just the wrong glyph". Rejected because it is a straight repeal of ADR 0009 and
  rebuilds NEU-1322's original complaint in a new costume — and it would require weakening
  `expectNoGlyphControls()`, which is exactly the assertion standing between this app and the
  overflow menu growing back.
- **A `disclosure` entry in `tone.ts`.** Keeps every treatment in one file. Rejected because that map
  is a vocabulary about how loud an *action* is, shared deliberately with `ConfirmDialog` so a
  `danger` button and the `danger` action that opened it describe themselves with one word. Chrome
  does not belong in it, and `Record<Tone, string>` would have to stop being total over a vocabulary
  the dialog owns.
- **A count in the label — "5 actions ⌄".** More informative, and genuinely useful on a bar whose
  contents vary by permission. Rejected as scope: it makes the label a function of the items, which
  is a behaviour change inside a treatment-only ticket, and the number is not what anyone was
  missing.
