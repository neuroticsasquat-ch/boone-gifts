import { apiClient } from "./client";
import type { ListShare } from "../types";

export async function getShares(listId: number): Promise<ListShare[]> {
  const response = await apiClient.get<ListShare[]>(`/lists/${listId}/shares`);
  return response.data;
}

export async function createShare(listId: number, userId: number): Promise<ListShare> {
  const response = await apiClient.post<ListShare>(`/lists/${listId}/shares`, { user_id: userId });
  return response.data;
}

export async function deleteShare(listId: number, userId: number): Promise<void> {
  await apiClient.delete(`/lists/${listId}/shares/${userId}`);
}
