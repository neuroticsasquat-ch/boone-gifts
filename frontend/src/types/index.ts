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
 * One way a shared list reached the viewer: a direct share from a person, or an
 * occasion of a family they belong to. A list can reach them several ways at
 * once, so `shared_via` is the array of all of them (NEU-1290).
 *
 * The backend deliberately **ranks nothing** — routes arrive direct-first then
 * by ascending occasion id, stable so responses do not churn, and that order is
 * not a ranking `routes[0]` may be read from. Which route *labels* the row is
 * the client's rule, and it lives in `lib/attribution.ts` alone (NEU-1291).
 *
 * A list is shared to an occasion, never to a family (project spec §5.1), so the
 * occasion arm carries the family it belongs to rather than naming it directly.
 */
export type ShareRoute =
  | { kind: "direct"; person: { id: number; name: string } }
  /** The family rides on the occasion arm and only there. It is not optional:
   *  the backend refuses an occasion share that does not carry one. */
  | { kind: "occasion"; occasion: { id: number; name: string }; family: FamilyRef };

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
  /** Every route by which this list reached the caller — empty on one they own.
   * Never null and never absent: the API guarantees the array (NEU-1290), so a
   * fixture that forgets it should fail to compile rather than quietly
   * exercising the fallback in `attributionFor`. */
  shared_via: ShareRoute[];
  /** How many of the viewer's *own* claims on this list are still unbought —
   * what the `• N to buy` badge counts (project spec §9.1).
   *
   * Optional here because this one interface serves both scopes: the backend
   * declares it **required** on the viewer schema, so every row in the `shared`
   * scope carries it, and omits it entirely from the owned schema, because an
   * owner never sees a claim. Optional is the honest typing of that pair — not
   * an invitation to treat a missing count as zero. */
  my_unpurchased_claim_count?: number;
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
  /** Every member of the family, the owner included. Not a new disclosure —
   *  `GET /families/{id}` already returns these ids to any member. */
  member_ids: number[];
  occasions: ShareTargetOccasion[];
}

/**
 * One occasion a claim can be filed under, as the viewer's list-detail payload
 * carries it. `family` is not decoration: two families routinely both call an
 * occasion "Christmas 2026", so the name alone does not identify one.
 */
export interface ClaimOccasion {
  id: number;
  name: string;
  is_archived: boolean;
  family: { id: number; name: string };
}

