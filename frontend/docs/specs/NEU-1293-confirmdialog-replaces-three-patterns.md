# NEU-1293 — `ConfirmDialog` replaces the three current patterns

**Ticket:** [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293)
**Story:** [NEU-1288](https://linear.app/neuroticsasquatch/issue/NEU-1288) — Confirmations look and behave the same everywhere
**Milestone:** M1 — Contract
**Project:** BG: Occasions and Navigation ([project spec](occasions-and-navigation-project-spec.md) §7.3)
**Branch:** from `release/v0.6.0`, targets `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

Three confirmation patterns are in use. `window.confirm` is unstyleable, untestable without a spy,
and looks like nothing else in the app; the inline two-step and the two hand-rolled `role="dialog"`
modals each re-decide focus, escape and layout from scratch. This ticket delivers **one
`<ConfirmDialog>`** and migrates every call site to it.

**Behaviour-preserving.** Every action that confirms today still confirms, with the same message.
*Which* actions should confirm is decided in [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319)
(M4's audit), not here — that change wants to land as one reviewable audit rather than scattered
through a refactor. Do not remove archive's confirm and do not add one to remove-connection,
remove-member or leave-family in this ticket, however tempting it is while the file is open.

This ticket blocks NEU-1319, NEU-1315 (archive nudge, which confirms through this component) and
NEU-1309 (People's `Remove` overflow menu).

## The component

`src/components/ConfirmDialog.tsx`, with `src/components/ConfirmDialog.test.tsx` alongside.

```tsx
type ConfirmAction = {
  id: string;
  label: string;
  tone: "danger" | "primary" | "neutral";
};

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  actions: ConfirmAction[];
  pending?: boolean;
  onResolve: (id: string | null) => void;
}): React.ReactNode;
```

### Decisions

- **`actions` is the ordered list of ways out; `Cancel` is always rendered and never listed.**
  Every site but one passes a single action. `SharingPanel`'s revoke passes two, because it is a
  three-way choice rather than a confirmation, and an `actions` array models that honestly where a
  `confirm`/`secondary` pair would misname two peers as primary and fallback. `onResolve` receives
  the chosen action's `id`, or **`null` for cancel** — Cancel button, Escape, or the dialog being
  dismissed any other way.

- **Declarative, not a promise.** Call sites hold their own "what am I confirming" state and pass
  `pending`. A promise-based `confirm()` would be a smaller diff at the ten `window.confirm` sites,
  but it resolves and unmounts on click, which would lose the **open-while-pending** behaviour both
  existing dialogs have today (`RevokeClaimsDialog`'s `pending`, `StripLabelsDialog`'s `busy`) —
  a behaviour change in a behaviour-preserving ticket, on the slowest mutation in the app.
  `pending` disables **every** button including Cancel, as both existing dialogs already do.

- **Hand-rolled shell, not native `<dialog>`.** See [ADR 0008](../adr/0008-confirmation-is-one-dialog.md).
  A fixed-position backdrop wrapping a `role="dialog" aria-modal="true" aria-labelledby=…` panel —
  the shape `RevokeClaimsDialog` and `StripLabelsDialog` already use. Own handlers for Escape and
  Tab/Shift-Tab cycling; own focus-return via a ref capturing `document.activeElement` on open.

- **`body` is `React.ReactNode`, and optional.** `SharedAccountCard` composes its body from
  `listCount(...)` and `joinNames(...)`; `AdminUsers` interpolates a user's name. Single-sentence
  confirms pass no body and no paragraph is rendered.

- **Rendered inline, not through a portal** — `fixed inset-0 z-50`, as both existing dialogs do.
  No new stacking context to reason about, and nothing in the app currently portals.

- **Backdrop click does nothing.** Escape cancels; clicking the backdrop does not. Neither existing
  dialog has a backdrop handler, and this ticket preserves behaviour.

- **Verb labels, `danger` tone for destructive actions.** `window.confirm`'s unstyleable OK/Cancel
  is replaced by a labelled button — "Delete", "Archive", "Revoke" — in red (`bg-red-600`), matching
  the red triggers the repo already uses for exactly these actions (`FamilyDetail`'s
  `Confirm Delete`, `FolderDetail`'s archive toggle, `People`'s `Remove`). "Same wording" in the
  ticket governs the **message**; the buttons had no wording to preserve. The two existing dialogs
  pass `primary`/`neutral` and stay pixel-identical.

- **Message mapping: split at the question mark.** The interrogative becomes `title` (announced via
  `aria-labelledby`), the remainder becomes `body`. Every word of every existing message survives.

## Call sites

All ten `window.confirm` calls migrate, plus the inline two-step and both hand-rolled dialogs.
The admin pages are outside the project spec's scope but are included here, because NEU-1288's
acceptance criterion is that **no `window.confirm` survives anywhere** — a guard carrying an
exemption list would rot.

| File | Action | Title | Body | Action label / tone |
|---|---|---|---|---|
| `ListDetail.tsx:164` | archive | `Archive this list?` | — | `Archive` / danger |
| `ListDetail.tsx:170` | delete | `Delete this list?` | `This cannot be undone.` | `Delete` / danger |
| `FolderDetail.tsx:133` | delete | `Delete this folder?` | `This cannot be undone.` | `Delete` / danger |
| `FolderDetail.tsx:141` | archive | `Archive this folder?` | — | `Archive` / danger |
| `Folders.tsx:29` | delete | `Delete this folder?` | — | `Delete` / danger |
| `OccasionDetail.tsx:186` | archive | `Archive this occasion?` | `Lists already shared to it stay shared.` | `Archive` / danger |
| `list-detail/GiftsTab.tsx:623` | unclaim | `Are you sure you no longer want to get this gift?` | — | `Never mind` / danger |
| `AdminInvites.tsx:32` | revoke invite | `Revoke this invite?` | — | `Revoke` / danger |
| `AdminUsers.tsx:35` | toggle active | `` `${action} this user?` `` | — | `` `${action}` `` / danger |
| `AdminUsers.tsx:41` | delete user | `` `Permanently delete ${name} and all their data?` `` | `This cannot be undone.` | `Delete` / danger |
| `FamilyDetail.tsx:331–355` | delete family | `Delete Family?` | `This cannot be undone.` | `Delete Family` / danger |
| `SharingPanel.tsx:501` | revoke a share | `Some gifts are claimed` | *(unchanged, see below)* | two actions, see below |
| `account/SharedAccountCard.tsx:341` | strip labels | *(unchanged, dynamic)* | *(unchanged, dynamic)* | `primary` |

### Notes on individual sites

- **Unarchiving asks nothing**, at all three archive sites. Only the archive direction confirms.
  `OccasionDetail.tsx:180–182` carries a comment saying so — keep it.
- **`FamilyDetail`'s two-step**: `confirmDelete` state and the inline "Are you sure? This cannot be
  undone." branch are deleted. The `Delete Family` trigger button stays and now opens the dialog.
  The message becomes title + body per the split rule.
- **`Folders.tsx` and `GiftsTab.tsx` confirm against a specific row**, so their state holds the id /
  gift rather than a boolean. In `GiftsTab` the state belongs in the row component that owns the
  button.
- **`AdminUsers` reuses one dialog for both actions** — hold a discriminated union
  (`{ kind: "toggle", … } | { kind: "delete", … } | null`), not two booleans.

### `RevokeClaimsDialog` — wording is load-bearing

`SharingPanel`'s revoke dialog **keeps its current wording exactly**, because `CONTEXT.md` rule 2
makes it so: it reveals only *that* claims exist — never a count, a gift name, or a claimer name.

```
title:   "Some gifts are claimed"
body:    "Members of {familyName} have claimed gifts on this list. If you stop
          sharing, what should happen to those claims?"
