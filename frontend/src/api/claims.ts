import { apiClient } from "./client";
import type { ClaimRead } from "../types";

/**
 * Correct one of the caller's own claims — what it cost, or which occasion it
 * is filed under.
 *
 * This is the **only** way to change a recorded amount without moving the
 * purchase. A second `POST /purchase` would re-stamp `purchased_at` to today
 * (`app/gifts/service.py` sets it unconditionally), silently walking a purchase
 * across an occasion boundary, so an edit never goes that way.
 *
 * An omitted field is left alone — the backend reads the body with
 * `exclude_unset=True`, so an amount-only edit cannot disturb the filing and
 * vice versa. Sending `amount_paid: null` **clears** the amount, which is a
 * legitimate answer: a purchase with no amount recorded is honest about being
 * incomplete, and a budget that says so beats one padded with a guess.
 *
 * The backend answers **403** for a claim that is not the caller's — and for
 * one that does not exist at all, so the list's owner learns nothing by probing
 * ids — and for an occasion outside the claim's allowed set.
 */
export async function updateClaim(
  claimId: number,
  data: { occasion_id?: number | null; amount_paid?: string | null },
): Promise<ClaimRead> {
  const response = await apiClient.patch<ClaimRead>(`/claims/${claimId}`, data);
  return response.data;
}
