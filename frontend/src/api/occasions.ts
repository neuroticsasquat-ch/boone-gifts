import { apiClient } from "./client";
import type {
  BudgetRollup,
  GiftList,
  Occasion,
  OccasionCreated,
  ShoppingPayload,
} from "../types";

export async function getFamilyOccasions(
  familyId: number,
  archived = false,
): Promise<Occasion[]> {
  const response = await apiClient.get<Occasion[]>(`/families/${familyId}/occasions`, {
    params: { archived: String(archived) },
  });
  return response.data;
}

/** One occasion. Any member of the owning family may read it; the backend
 *  answers 403 to everyone else and 404 when it does not exist. */
export async function getOccasion(id: number): Promise<Occasion> {
  const response = await apiClient.get<Occasion>(`/occasions/${id}`);
  return response.data;
}

export async function createOccasion(
  familyId: number,
  data: { name: string },
): Promise<OccasionCreated> {
  const response = await apiClient.post<OccasionCreated>(
    `/families/${familyId}/occasions`,
    data,
  );
  return response.data;
}

/** Rename or (un)archive. Organizer-only; the backend returns 403 otherwise. */
export async function updateOccasion(
  id: number,
  data: { name?: string; is_archived?: boolean },
): Promise<Occasion> {
  const response = await apiClient.put<Occasion>(`/occasions/${id}`, data);
  return response.data;
}

/**
 * The lists shared to this occasion, as this member can see them. The backend
 * filters by `can_view_list`, so a list the viewer cannot see is simply absent
 * from the response — never returned to be hidden or greyed here.
 */
export async function getOccasionLists(id: number): Promise<GiftList[]> {
  const response = await apiClient.get<GiftList[]>(`/occasions/${id}/lists`);
  return response.data;
}

/**
 * This occasion's shopping tab: the caller's own claims **filed under** it,
 * grouped by list in a stable order.
 *
 * Keyed on the stored filing alone, so a claim whose list was later unshared —
 * or whose occasion was archived — stays on the tab it was filed under. Filing
 * is stored rather than derived precisely so a budget cannot rewrite its own
 * history (project spec §6.2), and an archived occasion still serves its
 * shopping payload.
 *
 * **Only ever the caller's own claims.** There is no parameter, no admin path
 * and no aggregate here that returns anyone else's.
 */
export async function getOccasionShopping(id: number): Promise<ShoppingPayload> {
  const response = await apiClient.get<ShoppingPayload>(`/occasions/${id}/shopping`);
  return response.data;
}

/**
 * Set or replace **the caller's own** budget for this occasion, and get the
 * rollup back.
 *
 * A budget is a whole target rather than a delta, so this is a plain replace
 * and there is no set-versus-update distinction for callers to carry. The
 * response is the recomputed line, which is why setting a budget is one round
 * trip and not a write followed by a re-read.
 */
export async function setOccasionBudget(id: number, amount: string): Promise<BudgetRollup> {
  const response = await apiClient.put<BudgetRollup>(`/occasions/${id}/budget`, { amount });
  return response.data;
}

/**
 * Remove the caller's own budget for this occasion and get back the line it
 * leaves behind — the counts outlive the target, because clearing a budget is
 * not unclaiming anything. 404 when there was no budget to clear.
 */
export async function clearOccasionBudget(id: number): Promise<BudgetRollup> {
  const response = await apiClient.delete<BudgetRollup>(`/occasions/${id}/budget`);
  return response.data;
}
