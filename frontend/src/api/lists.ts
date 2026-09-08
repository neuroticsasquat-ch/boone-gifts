import { apiClient } from "./client";
import type {
  GiftList,
  GiftListDetailOwner,
  GiftListDetailViewer,
  ListFamilyShareState,
} from "../types";

export async function getLists(filter?: "owned" | "shared", archived?: boolean): Promise<GiftList[]> {
  const params: Record<string, string> = {};
  if (filter) params.filter = filter;
  if (archived !== undefined) params.archived = String(archived);
  const response = await apiClient.get<GiftList[]>("/lists", { params });
  return response.data;
}

export async function getList(id: number): Promise<GiftListDetailOwner | GiftListDetailViewer> {
  const response = await apiClient.get<GiftListDetailOwner | GiftListDetailViewer>(`/lists/${id}`);
  return response.data;
}

export async function createList(data: {
  name: string;
  description?: string;
  family_ids?: number[];
  recipient_name?: string | null;
  /** The account person this list is for. Mutually exclusive with
   *  `recipient_name` — the backend answers 400 if both arrive set. */
  account_person_id?: number | null;
}): Promise<GiftList> {
  const response = await apiClient.post<GiftList>("/lists", data);
  return response.data;
}

export async function updateList(
  id: number,
  data: {
    name?: string;
    description?: string;
    is_archived?: boolean;
    recipient_name?: string | null;
    /** The account person this list is for. Mutually exclusive with
     *  `recipient_name` — the backend answers 400 if both arrive set. */
    account_person_id?: number | null;
  },
): Promise<GiftList> {
  const response = await apiClient.put<GiftList>(`/lists/${id}`, data);
  return response.data;
}

export async function deleteList(id: number): Promise<void> {
  await apiClient.delete(`/lists/${id}`);
}

export async function getUnseenShareCount(): Promise<number> {
  const response = await apiClient.get<{ count: number }>("/lists/unseen-count");
  return response.data.count;
}

export async function getListFamilies(listId: number): Promise<ListFamilyShareState[]> {
  const response = await apiClient.get<ListFamilyShareState[]>(`/lists/${listId}/families`);
  return response.data;
}

export async function shareListWithFamily(listId: number, familyId: number): Promise<void> {
  await apiClient.put(`/lists/${listId}/families/${familyId}`);
}

/**
 * Revoke a family's access. With no `claims` choice the backend returns 409 when
 * a member of that family holds a claim they would lose; re-issue with "release"
 * or "keep" once the owner has decided.
 */
export async function unshareListFromFamily(
  listId: number,
  familyId: number,
  claims?: "release" | "keep",
): Promise<void> {
  await apiClient.delete(`/lists/${listId}/families/${familyId}`, {
    params: claims ? { claims } : undefined,
  });
}