export interface Gift {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  /** The *owner's* asking price. Public to every viewer, and never the same
   * thing as what the claimer paid — see `amount_paid`. */
  price: string | null;
  claimed_by_id: number | null;
  claimed_at: string | null;
  purchased_at: string | null;
  /** What the **claimer** paid, and only ever legible to them: the claim these
   * fields are flattened from is private, and no owner-facing response carries
   * it (project spec §6.3). A string over the wire like `price`, because the
   * backend serialises `Decimal` that way. Null is a first-class answer — the
   * claimer skipped the amount — not a missing value to guess at. */
  amount_paid: string | null;
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
  /** The occasions a claim on this list would be filed under — the backend's
   * `suggested` set (NEU-1269 spec §2). **Its length is the whole prompting
   * rule**: 0 or 1 claims silently, 2+ asks once before the claim commits.
   * Never present on the owner's payload, which carries no claim state at all. */
  claim_candidates: ClaimOccasion[];
  /** The wider `allowed` set, which a claim may also be filed under but which
   * is not suggested — archived occasions, in practice. It rides along so the
   * picker can offer past occasions without a second request; without it the
   * correction path exists in the API and no UI can reach it (spec §3.5). */
  claim_options: ClaimOccasion[];
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

/**
 * One row of the occasion index — every non-archived occasion in every family
 * the caller belongs to, including the ones no list has been shared to yet.
 *
 * The counts are **the caller's own** and are the caller's by construction:
 * the endpoint takes no parameter naming another user. `last_activity_at` is
 * the later of the last share *into* the occasion and the caller's own claim
 * or purchase filed under it — never another user's claim, which would tell an
 * owner that somebody is buying them a present (`CONTEXT.md` rule 2). That
 * definition lives server-side and is not re-derived here.
 *
 * Non-null: the server floors it at the occasion's `created_at`.
 */
export interface OccasionSummary extends Occasion {
  family_name: string;
  list_count: number;
  my_claimed_count: number;
  my_bought_count: number;
  last_activity_at: string;
}

/**
 * One standing question about an occasion that has gone quiet: archive it, or
 * not yet. Asked of the occasion's creator or an organizer of its family.
 *
 * Four fields, built from scratch rather than off `Occasion` so there is no
 * field here that could ever carry claim state (NEU-1294 decision 9). Staleness
 * reads no claim by anyone, the caller included, so nothing on a prompt row is
 * inferable about who is shopping (`CONTEXT.md` rule 2).
 *
 * `id` is the **occasion's** id — what archive and dismiss both take.
 */
export interface ArchivePrompt {
  id: number;
  name: string;
  family_id: number;
  family_name: string;
}

// Shared Users
// URL Metadata
export interface UrlMeta {
  title: string | null;
  description: string | null;
  price: string | null;
  image: string | null;
}

// Shopping
/**
 * One line on a shopping tab: the viewer's own claim, and the gift it stands
 * on. Both tabs — an occasion's and a folder's — serve the same shape from the
 * same backend select, so one type covers them.
 *
 * **Only ever the viewer's own claims.** There is no parameter and no endpoint
 * that returns anyone else's (`CONTEXT.md` rule 2, project spec §7).
 *
 * `price` is the *owner's* asking price and `amount_paid` is what the claimer
 * actually spent; they are never interchangeable and neither is ever seeded
 * from the other. Both are strings, like every money value on the wire.
 *
 * `claim_id` is what makes this tab the place a recorded amount can be
 * corrected: `PATCH /claims/{id}` needs it, and the list-detail payload does
 * not carry it (project spec §6.2).
 */
export interface ShoppingItem {
  claim_id: number;
  gift_id: number;
  name: string;
  description: string | null;
  url: string | null;
  price: string | null;
  list_id: number;
  list_name: string;
  purchased_at: string | null;
  amount_paid: string | null;
}

/**
 * The budget line: the viewer's own target, what they have spent against it,
 * and the counts underneath (project spec §7).
 *
 * **Only ever the viewer's own figures.** No endpoint aggregates spend across
 * accounts, so there is nothing here that could be anyone else's
 * (`CONTEXT.md` rule 2).
 *
 * `amount` and `remaining` are null when no budget is set — that null is what
 * tells this app to offer *set* rather than *edit*, and the counts are worth
 * rendering either way. `remaining` may be negative: a budget is a target, not
 * a limit, and an overspend is a state to show plainly rather than an error.
 *
 * **The money total discloses its own incompleteness.** A purchase with no
 * amount recorded counts toward `bought_count` and `unpriced_count` and never
 * toward `spent`, so `unpriced_count` is what makes an understated total read
 * as an understatement rather than as fact.
 */
export interface BudgetRollup {
  amount: string | null;
  spent: string;
  remaining: string | null;
  bought_count: number;
  total_count: number;
  unpriced_count: number;
}

/**
 * A shopping tab, whole: the viewer's claims and the budget they count against.
 *
 * The rollup travels *with* the items rather than behind a second endpoint
 * because the two are one screen and must agree — a budget line fetched
 * separately can render a total the list beneath it contradicts.
 */
export interface ShoppingPayload {
  budget: BudgetRollup;
  items: ShoppingItem[];
}

/** A claim as its own claimer sees it — the body `PATCH /claims/{id}` returns.
 *  Never handed to anyone else: the filing is private to the claimer, and the
 *  list's owner sees no claim state at all. */
export interface ClaimRead {
  id: number;
  gift_id: number;
  occasion_id: number | null;
  claimed_at: string;
  purchased_at: string | null;
  amount_paid: string | null;
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
