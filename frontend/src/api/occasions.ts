import { apiClient } from "./client";
import type { GiftList, Occasion, OccasionCreated, ShoppingItem } from "../types";

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
export async function getOccasionShopping(id: number): Promise<ShoppingItem[]> {
  const response = await apiClient.get<ShoppingItem[]>(`/occasions/${id}/shopping`);
  return response.data;
}
