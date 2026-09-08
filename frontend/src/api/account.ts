import { apiClient } from "./client";
import type { Account, AccountUpdate } from "../types";

export async function getAccount(): Promise<Account> {
  const response = await apiClient.get<Account>("/account");
  return response.data;
}

/**
 * A declarative full replace of the account's shared-people state.
 *
 * A change that would strip labels off lists — un-marking the account, or
 * dropping a person whose lists point at them — answers **409** with
 * `{ affected_lists }` and changes nothing; re-issuing with `confirm` commits
 * it. Same idiom as the family revoke's `?claims=`.
 */
export async function updateAccount(payload: AccountUpdate, confirm = false): Promise<Account> {
  const response = await apiClient.put<Account>("/account", payload, {
    params: confirm ? { confirm: true } : undefined,
  });
  return response.data;
}
