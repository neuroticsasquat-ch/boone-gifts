# ADR 0002 — Occasion and Folder: splitting what "collection" used to mean

**Status:** Accepted (2026-09-08)
**Amends:** ADR-adjacent decision in the v0.4.0 project spec (collections → occasions, NEU-1226/1229)
**Project:** [BG: Shopping Lists](https://linear.app/neuroticsasquatch/project/bg-shopping-lists-6fdd1e4a3cc1)

## Context

v0.4.0 renamed "collection" to "occasion" throughout. The word "collection" was vague, sat badly
beside "connection", and users talked about Christmas, not about collections.

This project then introduced a genuinely new concept — a family's shared gifting occasion, which a
list is shared *to*, and which a budget hangs off. Both concepts wanted the same word, and they are
not the same shape:

- One is a **user's private, curated set of lists**, many-to-many, useful for grouping anything the
  user can see including a direct share from a non-family connection.
- The other is a **family's shared occasion**, owned by the family, the unit of sharing and of
  budgeting.

Calling both "occasion" and telling them apart with a qualifier — "my occasion" versus "family
occasion" — is the same-word-two-meanings hazard the v0.4.0 rename existed to remove, only with a
prefix bolted on. Every budget screen, filter label and error message would have to carry the
qualifier or become ambiguous.

## Decision

Split the word, and give the everyday word to the everyday concept.

- **Occasion** — a family's shared gifting occasion. "Boone Family · Christmas 2026." This is what an
  ordinary person means by the word: a *time*, not a folder. It is also the one every user meets,
  since it is how a list reaches a family at all.
- **Folder** — a user's private curated set of lists. Today's `occasions` / `occasion_items`,
  renamed. Available to every user.

"Collection" is **not** restored. It was rejected on re-examination for the reason it was dropped:
it reads too close to "connection", which is a live term in this app and the very confusion that
killed the "Connect"/"Collect" tab labels.

"Folder" mildly implies one home per list, and the model is many-to-many — a list may sit in several
folders. Accepted: modern apps have blurred that enough that it does not mislead in practice, and
"Add to a folder…" is a clearer call to action than the alternatives ("Tag", "Board").

## Consequences

**Good**

- The word a user says out loud means the thing they mean by it, and it is the concept simple-mode
  users would have met first — see backend ADR 0004 (`docs/adr/0004-simple-mode-is-retired.md` in the backend repo).
- No qualifier is ever required. "Occasion" and "Folder" are unambiguous on their own in every
  label, filter and error message.

**Bad, and accepted**

- Part of a rename shipped days earlier is being redone. It is cheap *now* and will never be cheaper:
  `Occasions.tsx` and `OccasionDetail.tsx` have had no route since the nav project retired
  `/occasions` (`routes.test.tsx:48`), so the user-facing surface being renamed is currently dead
  code. The live references are the occasion picker on list detail and the filter on Lists.
- The backend migration renames `occasions` → `folders` and then creates a *new* `occasions` table
  for the family concept. The vacated name is reused, so the two steps must not land in one
  migration revision.

## Alternatives rejected

- **"Season" or "Event" for the family concept, leaving "occasion" alone** — zero churn, and both
  were rejected on the word itself. Nobody calls a birthday a season; "event" collides with calendar
  vocabulary for users and with domain events for anyone reading the code.
- **"Family occasion" / "my occasion"** — one word, two mechanics, told apart only by a qualifier the
  UI can never drop.
- **Retiring the user-curated concept entirely** — tempting, since family occasions cover its most
  common use. Rejected because a claim on a list shared directly by a non-family connection would
  then belong to nothing and could never be budgeted.
