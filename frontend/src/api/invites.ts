import { apiClient } from "./client";
import type { Invite } from "../types";

export async function getInvites(): Promise<Invite[]> {
  const response = await apiClient.get<Invite[]>("/invites");
  return response.data;
}

export async function createInvite(email: string): Promise<Invite> {
  const response = await apiClient.post<Invite>("/invites", { email });
  return response.data;
}

export async function deleteInvite(id: number): Promise<void> {
  await apiClient.delete(`/invites/${id}`);
}
