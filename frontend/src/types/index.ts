// Auth
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
}

// User (decoded from JWT access token)
export interface AuthUser {
  id: number;
  email: string;
  role: string;
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
  created_at: string;
  updated_at: string;
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
  gifts: GiftOwnerView[];
  created_at: string;
  updated_at: string;
}

export interface GiftListDetailViewer {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
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
  created_at: string;
  updated_at: string;
}

export interface CollectionDetail {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  lists: GiftList[];
  created_at: string;
  updated_at: string;
}
