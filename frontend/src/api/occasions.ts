import { apiClient } from "./client";
import type { GiftList, Occasion, OccasionCreated } from "../types";

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
