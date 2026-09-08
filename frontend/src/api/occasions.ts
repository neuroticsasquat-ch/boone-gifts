import { apiClient } from "./client";
import type { Occasion, OccasionCreated } from "../types";

export async function getFamilyOccasions(
  familyId: number,
  archived = false,
): Promise<Occasion[]> {
  const response = await apiClient.get<Occasion[]>(`/families/${familyId}/occasions`, {
    params: { archived: String(archived) },
  });
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
