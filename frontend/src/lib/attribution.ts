/**
 * How a list is attributed in the UI — the single place the "from"/"for" rules
 * live, so the display sites cannot drift apart (NEU-1216 §2.5).
 *
 * A list names who it is *for* (`recipient_name`) separately from the account
 * that owns it. `recipient_has_account` is three-valued and must never be read
 * directly by a caller: `!recipient_has_account` is also true for a list with no
 * recipient at all, which is exactly how the "kept by" label and the keeper's
 * warning would get shown by mistake.
 */

import type { SharedVia } from "../types";

/** The fields of a list this module reads. Structural, so every list shape fits. */
export interface ListLike {
  owner_name: string;
  // Optional, not because the API omits them, but because a response cached from
  // before these columns existed does.
  recipient_name?: string | null;
  recipient_has_account?: boolean | null;
  /** How a shared list reached the viewer (NEU-1227). Absent on an owned list,
   * and on the detail responses, which do not carry it. */
  shared_via?: SharedVia | null;
}

export type ListAttribution =
  /** No recipient: the person the list came from — the sharing user when the
   *  list carries one, else its owner. "from {subject}" */
  | { kind: "owner"; subject: string; keeper: null }
  /** A recipient who has an account — typically a shared login. "from {subject}" */
  | { kind: "shared"; subject: string; keeper: null }
  /** Reached the viewer through a family they belong to. The family is a source,
   *  not a person, so it reads as a bare label: "{subject}" */
  | { kind: "family"; subject: string; keeper: null }
  /** A recipient with no account, whose list someone else keeps.
   *  "for {subject} · kept by {keeper}" */
  | { kind: "absent"; subject: string; keeper: string };

/**
 * How a *viewer* sees this list. `kind` selects the preposition and tells the
 * caller which half to link: `subject` for "owner"/"shared", `keeper` for
 * "absent" — linking the absent recipient's name to the keeper's profile would
 * simply be wrong. "family" names a group, so it has no profile to link at all.
 *
 * Who the list is *for* still comes first: a recipient — absent or not — outranks
 * `shared_via`, which replaces only the line that used to name the owner and
 * nothing else (NEU-1235). So a list kept for Beth reads "for Beth · kept by Tom"
 * however it reached the viewer, and a shared login's list still reads "from Jane"
 * rather than naming the account or the family it came through.
 */
export function attributionFor(list: ListLike): ListAttribution {
  const recipient = recipientNameOf(list);
  if (recipient !== null) {
    if (list.recipient_has_account === false) {
      return { kind: "absent", subject: recipient, keeper: list.owner_name };
    }
    return { kind: "shared", subject: recipient, keeper: null };
  }
  if (list.shared_via?.kind === "family") {
    return { kind: "family", subject: list.shared_via.name, keeper: null };
  }
  // A direct share names the account that shared it, which *is* this list's owner
  // — `shared_via` is simply the authoritative statement of it. The owner's own
  // name stands in on a list that carries no source at all.
  return { kind: "owner", subject: list.shared_via?.name ?? list.owner_name, keeper: null };
}

/**
 * How the *owner* sees their own row: "for Beth", or null on a list with no
 * recipient (where today's UI shows no attribution at all).
 */
export function recipientLabel(list: ListLike): string | null {
  const recipient = recipientNameOf(list);
  return recipient === null ? null : `for ${recipient}`;
}

/**
 * Whether this list is kept on behalf of someone who has no account and will
 * never log in — the only state in which the keeper's warning applies. Mirrors
 * `GiftList.kept_for_absent_person` on the backend.
 */
export function isKeptForAbsentPerson(list: ListLike): boolean {
  return recipientNameOf(list) !== null && list.recipient_has_account === false;
}

/**
 * The recipient's name, or null when there isn't one. Collapses the shapes a
 * caller can actually hold: a response predating these columns omits the field
 * entirely, and an empty name is no name (the backend normalizes it to NULL).
 */
export function recipientNameOf(list: ListLike): string | null {
  const name = list.recipient_name?.trim();
  return name ? name : null;
}
