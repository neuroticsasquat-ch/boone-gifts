import { apiClient } from "./client";
import type { User } from "../types";

export async function getUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>("/users");
  return response.data;
}

export async function updateUser(
  id: number,
  data: { is_active?: boolean },
): Promise<User> {
  const response = await apiClient.put<User>(`/users/${id}`, data);
  return response.data;
}