actions: [ { id: "release", label: "Release those claims", tone: "primary" },
           { id: "keep",    label: "Keep them claimed",    tone: "neutral" } ]
```

`RevokeClaimsDialog` and `StripLabelsDialog` **survive as thin wrappers** that render
`<ConfirmDialog>`, rather than being inlined into their callers. Their doc comments carry the
rationale for the wording — rule 2 for the first, "what happens to the lists that carry a label this
change removes" for the second — and that rationale should stay attached to the wording it explains.

## The guard

Add `"no-alert": "error"` to `.oxlintrc.json`. Verified against oxlint 1.82: `eslint(no-alert)`
catches both `window.confirm("x")` and bare `confirm("y")`, and bans `alert` and `prompt` too. This
is NEU-1288's "grep-level assertion", but AST-based — it can't be fooled by the string appearing in
a comment — and it fires in the editor as well as in `task lint`.

## Tests

**New — `ConfirmDialog.test.tsx`:**

- Tab and Shift-Tab cycle within the dialog and do not reach the document behind it.
- Escape resolves `null`.
- Focus returns to the triggering element when the dialog closes.
- Actions render in array order; choosing one resolves its `id`; Cancel resolves `null`.
- `pending` disables every button, Cancel included.
- No `body` renders no paragraph.

**Rewritten** — these stub `window.confirm` and will otherwise fail once the stub is never called:
`ListDetail.test.tsx:548,568`, `OccasionDetail.test.tsx:255,272`. They drive the real dialog instead.

**Kept green with no behaviour change:** `FamilyDetail.test.tsx`, `SharingPanel.test.tsx`,
`SharedAccountCard.test.tsx`, `Folders.test.tsx`, `People.test.tsx`.

No new test files for `AdminInvites` / `AdminUsers` — the lint rule is what guards those, and giving
two untested pages their first coverage is not this refactor's job.

## Out of scope / deferred

- **The confirm audit** — archive losing its confirm, remove-connection / remove-member /
  leave-family gaining one. That is NEU-1319 in M4, per project spec §7.3. Spec §13's line
  *"`ConfirmDialog`: archive no longer prompts; remove-connection, remove-member and leave-family
  do"* describes M4's end state, **not this ticket's**.
- **Rewriting any confirmation's copy.** `"Are you sure you no longer want to get this gift?"` is
  weak; it survives verbatim. Wording changes belong with the audit.
- **`SharingPanel` becoming a modal** — M3, per that milestone's shared contracts.
- **The archive nudge's confirm** — NEU-1315 consumes this component; it does not change it.
- **First test coverage for the admin pages.**
- **A general-purpose `<Modal>` primitive.** If M3's sharing modal wants one, it can extract the
  shell then, with two callers to shape it. Not speculatively, with one.

## Acceptance criteria

1. One `<ConfirmDialog>` component; every confirmation in the app goes through it.
2. Focus is trapped while open, Escape cancels, and focus returns to the trigger on close — each
   asserted in tests, not assumed from the platform.
3. `task lint` fails on any `alert`, `confirm` or `prompt`; no `window.confirm` remains in `src/`.
4. No `role="dialog"` element outside `ConfirmDialog.tsx` (the two wrappers render it, not hand-roll it).
5. Every action that confirms today still confirms, with the same message; no action gains or loses
   a confirmation.
6. The revoke-a-share dialog names no gift, claimer, or count (`CONTEXT.md` rule 2).
7. `task test` and `task lint` pass.

## Related documents

- [ADR 0008 — Confirmation is one hand-rolled dialog](../adr/0008-confirmation-is-one-dialog.md) *(written by this ticket)*
- [`CONTEXT.md`](../../CONTEXT.md) rule 2 — unchanged; a confirmation dialog is a mechanism, not a
  domain term, so the glossary gains no row.
