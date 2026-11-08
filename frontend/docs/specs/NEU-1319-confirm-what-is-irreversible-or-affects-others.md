# NEU-1319 — Confirm what is irreversible or affects somebody else

**Ticket:** [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319)
**Story:** [NEU-1314](https://linear.app/neuroticsasquatch/issue/NEU-1314) — The app confirms what matters and stops nagging about what doesn't
**Milestone:** M4 — Correctness
**Project:** BG: Occasions and Navigation ([project spec](occasions-and-navigation-project-spec.md) §7.3)
**Blocked by:** [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293) — merged
**Branch:** from `release/v0.6.0`, targets `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

NEU-1293 made every confirmation in the app one component and deliberately changed nothing about
*which* actions confirm. This ticket is that change, and only that change: no dialog implementation
is touched, no new component appears. `ConfirmDialog` is added to or removed from call sites.

The arrangement it inherits is backwards. Archiving a list — reversible, private, and reachable
again through a "View archive" link on the page you started from — stops to ask. Removing a family
member, leaving a family and revoking someone's invite all fire on the first click, and each of them
deletes shares and releases claims that a re-invite does not bring back.

**The rule: confirm where the action is irreversible *or* affects somebody else.**

Doing it as one audit rather than one ticket per site is the point. The arrangement is only wrong
*as a set* — every individual dialog looks defensible where it stands — so the set is what is
reviewed, and, per [Tests](#tests), the set is what is asserted.

## What the merged M1–M3 work already did

Three rows of the ticket's table need no code. They are recorded here because the ticket's table
describes a state of the world that is two milestones out of date, and an implementer reading it
cold would otherwise write them again:

| Row | Where it already stands |
|---|---|
| Remove a connection | **Done.** NEU-1309 put it behind the row's overflow menu with a `ConfirmDialog` titled `Remove {name}?` (`People.tsx:256`). |
| Revoke a share | **Done.** NEU-1293 migrated it; NEU-1306 moved it into `ListSharingModal.tsx:266`. Wording unchanged, as the ticket asks. |
| Archive an occasion | **Two of three sites done.** `OccasionDetail.tsx:369` (NEU-1293) and `ActionableBanner.tsx:250` (NEU-1315) both confirm. The family page's per-row Archive does not — see [§ Archive an occasion](#archive-an-occasion-family-page). |

## The audit

Every destructive action in the app, what it does today, and what it does after. The last two rows
are outside the ticket's table and are in scope: the rule is a rule, and an audit that leaves two
known-wrong sites behind is the four-tickets outcome this one exists to avoid.

| Action | Site | Today | After |
|---|---|---|---|
| Archive a list | `ListDetail.tsx` `OwnerHeader` | confirms | **no confirm** |
| Archive a folder | `FolderDetail.tsx` `FolderHeader` | confirms | **no confirm** |
| Delete a list | `ListDetail.tsx` | confirms | unchanged |
| Delete a folder | `FolderDetail.tsx`, `Folders.tsx` | confirms | unchanged |
| Delete a family | `family-detail/FamilySettingsSection.tsx:217` | confirms | unchanged |
| Remove a connection | `People.tsx:256` | confirms (NEU-1309) | unchanged |
| Revoke a share | `ListSharingModal.tsx:266` | confirms | unchanged |
| Archive an occasion (detail page) | `OccasionDetail.tsx:369` | confirms | unchanged |
| Archive an occasion (archive nudge) | `ActionableBanner.tsx:250` | confirms | unchanged |
| **Remove a family member** | `family-detail/MembersSection.tsx:95` | fires on click | **confirms** |
| **Leave a family** | `FamilyDetail.tsx:104` | fires on click | **confirms** |
| **Archive an occasion (family page)** | `family-detail/OccasionsSection.tsx:250` | fires on click | **confirms** |
| **Revoke a family invite** | `family-detail/FamilySettingsSection.tsx:172` | fires on click | **confirms** |
| **Unclaim a gift** | `list-detail/GiftsTab.tsx:719` | always confirms | **confirms only when purchased** |

Unchanged and deliberately so: `AdminInvites` and `AdminUsers` (every action irreversible and about
someone else), `SharedAccountCard`'s strip-labels dialog, `FolderDetail`'s remove-a-list-from-folder
(`:293` — reversible, private, no confirm today and none after), `BudgetLine`'s clear, and
`MyShopping`'s unpurchase. Unpurchase is worth naming as the contrast the rule turns on: `purchase_gift`
treats an absent `amount_paid` as "keep what is recorded", so unticking and re-ticking is
non-destructive by design, and it correctly asks nothing.

### Archive loses its confirm

`ListDetail.tsx` and `FolderDetail.tsx` each hold a `confirming: "archive" | "delete" | null` union,
an `ARCHIVE_ACTIONS` constant, a `handleArchiveToggle` that branches on `is_archived`, and a
`ConfirmDialog` whose title and body are ternaries over that union. After this ticket:

- `handleArchiveToggle` goes. The menu item and the button call `archiveMutation.mutate()` directly
  in both directions. The `// Only the archive direction asks; unarchiving is not destructive.`
  comment at both sites goes with it — neither direction asks now.
- `confirming` narrows to a boolean for delete, and the title/body/actions ternaries collapse.
  `ARCHIVE_ACTIONS` is deleted at both sites; `DELETE_ACTIONS` stays.
- `OccasionDetail.tsx:180–182` carries the same comment for the occasion, where it is *still true* —
  that site keeps its confirm and keeps its comment.

**Nothing is announced.** No toast. `ListHeader` takes `isArchived` and `FolderDetail` swaps its own
controls, so the page the user is looking at already says what happened; a notification for a state
change rendered on screen is the same nagging in a quieter font. Reversal is discoverable and was
verified, not assumed: `/lists` carries a "View archive" link (`Lists.tsx:383`) and `Folders` a
"View archived folders" toggle (`Folders.tsx:56`), and the archived list's own menu offers
`Unarchive`. "Reversible" is a claim about the UI, and the UI honours it.

### Remove a family member, and Leave a family

Both call `DELETE /families/{id}/members/{user_id}`. `remove_member`
(backend `app/families/service.py:119`) deletes every share that person owns into the family's
occasions, then runs `_cleanup_if_dropped` against each remaining co-member, which
**releases claims in both directions** with anyone they no longer share an access path with. A
re-invite restores the membership. It does not restore the shares, and it does not restore the
claims — and a released claim takes its `amount_paid` with it, so the person leaving loses recorded
purchases and the budget built on them.

That is the irreversible half, and it is the half the body names:

| Site | Title | Body | Action |
|---|---|---|---|
| `MembersSection` | `` `Remove ${member.name} from ${familyName}?` `` | `They'll lose sight of lists shared to this family's occasions, and any gifts claimed between you will be released. You can invite them back later.` | `Remove` / danger |
| `FamilyDetail` | `` `Leave ${f.name}?` `` | `You'll lose sight of lists shared to this family's occasions, and any gifts you've claimed here will be released along with anything you recorded paying. You can be invited back later.` | `Leave` / danger |

- **Naming is the guard**, following NEU-1309's reasoning at `People.tsx:248` verbatim: "Remove this
  member?" means nothing on a roster reached by a mis-tap. `MembersSection` names the family as well
  as the member because an organizer of several families arrives at all of them through the same
  shape of page.
- **The claim sentence is conditional and bare** — no count, no gift, no claimer, and it does not
  assert that any claim exists. `CONTEXT.md` rule 2 permits the revoke dialog to say considerably
  more than this (`Members of {family} have claimed gifts on this list`), so this sits well inside it.
- `MembersSection` needs `familyName`, which it does not currently take. `FamilyDetail` already holds
  it and passes `familyName` to `OccasionsSection` and `FamilySettingsSection`; add the same prop.
  It still does not query.

**Where the last-organizer 409 goes.** Both sites 409 with "Cannot remove the last organizer", and
both already render it as a line in their own zone — `actionError` in `MembersSection`, `leaveError`
under the button in `FamilyDetail`. Both keep it there.

- `pending` holds the dialog open while the mutation is in flight, as every other site does.
- On **both** outcomes the dialog closes. This deviates from NEU-1309's "still standing and
  re-armed" (`People.tsx:253`) and the deviation is deliberate: a connection removal that failed can
  be retried, and this one cannot. The fix is to promote another organizer in the Members section
  further up the same page, which a modal covers. Re-arming a button that cannot succeed until
  something changes behind the dialog buys a second identical failure.

### Archive an occasion (family page)

`OccasionsSection.tsx:250` is the one archive site the earlier tickets did not reach. It gains a
`ConfirmDialog`, and because it is a per-row action the state holds the occasion rather than a
boolean — the shape `Folders.tsx:17` and `ActionableBanner.tsx:43` already use.

- **Title:** `` `Archive ${occasion.name}?` `` — a bare "this occasion?" says nothing on a section
  listing every active occasion in the family.
- **Body:** the existing sentence, `Lists already shared to it stay shared.`
- That sentence is currently a literal in `OccasionDetail.tsx:372` and will now be needed twice.
  **Export it once** as `ARCHIVE_OCCASION_BODY` and have both sites import it; one sentence stating
  what archiving does to existing shares must not be able to drift into two answers.
- `OccasionDetail` keeps its `Archive this occasion?` title. Its page names the occasion in the
  heading above the dialog, so the title has nothing to disambiguate.
- `ActionableBanner` is **not** touched. Its body is written for the nudge's context — it argues the
  case for archiving something that has gone quiet — and is not the same sentence doing the same job.
- The existing `toast.success("Occasion archived.")` **stays**: the row disappears from the section
  on success, so unlike the list and folder cases there is no page state left saying what happened.

### Revoke a family invite

`FamilySettingsSection.tsx:172` fires on click while `AdminInvites` confirms the identical action.
The invite row already renders `invite.email`, so it names it:

- **Title:** `` `Revoke the invite to ${invite.email}?` ``
- **Body:** `Their invite link will stop working. You can send a new one.`
- **Action:** `Revoke` / danger
- Per-row, so the state holds the invite id — the `revokingId` shape `AdminInvites.tsx:23` uses.

### Unclaim a gift

Unclaim looks like the archive case and is not. `unclaim_gift`
(backend `app/gifts/service.py:96`) says it plainly: *"The row goes, so the purchase and the amount
paid go with it — there is no purchase state left over to reset."* So "Never mind" on a plain claim
is one click from undone and invisible to everybody, exactly the case the rule frees; "Never mind"
on a gift already marked bought at £45 destroys that record and moves the claimer's budget, with no
way back.

The row can tell the two apart — `Gift` carries `purchased_at` and `amount_paid`, both flattened
from the viewer's own claim — so it does:

- **`purchased_at === null`** → no dialog. `unclaimMutation.mutate()` on click, like archive.
- **`purchased_at !== null`** → the dialog, with the loss named:
  - **Title:** the existing `Are you sure you no longer want to get this gift?`
  - **Body, with an amount:** `` `You marked this bought. That, and the ${formatMoney(amount_paid)} you recorded, will be forgotten.` `` — `formatMoney` is the one place money is formatted (ADR 0003), so it is used here rather than interpolating the raw string.
  - **Body, without one:** `You marked this bought. That will be forgotten.` — a skipped amount is a
    first-class answer, not a missing value, so the sentence does not imply a figure exists.
  - `UNCLAIM_ACTIONS` and its `Never mind` label are unchanged, along with the comment at `:579`
    explaining the wording.

## `CONTEXT.md` rule 11

The policy outlives the ticket, and nothing currently records it — `CONTEXT.md` has ten rules and
none is about confirmation, while ADR 0008 is about how the dialog works, not when to raise one.
NEU-1293's lesson was that an unguarded decision rots. Add rule 11, in the voice of the existing ten:

> **A confirmation is for what cannot be undone, or what lands on somebody else.** Archiving is
> neither: it is reversible from a link on the page it was started from, and nobody else can tell. So
> it does not ask, and neither does anything else that only rearranges the viewer's own view of their
> own things. Removing a member, leaving a family, removing a connection and revoking a share all do
> ask, because each deletes shares and releases claims that re-inviting does not bring back — and the
> body says so, conditionally and without a count, a gift or a claimer, which is rule 2's limit and
> not a lower one. Unclaiming asks only when there is a recorded purchase to lose; unticking a
> purchase never does, because the amount survives it. The dialog itself is settled and is not the
> subject of this rule — see ADR 0008.

No new ADR, and no amendment to ADR 0008: it already anticipated this ticket ("M4's audit changes
*which* actions confirm by editing call sites, not by touching a dialog implementation") and that
sentence is still accurate.

## Tests

**Per site, in the suite that already covers it.** `ListDetail`, `FolderDetail`, `MembersSection`,
`FamilyDetail`, `OccasionsSection`, `FamilySettingsSection` and `GiftsTab` each assert their own
change, using the conventions already in those files — `findByRole("dialog")`, `within(dialog)`,
MSW at the network boundary, and the shared `family-detail/harness.tsx` fixtures for the four family
suites. At minimum:

- Archiving a list and a folder issues the `PATCH` with **no dialog rendered at any point**.
- Unarchiving still asks nothing (unchanged, but it is now the same code path).
- Remove-member and Leave each raise a named dialog; cancelling issues no request; confirming issues
  it; a 409 **closes the dialog** and leaves the message in the zone's own error line.
- The family-page Archive raises `Archive {name}?` naming the right row when several are listed.
- Revoke-invite raises a dialog naming the right email when several invites are listed.
- Unclaim raises no dialog for an unpurchased claim, and raises one naming the amount for a purchased
  one — and one case with `purchased_at` set and `amount_paid` null, which is the sentence that has
  to avoid implying a figure.

**Plus one audit suite** — `src/components/confirmation-policy.test.tsx`, after the precedent of
`ListAttribution.consistency.test.tsx`. It walks the set in one file: the actions that must *not*
raise a dialog, and the actions that must. Its doc comment states the rule and why the set is tested
as a set, so the next person to helpfully re-add archive's confirmation breaks a test that says why
in English. Per-site suites prove each site behaves; this one proves the arrangement.

## Acceptance criteria

1. Archiving a list or a folder completes in one click, with no dialog and no toast, and unarchiving
   is still silent.
2. Deleting a list, folder or family still confirms, with its wording unchanged.
3. Removing a family member, leaving a family, archiving an occasion from the family page and
   revoking a family invite each raise a `ConfirmDialog` that **names what it is acting on**, and
   cancelling each one issues no request.
4. Remove-member's and Leave's bodies say that claims between the parties will be released, without
   a count, a gift, a claimer, or any assertion that a claim exists.
5. A last-organizer 409 from either site closes the dialog and appears in that zone's existing error
   line, with the Members section visible behind it.
6. Unclaiming an unpurchased gift is one click; unclaiming a purchased one asks and names what is
   lost, including the recorded amount when there is one.
7. `CONTEXT.md` carries rule 11.
8. `confirmation-policy.test.tsx` asserts the whole set, and fails if any site's answer flips.
9. `task test`, `task lint` and `task typecheck` pass. No `window.confirm` appears anywhere — the
   `no-alert` rule from NEU-1293 stays untouched.

## Out of scope

- **Any change to `ConfirmDialog` or `Modal`.** ADR 0008 and its NEU-1306 amendment are settled. If
  a site seems to need a new prop, that is a signal the call site is wrong, not the component.
- **Backfilling the claim sentence into `People.tsx`'s connection-remove body.** It triggers the same
  `_cleanup_if_dropped` and its body is silent on it, so the three bodies will not read alike. Left
  alone deliberately: it shipped in NEU-1309 three tickets ago, editing it widens a diff whose value
  is being reviewable as one table, and the gap is a wording improvement rather than a wrong answer
  about whether to confirm. Worth its own ticket.
- **Unifying `ActionableBanner`'s archive body** with the other two occasion sites, for the reason
  given above — it is a different sentence doing a different job.
- **Admin pages.** Already correct under the rule; no change.
- **Disabling `Leave Family` when the viewer is the sole organizer of a family with other members.**
  The information is on the page and the courtesy would be real, but `CONTEXT.md` rule 1 makes the
  409 the gate either way, and this ticket changes which actions confirm — not which render.
- **Toast-with-undo** as a replacement for archive's dialog. `react-hot-toast` actions are a pattern
  the repo uses nowhere; introducing one for a case that already has a "View archive" link is a new
  surface for no gain.
