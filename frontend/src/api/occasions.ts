import { apiClient } from "./client";
import type { Occasion, OccasionDetail, ShoppingListItem } from "../types";

export async function getOccasions(archived?: boolean): Promise<Occasion[]> {
  const params = archived !== undefined ? { archived: String(archived) } : undefined;
  const response = await apiClient.get<Occasion[]>("/occasions", { params });
  return response.data;
}

export async function getOccasion(id: number): Promise<OccasionDetail> {
  const response = await apiClient.get<OccasionDetail>(`/occasions/${id}`);
  return response.data;
}

export async function createOccasion(data: { name: string; description?: string }): Promise<Occasion> {
  const response = await apiClient.post<Occasion>("/occasions", data);
  return response.data;
}

export async function updateOccasion(
  id: number,
  data: { name?: string; description?: string; is_archived?: boolean },
): Promise<Occasion> {
  const response = await apiClient.put<Occasion>(`/occasions/${id}`, data);
  return response.data;
}

export async function deleteOccasion(id: number): Promise<void> {
  await apiClient.delete(`/occasions/${id}`);
}

export async function addOccasionItem(occasionId: number, listId: number): Promise<void> {
  await apiClient.post(`/occasions/${occasionId}/items`, { list_id: listId });
}

export async function removeOccasionItem(occasionId: number, listId: number): Promise<void> {
  await apiClient.delete(`/occasions/${occasionId}/items/${listId}`);
}

export async function getOccasionIdsForList(listId: number): Promise<number[]> {
  const response = await apiClient.get<number[]>(`/occasions/for-list/${listId}`);
  return response.data;
}

export async function getShoppingList(occasionId: number): Promise<ShoppingListItem[]> {
  const response = await apiClient.get<ShoppingListItem[]>(`/occasions/${occasionId}/shopping-list`);
  return response.data;
}
