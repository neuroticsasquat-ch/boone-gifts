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

/** Tick a claimed gift purchased, optionally recording what it cost.
 *
 * The two ways of not naming an amount are **not** the same request, and the
 * backend tells them apart by whether the field is set at all:
 *
 * - omit `amountPaid` — "Skip". Leaves whatever amount is already recorded
 *   alone, which is what makes unticking and re-ticking non-destructive.
 * - pass `null` — clears the recorded amount deliberately.
 */
export async function purchaseGift(listId: number, giftId: number, amountPaid?: string | null): Promise<Gift> {
  const body = amountPaid === undefined ? undefined : { amount_paid: amountPaid };
  const response = await apiClient.post<Gift>(`/lists/${listId}/gifts/${giftId}/purchase`, body);
  return response.data;
}

export async function unpurchaseGift(listId: number, giftId: number): Promise<Gift> {
  const response = await apiClient.delete<Gift>(`/lists/${listId}/gifts/${giftId}/purchase`);
  return response.data;
}
