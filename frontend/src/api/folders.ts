import { apiClient } from "./client";
import type { Folder, FolderDetail, ShoppingListItem } from "../types";

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

export async function getShoppingList(folderId: number): Promise<ShoppingListItem[]> {
  const response = await apiClient.get<ShoppingListItem[]>(`/folders/${folderId}/shopping-list`);
  return response.data;
}
