import { apiClient } from "./client";
import type { GiftList, GiftListDetailOwner, GiftListDetailViewer } from "../types";

export async function getLists(): Promise<GiftList[]> {
  const response = await apiClient.get<GiftList[]>("/lists");
  return response.data;
}

export async function getList(id: number): Promise<GiftListDetailOwner | GiftListDetailViewer> {
  const response = await apiClient.get<GiftListDetailOwner | GiftListDetailViewer>(`/lists/${id}`);
  return response.data;
}

export async function createList(data: { name: string; description?: string }): Promise<GiftList> {
  const response = await apiClient.post<GiftList>("/lists", data);
  return response.data;
}

export async function updateList(id: number, data: { name?: string; description?: string }): Promise<GiftList> {
  const response = await apiClient.put<GiftList>(`/lists/${id}`, data);
  return response.data;
}

export async function deleteList(id: number): Promise<void> {
  await apiClient.delete(`/lists/${id}`);
}
