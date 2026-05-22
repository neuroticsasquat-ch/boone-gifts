import { apiClient } from "./client";
import type { AccessTokenResponse } from "../types";

export async function login(email: string, password: string): Promise<AccessTokenResponse> {
  const response = await apiClient.post<AccessTokenResponse>("/auth/login", { email, password });
  return response.data;
}

export async function register(token: string, name: string, password: string): Promise<void> {
  await apiClient.post("/auth/register", { token, name, password });
}

export async function refresh(): Promise<AccessTokenResponse> {
  const response = await apiClient.post<AccessTokenResponse>("/auth/refresh");
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/reset-password", { token, new_password: newPassword });
}
