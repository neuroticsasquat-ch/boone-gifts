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
/**
 * How a shared list reached the viewer: a direct share from a person, or a grant
 * to a family they belong to. A list reachable both ways reports `kind: "user"`
 * — the backend resolves that (NEU-1227), the client never re-derives it.
 */
export interface SharedVia {
  kind: "user" | "family";
  /** The sharing user, or the family — whichever `kind` names. */
  id: number;
  name: string;
}

export interface GiftList {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner_name: string;
  /** Who the list is *for*, when that differs from the account that owns it. */
  recipient_name: string | null;
  /** Whether that person has an account of their own. Three-valued: null means
   * there is no recipient at all. Never read it directly — go through
   * `attributionFor` / `recipientLabel` in `lib/attribution`. */
  recipient_has_account: boolean | null;
  /** The account person this list is marked for, on a shared account. Mutually
   * exclusive with `recipient_name`; both null on a household list. */
  account_person_id: number | null;
  /** That person's name, so a row can read "for Gran" without a second request. */
  account_person_name: string | null;
  is_archived: boolean;
  gift_count: number;
  claimed_count: number;
  created_at: string;
  updated_at: string;
  /** Present only on a list in the `shared` scope — null on one the caller owns,
   * absent on a response cached from before the field existed. */
  shared_via?: SharedVia | null;
  families?: FamilyRef[];
}

/** One family the list owner belongs to, and whether the list is shared with it. */
export interface ListFamilyShareState {
  id: number;
  name: string;
  shared: boolean;
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
  /** Who the list is *for*, when that differs from the account that owns it. */
  recipient_name: string | null;
  /** Whether that person has an account of their own. Three-valued: null means
   * there is no recipient at all. Never read it directly — go through
   * `attributionFor` / `recipientLabel` in `lib/attribution`. */
  recipient_has_account: boolean | null;
  /** The account person this list is marked for, on a shared account. Mutually
   * exclusive with `recipient_name`; both null on a household list. */
  account_person_id: number | null;
  /** That person's name, so a row can read "for Gran" without a second request. */
  account_person_name: string | null;
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
  /** Who the list is *for*, when that differs from the account that owns it. */
  recipient_name: string | null;
  /** Whether that person has an account of their own. Three-valued: null means
   * there is no recipient at all. Never read it directly — go through
   * `attributionFor` / `recipientLabel` in `lib/attribution`. */
  recipient_has_account: boolean | null;
  /** The account person this list is marked for, on a shared account. Mutually
   * exclusive with `recipient_name`; both null on a household list. */
  account_person_id: number | null;
  /** That person's name, so a row can read "for Gran" without a second request. */
  account_person_name: string | null;
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

// Occasions
export interface Occasion {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface OccasionDetail {
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

// Shared accounts
/**
 * A named person on a shared account. A **label, never an identity**: the
 * account stays one login, one member, one claimer everywhere, and everyone on
 * it sees everything on it (project spec §5.1).
 */
export interface AccountPerson {
  id: number;
  name: string;
}

/** `GET /account`, and the body every `PUT /account` returns. */
export interface Account {
  is_shared_account: boolean;
  people: AccountPerson[];
}

/** One entry of the desired people list. An `id` the account owns renames that
 *  person in place; without one the person is created. */
export interface AccountPersonWrite {
  id?: number;
  name: string;
}

/**
 * The `PUT /account` body — the *whole* desired state, not a patch: anyone left
 * out is deleted, and array order becomes display order (NEU-1228 §3.2).
 */
export interface AccountUpdate {
  is_shared_account: boolean;
  people: AccountPersonWrite[];
}

/** The 409 body when a change would strip labels off lists (NEU-1228 §3.3). */
export interface AccountConflict {
  affected_lists: number;
}
