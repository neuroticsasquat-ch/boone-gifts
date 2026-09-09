import { apiClient } from "./client";
import type { BudgetRollup, Folder, FolderDetail, ShoppingPayload } from "../types";

export async function getFolders(archived?: boolean): Promise<Folder[]> {
  const params = archived !== undefined ? { archived: String(archived) } : undefined;
  const response = await apiClient.get<Folder[]>("/folders", { params });
  return response.data;
}

export async function getFolder(id: number): Promise<FolderDetail> {
  const response = await apiClient.get<FolderDetail>(`/folders/${id}`);
  return response.data;
}

export async function createFolder(data: { name: string; description?: string }): Promise<Folder> {
  const response = await apiClient.post<Folder>("/folders", data);
  return response.data;
}

export async function updateFolder(
  id: number,
  data: { name?: string; description?: string; is_archived?: boolean },
): Promise<Folder> {
  const response = await apiClient.put<Folder>(`/folders/${id}`, data);
  return response.data;
}

export async function deleteFolder(id: number): Promise<void> {
  await apiClient.delete(`/folders/${id}`);
}

export async function addFolderItem(folderId: number, listId: number): Promise<void> {
  await apiClient.post(`/folders/${folderId}/items`, { list_id: listId });
}

export async function removeFolderItem(folderId: number, listId: number): Promise<void> {
  await apiClient.delete(`/folders/${folderId}/items/${listId}`);
}

export async function getFolderIdsForList(listId: number): Promise<number[]> {
  const response = await apiClient.get<number[]>(`/folders/for-list/${listId}`);
  return response.data;
}

/**
 * This folder's shopping tab: the caller's own claims on gifts in the lists the
 * folder holds, grouped by list in a stable order.
 *
 * Scoped by folder membership rather than by a claim's filing, which is what
 * makes a folder the only route to a claim on a directly-shared list — that
 * claim belongs to no occasion and so appears on no occasion's tab
 * (project spec §9.4).
 *
 * Replaces `/folders/{id}/shopping-list`, which read `gifts.claimed_by_id`; the
 * claim moved onto its own table in M4 and that endpoint went with it.
 */
export async function getFolderShopping(folderId: number): Promise<ShoppingPayload> {
  const response = await apiClient.get<ShoppingPayload>(`/folders/${folderId}/shopping`);
  return response.data;
}

/**
 * Set or replace **the caller's own** budget for this folder, and get the
 * rollup back.
 *
 * A budget is a whole target rather than a delta, so this is a plain replace
 * and there is no set-versus-update distinction for callers to carry. The
 * response is the recomputed line, which is why setting a budget is one round
 * trip and not a write followed by a re-read.
 */
export async function setFolderBudget(folderId: number, amount: string): Promise<BudgetRollup> {
  const response = await apiClient.put<BudgetRollup>(`/folders/${folderId}/budget`, { amount });
  return response.data;
}

/**
 * Remove the caller's own budget for this folder and get back the line it
 * leaves behind — the counts outlive the target, because clearing a budget is
 * not unclaiming anything. 404 when there was no budget to clear.
 */
export async function clearFolderBudget(folderId: number): Promise<BudgetRollup> {
  const response = await apiClient.delete<BudgetRollup>(`/folders/${folderId}/budget`);
  return response.data;
}
