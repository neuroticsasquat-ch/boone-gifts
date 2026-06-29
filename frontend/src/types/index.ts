// Auth
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
}

export interface InviteInfo {
  email: string;
  family_name: string | null; // null for admin-invite tokens
}

// User (decoded from JWT access token)
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  simple_mode: boolean;
}

// User (from API)
export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Gift Lists
export interface GiftList {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner_name: string;
  is_archived: boolean;
  gift_count: number;
  claimed_count: number;
  created_at: string;
  updated_at: string;
  families?: FamilyRef[];
}

export interface Gift {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  price: string | null;
  claimed_by_id: number | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftOwnerView {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  price: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftListDetailOwner {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner_name: string;
  is_archived: boolean;
  gifts: GiftOwnerView[];
  created_at: string;
  updated_at: string;
}

export interface GiftListDetailViewer {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner_name: string;
  is_archived: boolean;
  gifts: Gift[];
  created_at: string;
  updated_at: string;
}

// Connections
export interface ConnectionUser {
  id: number;
  name: string;
  email: string;
}

export interface Connection {
  id: number;
  status: string;
  user: ConnectionUser;
  created_at: string;
  accepted_at: string | null;
}

// User Search
export interface UserSearchResult {
  id: number;
  name: string;
  email: string;
}

// Shares
export interface ListShare {
  id: number;
  list_id: number;
  user_id: number;
  created_at: string;
}

// Collections
export interface Collection {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollectionDetail {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_archived: boolean;
  lists: GiftList[];
  created_at: string;
  updated_at: string;
}

// Shared Users
export interface SharedUser {
  id: number;
  name: string;
  email: string;
}

// URL Metadata
export interface UrlMeta {
  title: string | null;
  description: string | null;
  price: string | null;
  image: string | null;
}

// Shopping List
export interface ShoppingListItem {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  price: string | null;
  list_id: number;
  list_name: string;
  purchased_at: string | null;
}

// Invites (admin)
export interface Invite {
  id: number;
  token: string;
  email: string;
  role: string;
  status: "pending" | "used" | "expired";
  expires_at: string;
  used_at: string | null;
  invited_by_id: number;
  created_at: string;
}

// Families
export interface Family { id: number; name: string; role: string; member_count: number; }
export interface FamilyMember { user_id: number; name: string; role: string; }
export interface FamilyDetail { id: number; name: string; created_by_id: number; members: FamilyMember[]; }
export interface FamilyRef { id: number; name: string; }
export interface FamilyInvite {
  id: number; family_id: number; email: string; role: string; simple_mode: boolean;
  token: string; invited_by_id: number; expires_at: string;
  accepted_at: string | null; declined_at: string | null; created_at: string;
  status: "pending" | "accepted" | "declined" | "expired";
}
export interface IncomingFamilyInvite {
  id: number; token: string; role: string;
  family: FamilyRef; invited_by: { id: number; name: string };
  expires_at: string; created_at: string;
}
