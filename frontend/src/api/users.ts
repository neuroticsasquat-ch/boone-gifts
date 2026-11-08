import { apiClient } from "./client";
import type { User, UserSearchResult } from "../types";

export async function getUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>("/users");
  return response.data;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const response = await apiClient.get<UserSearchResult[]>("/users/search", {
    params: { q: query },
  });
  return response.data;
}

export async function deleteUser(id: number, purge: boolean = false): Promise<void> {
  await apiClient.delete(`/users/${id}`, { params: { purge } });
}

export async function updateUser(
  id: number,
  data: { is_active?: boolean },
): Promise<User> {
  const response = await apiClient.put<User>(`/users/${id}`, data);
  return response.data;
}
