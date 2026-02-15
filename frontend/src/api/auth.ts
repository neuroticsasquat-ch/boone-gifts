import { apiClient } from "./client";
import type { TokenResponse, AccessTokenResponse } from "../types";

export async function login(email: string, password: string): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>("/auth/login", { email, password });
  return response.data;
}

export async function register(token: string, name: string, password: string): Promise<void> {
  await apiClient.post("/auth/register", { token, name, password });
}

export async function refresh(refreshToken: string): Promise<AccessTokenResponse> {
  const response = await apiClient.post<AccessTokenResponse>("/auth/refresh", { refresh_token: refreshToken });
  return response.data;
}
