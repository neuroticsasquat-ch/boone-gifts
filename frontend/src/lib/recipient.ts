/**
 * State and payload helpers for the "this list is for someone else" control
 * (NEU-1216 §2.7). Separate from the component so the component file only
 * exports components, which is what React Fast Refresh needs.
 */

/** What the control currently holds. `hasAccount` is null until the radio is answered. */
export interface RecipientValue {
  enabled: boolean;
  name: string;
  hasAccount: boolean | null;
}

/** The state a list with no recipient starts from. */
export const NO_RECIPIENT: RecipientValue = {
  enabled: false,
  name: "",
  hasAccount: null,
};

/** Seed the control from a list's stored values, for the edit form. */
export function recipientValueFrom(list: {
  recipient_name: string | null;
  recipient_has_account: boolean | null;
}): RecipientValue {
  return {
    enabled: list.recipient_name !== null,
    name: list.recipient_name ?? "",
    hasAccount: list.recipient_has_account,
  };
}

/**
 * The two fields as the API takes them. Both travel together: a flag with no
 * name is rejected by the backend, and clearing the disclosure sends null for
 * both so the columns are actually cleared.
 */
export function recipientPayload(value: RecipientValue): {
  recipient_name: string | null;
  recipient_has_account: boolean | null;
} {
  const name = value.name.trim();
  if (!value.enabled || name === "") {
    return { recipient_name: null, recipient_has_account: null };
  }
  return { recipient_name: name, recipient_has_account: value.hasAccount };
}

/**
 * True while the disclosure is open and something in it is unanswered — blocks
 * submit. The radio is required outright (§2.7). The name is required for the
 * same reason: with the disclosure open and the name blank, `recipientPayload`
 * sends nulls, so submitting would silently create an ordinary self-list and
 * throw away the answer the user just gave.
 */
export function recipientIncomplete(value: RecipientValue): boolean {
  return value.enabled && (value.hasAccount === null || value.name.trim() === "");
}
