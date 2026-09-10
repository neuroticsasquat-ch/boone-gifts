# ADR 0008 — Confirmation is one hand-rolled dialog

**Status:** Accepted (2026-09-10)
**Ticket:** [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293)
**Spec:** [`docs/specs/NEU-1293-confirmdialog-replaces-three-patterns.md`](../specs/NEU-1293-confirmdialog-replaces-three-patterns.md)

## Context

Three ways of asking "are you sure?" were in the codebase at once.

**Ten `window.confirm` calls** across seven files — `ListDetail`, `FolderDetail`, `Folders`,
`OccasionDetail`, `GiftsTab`, `AdminInvites`, `AdminUsers`. Unstyleable, unreachable from a keyboard
test without `vi.spyOn(window, "confirm")`, and visually nothing like the rest of the app.

**One inline two-step** — `FamilyDetail`'s `Delete Family`, a `confirmDelete` boolean that swaps the
button for a sentence and two more buttons in the page flow.

**Two hand-rolled `role="dialog"` modals** — `SharingPanel`'s `RevokeClaimsDialog` and
`SharedAccountCard`'s `StripLabelsDialog`. Both re-decide the backdrop, the z-index, and the panel
markup from scratch, and **neither traps focus or handles Escape at all**.

Three patterns is two too many, and the milestone that follows this one adds more confirmations
(NEU-1319's audit, NEU-1315's archive nudge, NEU-1309's `Remove` overflow menu). Whatever pattern is
in place when those land is the one the app keeps.

## Decision

**One `<ConfirmDialog>`, hand-rolled on a `role="dialog"` div, driven declaratively.**

```tsx
<ConfirmDialog
  open={confirming !== null}
  title="Delete this list?"
  body="This cannot be undone."
  actions={[{ id: "delete", label: "Delete", tone: "danger" }]}
  pending={deleteMutation.isPending}
  onResolve={(id) => { if (id) deleteMutation.mutate(); setConfirming(null); }}
/>
```

- **Hand-rolled, not native `<dialog>`.** This is the surprising half of the decision, and the reason
  is the test environment. **jsdom 30.0.1 — the version this repo runs — exposes
  `HTMLDialogElement`, but its prototype carries only `constructor` and `open`.** There is no
  `showModal`, no `show`, no `close`. A native `<dialog>` would throw in every test that opened it,
  and the workaround — patching the prototype in `src/test/setup.ts` — would mean the ticket's three
  headline acceptance criteria (trap, Escape, focus return) are asserted against a stub of our own
  writing rather than against anything real. Those three behaviours come free from the browser and
  are therefore invisible to jsdom. Owning them is what makes them testable. Verify before reversing
  this: it turns on a jsdom version, and jsdom will grow the API eventually.

- **`actions` is the ordered list of ways out; Cancel is always rendered and never listed.**
  `onResolve` receives the chosen `id`, or `null` for cancel — the Cancel button and Escape alike.
  Nine of the ten migrated sites pass exactly one action. `SharingPanel`'s revoke passes two, because
  it is not a confirmation: it offers **Release those claims** / **Keep them claimed** / **Cancel**.
  Modelling that as `confirm` + `secondary` would name two peer choices as a primary and a fallback.

- **Declarative, not a promise.** `useConfirm()` returning a promise would be the smaller diff — the
  ten `window.confirm` handlers would stay linear. But it resolves and unmounts the instant a button
  is pressed, and both existing dialogs deliberately **stay open with every button disabled** while
  their mutation is in flight (`pending`, `busy`). Revoking a share is the slowest mutation in the
  app; closing the dialog and showing nothing would be a real regression, in a ticket whose whole
  contract is that behaviour does not change.

- **The guard is `eslint(no-alert)`, not a grep test.** One line in `.oxlintrc.json`. AST-based, so
  it can't be fooled by the string in a comment, and it catches bare `confirm(…)` and `alert(…)` as
  well as `window.confirm(…)`. It fires in the editor, not only at `task test`.

- **The two existing dialogs survive as thin wrappers** rather than being inlined into their callers.
  Their doc comments carry the rationale for their wording — `CONTEXT.md` rule 2 for the revoke
  dialog, which reveals only *that* claims exist and never a count, a gift, or a claimer — and that
  rationale belongs next to the wording it explains.

## Consequences

**Good**

- The trap, Escape and focus-return are **assertable in jsdom**, because we wrote them. They were the
  acceptance criteria; now they are tests rather than a platform promise nobody can check here.
- The two hand-rolled dialogs *gain* a focus trap and Escape, which neither had.
- Confirmation is one decision made once. M4's audit changes *which* actions confirm by editing call
  sites, not by touching a dialog implementation.
- No new dependency. The repo has seven runtime dependencies and no UI-primitive library; adding one
  for a single component would be a large new upgrade surface for a small gain.

**Bad, and accepted**

- **~60 lines of focus-trap logic we own and must maintain**, including the tabbable-element query.
  This is the standard reason to reach for a library, and it is the price of the tests above.
- **No real top layer.** `fixed inset-0 z-50` is a z-index convention, not the browser's top layer,
  and nothing enforces it. Both existing dialogs already worked this way, so nothing regresses, but a
  future overlay could out-stack the dialog with no compile-time complaint.
- **Elements behind the dialog are not truly `inert`.** The trap covers Tab; it does not stop a
  screen-reader virtual cursor from reaching the page behind, which `showModal()` would.
- **Every call site now holds a small piece of "what am I confirming" state** — usually a
  discriminated union. Ten handlers that were three lines are now a handler plus state plus a
  rendered dialog.

## Alternatives rejected

- **Native `<dialog>` + `showModal()`, with the prototype patched in `src/test/setup.ts`.** Correct
  in real browsers — genuine top layer, genuine inert, Escape and trap for free. Rejected because
  jsdom 30.0.1 implements only the `open` property, so the patch would be a global prototype mutation
  in `setup.ts` that no other test needs, and the three acceptance criteria would be asserted against
  it rather than against the behaviour. Revisit when jsdom implements the API.

- **A headless library (Radix, React Aria).** Vetted accessibility, no trap to maintain. Rejected as
  the first UI-primitive dependency in a repo with seven runtime dependencies, taken on for one
  component — and the trap would still need testing to prove the criteria hold.

- **A promise-based `useConfirm()` hook.** Near drop-in for the ten `window.confirm` handlers.
  Rejected because it cannot express open-while-pending, which two existing dialogs rely on.

- **A `<Modal>` shell with `<ConfirmDialog>` built on top, and `RevokeClaimsDialog` composing the
  shell directly.** The cleanest separation on paper. Rejected because it leaves a bespoke dialog
  body in the codebase — the thing this ticket exists to remove — and because a shell primitive
  designed against one caller is a guess. If M3's sharing modal wants one, it can be extracted then,
  with two callers to shape it.

- **Migrating only the five sites the ticket names.** Would leave `window.confirm` live in
  `Folders`, `OccasionDetail`, `GiftsTab` and the two admin pages, so the lint rule would need an
  exemption list — and an exemption list is how the fourth pattern gets born.
