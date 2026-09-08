/**
 * "Who is this list for?" — the single question behind both fields that name a
 * list's subject (NEU-1237; project spec §5.2).
 *
 * The API keeps `account_person_id` and `recipient_name` mutually exclusive and
 * permits neither, which makes three legal answers plus, on a shared account, the
 * state of not having answered yet. Modelling them as one tagged union is what
 * makes the exclusivity structural: switching branches drops the other branch's
 * value, so there is no path on which both travel to the server.
 *
 * The requirement to answer lives here and nowhere else — the API is happy with
 * a list that names no one, because a household list *is* one (NEU-1228 §4.2).
 */

import {
  NO_RECIPIENT,
  recipientIncomplete,
  recipientPayload,
  recipientValueFrom,
  type RecipientValue,
} from "./recipient";

export type ListForValue =
  /** A shared account's create form before the picker is touched. Blocks submit. */
  | { kind: "unanswered" }
  /** "Both of us" — nobody in particular, so both fields are null. Also what a
   *  non-shared account sends when its "for someone else" disclosure is closed. */
  | { kind: "household" }
  /** One of the account's own people. */
  | { kind: "person"; personId: number }
  /** A person with no account, named by `RecipientFields`. `recipient.enabled` is
   *  always true in this branch — the radio is the disclosure. */
  | { kind: "someone-else"; recipient: RecipientValue };

/** Where a shared account's create form starts: the answer is required, and there
 *  is no defensible default to pre-select. */
export const LIST_FOR_UNANSWERED: ListForValue = { kind: "unanswered" };

/** Where "Someone else" starts: disclosed, with nothing filled in yet. */
export const LIST_FOR_SOMEONE_ELSE: ListForValue = {
  kind: "someone-else",
  recipient: { ...NO_RECIPIENT, enabled: true },
};

/** Seed the picker from a stored list, for the edit header. A list carrying
 *  neither field reads as "Both of us" — which is what it is. */
export function listForValueFrom(list: {
  recipient_name: string | null;
  recipient_has_account?: boolean | null;
  account_person_id?: number | null;
}): ListForValue {
  if (list.recipient_name !== null) {
    return { kind: "someone-else", recipient: recipientValueFrom(list) };
  }
  if (list.account_person_id != null) {
    return { kind: "person", personId: list.account_person_id };
  }
  return { kind: "household" };
}

/**
 * The fields as the API takes them. `account_person_id` and `recipient_name`
 * both travel on every answer, so a change of mind clears the column the previous
 * one set — `PUT /lists/{id}` is a partial update, and omitting the other would
 * leave the old label standing beside the new one, which the service rejects as a
 * 400.
 *
 * `recipient_has_account` rides along for `RecipientFields`' radio alone. The
 * backend dropped the column in NEU-1230 and ignores the field; NEU-1241 deletes
 * the radio and this third key with it.
 */
export function listForPayload(value: ListForValue): {
  recipient_name: string | null;
  recipient_has_account: boolean | null;
  account_person_id: number | null;
} {
  switch (value.kind) {
    case "person":
      return {
        recipient_name: null,
        recipient_has_account: null,
        account_person_id: value.personId,
      };
    case "someone-else":
      return { ...recipientPayload(value.recipient), account_person_id: null };
    default:
      // "Both of us", and the unanswered state a form never submits.
      return { recipient_name: null, recipient_has_account: null, account_person_id: null };
  }
}

/**
 * True while the answer is unfinished — blocks submit.
 *
 * `isSharedAccount` is what makes "unanswered" mean something: on a non-shared
 * account there is no picker to answer, and the same state is simply a list for
 * nobody in particular. A caller that doesn't yet know the account's shape passes
 * `false`, so a slow `GET /account` can at worst let a shared account create the
 * household list it would have got by answering "Both of us" — never a blocked
 * form it cannot submit.
 */
export function listForIncomplete(value: ListForValue, isSharedAccount: boolean): boolean {
  if (value.kind === "unanswered") return isSharedAccount;
  if (value.kind === "someone-else") return recipientIncomplete(value.recipient);
  return false;
}
