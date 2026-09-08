/**
 * State and payload helpers for the "this list is for someone else" control
 * (NEU-1216 §2.7). Separate from the component so the component file only
 * exports components, which is what React Fast Refresh needs.
 */

/** What the control currently holds. */
export interface RecipientValue {
  enabled: boolean;
  name: string;
}

/** The state a list with no recipient starts from. */
export const NO_RECIPIENT: RecipientValue = {
  enabled: false,
  name: "",
};

/** Seed the control from a list's stored values, for the edit form. */
export function recipientValueFrom(list: { recipient_name: string | null }): RecipientValue {
  return {
    enabled: list.recipient_name !== null,
    name: list.recipient_name ?? "",
  };
}

/**
 * The field as the API takes it. Clearing the disclosure sends null so the
 * column is actually cleared.
 */
export function recipientPayload(value: RecipientValue): { recipient_name: string | null } {
  const name = value.name.trim();
  if (!value.enabled || name === "") {
    return { recipient_name: null };
  }
  return { recipient_name: name };
}

/**
 * True while the disclosure is open and the name is still blank — blocks submit.
 * With the disclosure open and the name blank, `recipientPayload` sends null, so
 * submitting would silently create an ordinary self-list and throw away the
 * answer the user just gave.
 */
export function recipientIncomplete(value: RecipientValue): boolean {
  return value.enabled && value.name.trim() === "";
}
