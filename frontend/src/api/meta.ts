import { apiClient } from "./client";
import type { UrlMeta } from "../types";

export async function fetchUrlMeta(url: string): Promise<UrlMeta> {
  const response = await apiClient.get<UrlMeta>("/meta", { params: { url } });
  return response.data;
}
