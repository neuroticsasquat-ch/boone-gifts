import { apiClient } from "./client";
import type {
  Family,
  FamilyDetail,
  FamilyInvite,
  IncomingFamilyInvite,
  FamilyRef,
} from "../types";

export async function getFamilies(): Promise<Family[]> {
  const response = await apiClient.get<Family[]>("/families");
  return response.data;
}

export async function createFamily(data: { name: string }): Promise<FamilyDetail> {
  const response = await apiClient.post<FamilyDetail>("/families", data);
  return response.data;
}

export async function getFamily(id: number): Promise<FamilyDetail> {
  const response = await apiClient.get<FamilyDetail>(`/families/${id}`);
  return response.data;
}

export async function renameFamily(id: number, data: { name: string }): Promise<FamilyDetail> {
  const response = await apiClient.put<FamilyDetail>(`/families/${id}`, data);
  return response.data;
}

export async function deleteFamily(id: number): Promise<void> {
  await apiClient.delete(`/families/${id}`);
}

export async function removeMember(familyId: number, userId: number): Promise<void> {
  await apiClient.delete(`/families/${familyId}/members/${userId}`);
}

export async function updateMemberRole(
  familyId: number,
  userId: number,
  data: { role: string },
): Promise<FamilyDetail> {
  const response = await apiClient.put<FamilyDetail>(
    `/families/${familyId}/members/${userId}/role`,
    data,
  );
  return response.data;
}

export async function createInvite(
  familyId: number,
  data: { email: string; role?: string; simple_mode?: boolean },
): Promise<FamilyInvite> {
  const response = await apiClient.post<FamilyInvite>(`/families/${familyId}/invites`, data);
  return response.data;
}

export async function getInvites(familyId: number): Promise<FamilyInvite[]> {
  const response = await apiClient.get<FamilyInvite[]>(`/families/${familyId}/invites`);
  return response.data;
}

export async function revokeInvite(familyId: number, inviteId: number): Promise<void> {
  await apiClient.delete(`/families/${familyId}/invites/${inviteId}`);
}

export async function getIncomingFamilyInvites(): Promise<IncomingFamilyInvite[]> {
  const response = await apiClient.get<IncomingFamilyInvite[]>("/families/invites");
  return response.data;
}

export async function acceptFamilyInvite(
  token: string,
): Promise<{ family: FamilyRef; role: string }> {
  const response = await apiClient.post<{ family: FamilyRef; role: string }>(
    `/families/invites/${token}/accept`,
  );
  return response.data;
}

export async function declineFamilyInvite(token: string): Promise<void> {
  await apiClient.post(`/families/invites/${token}/decline`);
}
