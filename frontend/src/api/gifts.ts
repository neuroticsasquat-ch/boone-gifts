import { apiClient } from "./client";
import type { Gift, GiftOwnerView } from "../types";

export async function createGift(listId: number, data: { name: string; description?: string; url?: string; price?: string }): Promise<Gift | GiftOwnerView> {
  const response = await apiClient.post(`/lists/${listId}/gifts`, data);
  return response.data;
}

export async function updateGift(listId: number, giftId: number, data: { name?: string; description?: string; url?: string; price?: string }): Promise<Gift | GiftOwnerView> {
  const response = await apiClient.put(`/lists/${listId}/gifts/${giftId}`, data);
  return response.data;
}

export async function deleteGift(listId: number, giftId: number): Promise<void> {
  await apiClient.delete(`/lists/${listId}/gifts/${giftId}`);
}

export async function claimGift(listId: number, giftId: number): Promise<Gift> {
  const response = await apiClient.post<Gift>(`/lists/${listId}/gifts/${giftId}/claim`);
  return response.data;
}

export async function unclaimGift(listId: number, giftId: number): Promise<Gift> {
  const response = await apiClient.delete<Gift>(`/lists/${listId}/gifts/${giftId}/claim`);
  return response.data;
}
