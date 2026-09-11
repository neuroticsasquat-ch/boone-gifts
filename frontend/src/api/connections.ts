import { apiClient } from "./client";
import type { Connection } from "../types";

export async function getConnections(): Promise<Connection[]> {
  const response = await apiClient.get<Connection[]>("/connections");
  return response.data;
}

export async function getConnectionRequests(): Promise<Connection[]> {
  const response = await apiClient.get<Connection[]>("/connections/requests");
  return response.data;
}

export async function sendConnectionRequest(data: { user_id?: number; email?: string }): Promise<Connection> {
  const response = await apiClient.post<Connection>("/connections", data);
  return response.data;
}

export async function acceptConnection(id: number): Promise<Connection> {
  const response = await apiClient.post<Connection>(`/connections/${id}/accept`);
  return response.data;
}

export async function deleteConnection(id: number): Promise<void> {
  await apiClient.delete(`/connections/${id}`);
}
