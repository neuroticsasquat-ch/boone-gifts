import { apiClient } from "./client";
import type {
  GiftList,
  GiftListDetailOwner,
  GiftListDetailViewer,
  ShareTargetFamily,
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
  /** Occasions to share the new list with, each on a family the owner belongs
   *  to and none of them archived. Empty shares with nobody — there is no
   *  auto-grant, so the pre-checking lives in the form (project spec §5.2). */
  occasion_ids?: number[];
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

/**
 * The sharing control's families half: every family the owner belongs to, each
 * carrying the occasions this list can be shared to. The families URL is kept —
 * the resource is still "which families can this list reach", it is the occasion
 * underneath that a share now points at.
 */
export async function getShareTargets(listId: number): Promise<ShareTargetFamily[]> {
  const response = await apiClient.get<ShareTargetFamily[]>(`/lists/${listId}/families`);
  return response.data;
}

/** Share to one occasion. 409 when it has been archived since the panel loaded. */
export async function shareListWithOccasion(listId: number, occasionId: number): Promise<void> {
  await apiClient.put(`/lists/${listId}/occasions/${occasionId}`);
}

/**
 * Revoke an occasion's access. With no `claims` choice the backend returns 409
 * when a member of that occasion's family holds a claim they would lose;
 * re-issue with "release" or "keep" once the owner has decided.
 */
export async function unshareListFromOccasion(
  listId: number,
  occasionId: number,
  claims?: "release" | "keep",
): Promise<void> {
  await apiClient.delete(`/lists/${listId}/occasions/${occasionId}`, {
    params: claims ? { claims } : undefined,
  });
}
