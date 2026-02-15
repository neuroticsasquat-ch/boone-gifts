import { apiClient } from "./client";
import type { Collection, CollectionDetail } from "../types";

export async function getCollections(): Promise<Collection[]> {
  const response = await apiClient.get<Collection[]>("/collections");
  return response.data;
}

export async function getCollection(id: number): Promise<CollectionDetail> {
  const response = await apiClient.get<CollectionDetail>(`/collections/${id}`);
  return response.data;
}

export async function createCollection(data: { name: string; description?: string }): Promise<Collection> {
  const response = await apiClient.post<Collection>("/collections", data);
  return response.data;
}

export async function updateCollection(id: number, data: { name?: string; description?: string }): Promise<Collection> {
  const response = await apiClient.put<Collection>(`/collections/${id}`, data);
  return response.data;
}

export async function deleteCollection(id: number): Promise<void> {
  await apiClient.delete(`/collections/${id}`);
}

export async function addCollectionItem(collectionId: number, listId: number): Promise<void> {
  await apiClient.post(`/collections/${collectionId}/items`, { list_id: listId });
}

export async function removeCollectionItem(collectionId: number, listId: number): Promise<void> {
  await apiClient.delete(`/collections/${collectionId}/items/${listId}`);
}
