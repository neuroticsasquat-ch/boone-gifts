import { apiClient } from "./client";
import type {
  ArchivePrompt,
  BudgetRollup,
  GiftList,
  Occasion,
  OccasionCreated,
  OccasionSummary,
  ShoppingPayload,
} from "../types";

/**
 * Every occasion the caller can see, across every family they belong to —
 * including occasions with no lists shared to them, which §5.1 argues are the
 * ones most likely to need action.
 *
 * Rows arrive ordered `last_activity_at DESC, id DESC`; the `id` tiebreak is
 * what makes "the first four" stable across requests. Callers render array
 * order and **do not re-sort**: the server owns the definition of
 * `last_activity_at` and is the only place that can order on it without a
 * consumer re-deriving it.
 */
export async function getOccasionIndex(archived = false): Promise<OccasionSummary[]> {
  const response = await apiClient.get<OccasionSummary[]>("/occasions", {
    params: { archived: String(archived) },
  });
  return response.data;
}

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

/**
 * Rename or (un)archive. **Gated per field**, not per call (NEU-1294 decision
 * 4): a rename needs an organizer of the family, while setting `is_archived` —
 * in either direction — needs an organizer **or** the occasion's creator. The
 * backend returns 403 otherwise, so a caller sending both fields must satisfy
 * the stricter of the two.
 */
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

/**
 * The occasions the backend is asking this caller about — quiet for 60 days,
 * and theirs to close out because they created the occasion or organize its
 * family. Takes no parameter of any kind: the thresholds and the eligibility
 * are the server's.
 *
 * Rows arrive ordered `id DESC`. Callers render array order and **do not
 * re-sort**, the same rule the occasion index carries. A caller with nothing to
 * answer gets `200 []`, never a 404.
 */
export async function getArchivePrompts(): Promise<ArchivePrompt[]> {
  const response = await apiClient.get<ArchivePrompt[]>("/occasions/archive-prompts");
  return response.data;
}

/**
 * Record "not yet" for one occasion. No body — the 30 days is the server's
 * rule, and the snooze expires rather than being reset by activity.
 *
 * There is no 409: staleness is deliberately not re-checked on dismissal
 * (NEU-1294 decision 5), so a row that went active while it sat on screen still
 * answers 204. Do not write an error arm for a race that cannot happen.
 */
export async function dismissArchivePrompt(occasionId: number): Promise<void> {
  await apiClient.post(`/occasions/${occasionId}/archive-prompt/dismiss`);
}
