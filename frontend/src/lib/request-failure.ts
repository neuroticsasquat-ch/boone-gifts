/**
 * The one place a transport or server failure becomes text (NEU-1320).
 *
 * Every page that calls the API can fail in ways that have nothing to do with
 * the page's own subject: the request never arrived, the server refused to
 * process it yet, or our own side broke. Before this module each auth page
 * answered all three with the one failure it knew how to describe — `Login`
 * said "Invalid email or password" for a server it could not reach, which is
 * not merely unhelpful but names the one thing the user can act on
 * destructively.
 *
 * The module owns the classification **and** the copy, the way
 * `lib/money.ts` owns the one place money becomes text. Four pages each
 * writing their own "we couldn't reach the server" is the mistake that already
 * cost this repo seven back links and two attribution components.
 *
 * No sentence here may name a password, an email address, an invite or a link:
 * the same three strings serve login, registration, a reset request and a
 * reset. A page that needs domain-specific wording owns it locally, in its
 * `null` branch (`CONTEXT.md` rule 10).
 */
import { isAxiosError } from "axios";

export const FAILURE_UNREACHABLE =
  "We couldn't reach the server. It may be down, or your device may be offline.";
export const FAILURE_RATE_LIMITED = "Too many attempts. Wait a minute and try again.";
export const FAILURE_SERVER = "Something went wrong on our end. Try again in a moment.";

/**
 * What to tell the user about a failure that is not the page's own business,
 * or `null` when the server answered and rejected them.
 *
 * `null` means **the server sent a 4xx**, and nothing else — it is the signal a
 * page branches on to render its own rejection wording ("Invalid email or
 * password", the dead-link screen, the backend's `detail`). A code path that
 * never made a request can never reach it, which is why a non-axios throw
 * classifies as a server failure rather than as a rejection: a `TypeError` from
 * a bug in our own code must not be answered with a confident claim about the
 * user's password. "On our end" is true of our own JavaScript too.
 *
 * A timed-out request (`timeout` on the instance, `api/client.ts`) carries no
 * `response`, so it lands on unreachable with no branch of its own.
 */
export function failureMessage(err: unknown): string | null {
  if (!isAxiosError(err)) return FAILURE_SERVER;
  if (!err.response) return FAILURE_UNREACHABLE;
  const status = err.response.status;
  if (status === 429) return FAILURE_RATE_LIMITED;
  if (status >= 500) return FAILURE_SERVER;
  return null;
}
