/**
 * How a list is attributed in the UI — the single place the "from"/"for" rules
 * live, so the display sites cannot drift apart (NEU-1216 §2.5).
 *
 * A list names who it is *for* (`recipient_name`) separately from the account
 * that owns it. Since NEU-1241 a recipient means exactly one thing: a person
 * with no account, whose list someone else keeps (project spec §5.4).
 */

import type { SharedVia } from "../types";

/** The fields of a list this module reads. Structural, so every list shape fits. */
export interface ListLike {
  owner_name: string;
  // Optional, not because the API omits it, but because a response cached from
  // before this column existed does.
  recipient_name?: string | null;
  /** The account person this list is marked for, on a shared account (NEU-1237).
   * Read only by the owner-side `recipientLabel`: an account person is a label
   * *inside* the account, and to everyone else the account is one identity
   * (project spec §5.1), so no viewer-side line names them. */
  account_person_name?: string | null;
  /** How a shared list reached the viewer (NEU-1227). Absent on an owned list,
   * and on the detail responses, which do not carry it. */
  shared_via?: SharedVia | null;
}

export type ListAttribution =
  /** No recipient: the person the list came from — the sharing user when the
   *  list carries one, else its owner. "from {subject}" */
  | { kind: "owner"; subject: string; keeper: null }
  /** Reached the viewer through an occasion of a family they belong to. The row
   *  names the **family**, not the occasion: the occasion is how the share was
   *  made, the family is who the viewer recognises (project spec §9.1). A group
   *  is a source, not a person, so it reads as a bare label: "{subject}" */
  | { kind: "family"; subject: string; keeper: null }
  /** A recipient with no account, whose list someone else keeps.
   *  "for {subject} · kept by {keeper}" */
  | { kind: "absent"; subject: string; keeper: string };

/**
 * How a *viewer* sees this list. `kind` selects the preposition and tells the
 * caller which half to link: `subject` for "owner", `keeper` for "absent" —
 * linking the absent recipient's name to the keeper's profile would simply be
 * wrong. "family" names a group, so it has no profile to link at all.
 *
 * Who the list is *for* still comes first: a recipient outranks `shared_via`,
 * which replaces only the line that used to name the owner and nothing else
 * (NEU-1235). So a list kept for Beth reads "for Beth · kept by Tom" however it
 * reached the viewer.
 */
export function attributionFor(list: ListLike): ListAttribution {
  const recipient = recipientNameOf(list);
  if (recipient !== null) {
    return { kind: "absent", subject: recipient, keeper: list.owner_name };
  }
  // A share points at an occasion (project spec §5.1), and it is the family
  // behind that occasion the row is labelled with — the occasion arm always
  // carries one.
  if (list.shared_via?.kind === "occasion") {
    return { kind: "family", subject: list.shared_via.family.name, keeper: null };
  }
  // A direct share names the account that shared it, which *is* this list's owner
  // — `shared_via` is simply the authoritative statement of it. The owner's own
  // name stands in on a list that carries no source at all.
  return { kind: "owner", subject: list.shared_via?.name ?? list.owner_name, keeper: null };
}

/**
 * How the *owner* sees their own row: "for Beth" for a recipient, "for Gran" for
 * one of their own account's people, or null on a list marked for neither — a
 * household list, or any list on a non-shared account, where today's UI shows no
 * attribution at all.
 *
 * The two names are mutually exclusive on the API, so the order below only
 * settles what a response that broke that rule would read as.
 */
export function recipientLabel(list: ListLike): string | null {
  const name = recipientNameOf(list) ?? accountPersonNameOf(list);
  return name === null ? null : `for ${name}`;
}

/** The account person's name, or null when the list is for no one in particular.
 *  Same empty-string collapse as `recipientNameOf`, for the same reason. */
export function accountPersonNameOf(list: ListLike): string | null {
  const name = list.account_person_name?.trim();
  return name ? name : null;
}

/**
 * Whether this list is kept on behalf of someone who has no account and will
 * never log in — the only state in which the keeper's warning applies. Mirrors
 * `GiftList.kept_for_absent_person` on the backend, which is likewise now just
 * "has a recipient name" (NEU-1230).
 */
export function isKeptForAbsentPerson(list: ListLike): boolean {
  return recipientNameOf(list) !== null;
}

/**
 * The recipient's name, or null when there isn't one. Collapses the shapes a
 * caller can actually hold: a response predating this column omits the field
 * entirely, and an empty name is no name (the backend normalizes it to NULL).
 */
export function recipientNameOf(list: ListLike): string | null {
  const name = list.recipient_name?.trim();
  return name ? name : null;
}
