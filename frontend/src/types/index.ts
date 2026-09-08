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
 * How a shared list reached the viewer: a direct share from a person, or the
 * occasion it was shared to. A list reachable both ways reports `kind: "user"`
 * — the backend resolves that (NEU-1227), the client never re-derives it.
 *
 * A list is shared to an occasion, never to a family (project spec §5.1), so the
 * occasion arm carries the family it belongs to rather than naming it directly.
 */
export type SharedVia =
  | { kind: "user"; id: number; name: string }
  /** The family rides on the occasion arm and only there. It is not optional:
   *  the backend refuses an occasion share that does not carry one. */
  | { kind: "occasion"; id: number; name: string; family: FamilyRef };

export interface GiftList {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner_name: string;
  /** Who the list is *for*, when that differs from the account that owns it: a
   * person with no account. Read it through `attributionFor` / `recipientLabel`
   * in `lib/attribution` rather than directly. */
  recipient_name: string | null;
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
}

/**
 * One occasion the list can be shared to, and whether it already is.
 *
 * `is_archived` is only ever true on an occasion the list is *already* shared
 * to: archiving blocks new shares without withdrawing old ones, so the name
 * still has to be displayable (project spec §5.4).
 */
export interface ShareTargetOccasion {
  id: number;
  name: string;
  is_archived: boolean;
  shared: boolean;
}

/**
 * One family the list's owner belongs to, with the occasions it can be shared
 * to. An empty `occasions` is the "no active occasion" state — the family is
 * still listed, disabled, with the reason given (project spec §5.2).
 */
export interface ShareTargetFamily {
  id: number;
  name: string;
  occasions: ShareTargetOccasion[];
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
  /** Who the list is *for*, when that differs from the account that owns it: a
   * person with no account. Read it through `attributionFor` / `recipientLabel`
   * in `lib/attribution` rather than directly. */
  recipient_name: string | null;
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
  /** Who the list is *for*, when that differs from the account that owns it: a
   * person with no account. Read it through `attributionFor` / `recipientLabel`
   * in `lib/attribution` rather than directly. */
  recipient_name: string | null;
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

// Folders
export interface Folder {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface FolderDetail {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_archived: boolean;
  lists: GiftList[];
  created_at: string;
  updated_at: string;
}

// Occasions
/**
 * A family's shared gifting occasion — "Christmas 2026". The unit a list is
 * shared *to*, owned by the family. Not a {@link Folder}, which is one user's
 * private grouping of lists — see `docs/adr/0002-occasion-and-folder.md`.
 */
export interface Occasion {
  id: number;
  family_id: number;
  name: string;
  is_archived: boolean;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * The create response. A second active occasion is allowed, so the backend
 * reports whether the family already had one rather than refusing — a caller
 * with no occasion list to hand can warn off this alone.
 */
export interface OccasionCreated extends Occasion {
  has_other_active: boolean;
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
  id: number; family_id: number; email: string; role: string;
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
