# NEU-1320 — Distinguish a network failure from bad credentials

**Ticket:** [NEU-1320](https://linear.app/neuroticsasquatch/issue/NEU-1320/distinguish-a-network-failure-from-bad-credentials-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1313](https://linear.app/neuroticsasquatch/issue/NEU-1313/a-failed-login-tells-me-what-actually-went-wrong) — "A failed login tells me what actually went wrong"
**Milestone:** M4 — Correctness
**Blocked by:** nothing. **Blocks:** nothing.
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §12.2 (milestone 4) — the only place the project spec mentions this work, in one clause. No other section covers it; this file is the spec.
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`Login.tsx:24` is a bare `catch` that answers every failure with **"Invalid email or password"**.
Found the honest way: a workspace whose `VITE_API_URL` pointed at an unreachable host rendered that
message for correct credentials. The message is not merely unhelpful, it is confidently wrong, and it
names the one thing the user can act on destructively — they retype a password that was right, then
reset it for nothing.

The other three auth pages tell the same kind of lie:

| Page | Today | The lie |
|---|---|---|
| `Login.tsx:24` | bare `catch` → "Invalid email or password" | the reported bug |
| `Register.tsx:51` | `err.response?.data?.detail` rendered raw, else "Registration failed. Check your invite link." | a 429 renders the backend's `"Rate limit exceeded: 5 per 1 minute"` verbatim; a network failure blames the invite link |
| `Register.tsx:34` | `getInviteInfo` `.catch()` → the "Invalid invite link" screen | a network failure on page load condemns a perfectly good invite |
| `ForgotPassword.tsx:17` | `catch {}` → "we've sent a password reset link" | a request that never left the browser still says an email is on its way |
| `ResetPassword.tsx:41` | any failure → "This reset link is invalid or expired" | a network failure sends the user to request a new link, forever |

Every one of them is the same defect: **the page reports the failure it knows how to describe rather
than the failure that happened.** So the fix is one function that names the failure, used at all five
call sites, plus the one piece of configuration that makes the naming possible.

## What to change

| File | Change |
|---|---|
| `src/lib/request-failure.ts` | **New** — `failureMessage(err): string \| null` and the three shared sentences |
| `src/lib/request-failure.test.ts` | **New** — the classifier's table |
| `src/api/client.ts` | `timeout: 15_000` on the axios instance |
| `src/pages/Login.tsx` | Branch on the failure; `navigate` leaves the `try` |
| `src/pages/Register.tsx` | Classifier first at both call sites — the submit and the `getInviteInfo` effect |
| `src/pages/ForgotPassword.tsx` | Gains an `error` state; the success screen now needs a real 2xx |
| `src/pages/ResetPassword.tsx` | Inline message for a cross-cutting failure; the dead-link screen for a rejection only |
| `src/pages/Login.test.tsx` | **New** — the page has no test file today |
| `src/pages/Register.test.tsx`, `ForgotPassword.test.tsx`, `ResetPassword.test.tsx` | New cases below |
| `CONTEXT.md` | New rule 10 |
| `AGENTS.md` | `lib/` gains a line; the Auth paragraph gains the timeout |

## Decisions

### 1. One module, and it returns the text

```ts
// src/lib/request-failure.ts
export const FAILURE_UNREACHABLE =
  "We couldn't reach the server. It may be down, or your device may be offline.";
export const FAILURE_RATE_LIMITED =
  "Too many attempts. Wait a minute and try again.";
export const FAILURE_SERVER =
  "Something went wrong on our end. Try again in a moment.";

export function failureMessage(err: unknown): string | null {
  if (!isAxiosError(err)) return FAILURE_SERVER;
  if (!err.response) return FAILURE_UNREACHABLE;
  const status = err.response.status;
  if (status === 429) return FAILURE_RATE_LIMITED;
  if (status >= 500) return FAILURE_SERVER;
  return null;
}
```

The module owns the classification **and** the copy for every failure that is not about the page's own
domain. This repo has already paid for the alternative twice: seven hardcoded back links in seven
phrasings became one `BackControl` (NEU-1302), and two attribution components that disagreed about the
same list became one `ListAttribution` (NEU-1291). Four pages each writing their own "we couldn't
reach the server" is the same shape of mistake before it happens. `lib/money.ts` is the precedent —
"the one place money becomes text"; this is the one place a transport or server failure becomes text.

It returns a **string**, not a kind. The two call sites that only want a sentence (`Login`, `Register`)
get one line, and the kind vocabulary stays inside the module.

### 2. `null` means "the server answered and rejected you", and nothing else

The two pages that must pick a whole *arm* rather than fill in a sentence — `ResetPassword`'s
dead-link screen, `ForgotPassword`'s success screen — branch on `null`, never on the text. Comparing
the returned string against the copy a page passed in was the rejected shape: it works, but the
equality is load-bearing and invisible, so editing a sentence silently changes which screen renders.
With `null` the function takes no copy at all, each page's own wording never leaves the page, and there
is no string comparison anywhere.

### 3. A non-axios throw is **not** a rejection

`if (!isAxiosError(err)) return FAILURE_SERVER` is the first line for a reason. A `TypeError` from a bug
in our own code — `decodePayload` on a malformed token, say — reaches `Login`'s catch, and if that
classified as `null` the page would answer a client-side bug with a confident claim about the user's
password. That is the exact defect this ticket exists to remove, so `null` is reserved strictly for a
response the server actually sent with a 4xx status: a code path that never made a request can never
reach it. "On our end" is true of our own JavaScript, so no fifth sentence is needed.

For the same reason `Login`'s `navigate(from, …)` moves **out** of the `try` (`Login.tsx:23`). A throw
from routing is not a login failure, and leaving it inside means a successful login can render an
error.

### 4. The timeout belongs on the instance

`isAxiosError(err) && !err.response` covers connection-refused, DNS failure and a CORS rejection. It
does **not** cover a host that accepts the connection and never answers: `apiClient` has no timeout
(`api/client.ts:25`), so that request hangs and the button sits on "Logging in…" with no message at
all — the same confidently-wrong experience, minus the words. `timeout: 15_000` on the instance closes
it: a timed-out request carries no `response`, so it classifies as unreachable with no new branch.

App-wide by design, and cheap because `App.tsx:12` sets `retry: false` — one attempt, one error, no
stacking. Per-call timeouts in `api/auth.ts` were rejected: same number in five places, and every other
page in the app left able to hang forever.

### 5. `ForgotPassword`'s success screen now needs a real 2xx

Today's `catch {}` carries a comment saying the swallow is deliberate — it mirrors the backend's
anti-enumeration 200 "on rate-limit / network failures so the user can't infer anything from the UI".
The instinct is right and the reach is wrong. **Whether the request reached the server, and whether our
mail path worked, say nothing about whether the address has an account:**

- the limiter is keyed on `get_remote_address` (backend `app/rate_limit.py`), so a 429 is about the
  caller's IP, not the email;
- a 5xx is our own failure, and it means no email was sent;
- an unreachable server means the request never happened.

All three currently render "check your inbox", which is a lie the user acts on by waiting. So: any
sentence `failureMessage` returns is displayed, and `null` — an answered 4xx — still falls through to
the generic success screen, which is what preserves anti-enumeration for anything the backend might
reject. **The only email-dependent answer the backend gives is 200**, so no branch here can reveal
whether an account exists.

```ts
const msg = failureMessage(err);
if (msg) setError(msg);
else setSubmitted(true);
```

The page needs a new `error` state and must keep rendering the **form** when it is set, so the user can
retry. The existing comment is replaced by one stating the narrower rule, so the next reader does not
restore the swallow.

### 6. `ResetPassword`'s dead-link screen is the rejection arm only

`ResetPassword.tsx:41` sets `tokenError` for everything, which replaces the form with "This reset link
is invalid or expired" and a "Request a new link" link. That screen is correct for a 400 — the backend
raises `BadRequestError("Invalid or expired reset token.")` three ways — and wrong for every other
failure, because requesting a new link cannot fix a network outage and the new link will fail the same
way.

```ts
const msg = failureMessage(err);
if (msg) setError(msg);
else setTokenError(true);
```

A cross-cutting failure keeps the form mounted with an inline message, so the submit button is the
retry. `/auth/reset-password` carries **no** rate limit (`app/auth/router.py:123-124` carries no `@limiter.limit`),
so the 429 arm is unreachable there — the shared function does not care, and nothing special is written
for it.

### 7. `Register` keeps surfacing the backend's `detail`, for the rejection only

The classifier runs first; `detail` is read only when it returns `null`. That is worth keeping rather
than replacing with generic copy, because these particular strings are written for the user — "An
account already exists for this email. Log in and accept the invite from your account."
(`app/auth/service.py:104-106`) is better than anything the frontend could say without the server's
knowledge. `Register.test.tsx` already asserts this behaviour and that test stands.

What it stops doing is rendering `detail` for a **429 or a 5xx**, which is how
`"Rate limit exceeded: 5 per 1 minute"` was reaching the screen.

`detail` is a string on every 4xx these endpoints raise: the request schemas in
`app/schemas/auth.py` declare plain `str` fields with no constraints, so FastAPI's 422 — whose `detail`
is an array of objects — is unreachable from our own client. Guard the read with `typeof detail ===
"string"` anyway and fall back to the existing "Registration failed. Check your invite link." The
guard is one line and the failure it prevents is `[object Object]` on the screen.

### 8. The `getInviteInfo` effect is the same bug and is fixed with it

`Register.tsx:34`'s `.catch(() => setInvalidToken(true))` renders **"Invalid invite link."** for a
failure on page load. A user on a flaky connection is told their invite is bad — the identical lie,
on the identical page, one code path over. The ticket's "if they share the pattern" covers it.

The effect classifies the same way: `null` keeps the existing invalid-link screen, and a sentence
renders an error arm that keeps the same `Go to login` link and offers **no retry control** — the page
retries by being reloaded, and adding a retry button here means a second state machine for one
sentence. The invite is not condemned: nothing sets `invalidToken`.

### 9. The 401 wording does not change, and the reason is recorded

"Invalid email or password" stays exactly as it is for a 401, and must stay **uniform** across "no such
email" and "wrong password". The backend already enforces this — `app/auth/router.py:60` raises a bare
`HTTPException(401)` with no detail — and the uniformity is the point: a message that distinguished the
two would tell an attacker which addresses have accounts. This is the one sentence in the ticket that
was already right, and the spec says so in case a later reader reads "be more specific" as applying to
all four branches.

### 10. The rate-limit sentence names no number

`rate_limit_exceeded_handler` (backend `app/rate_limit.py`) sets `Retry-After`, but
`CORSMiddleware` in `app/main.py:49` is configured with no `expose_headers`, so the browser strips
that header from every cross-origin response. **No frontend change can read it.** "Wait a minute" is
true of every configured limit — login `10/minute`, register `5/minute`, forgot-password `5/minute`
(`app/config.py:22-25`) — and stays true if the counts change, since the granularity is the minute.
See **Out of scope**.

### 11. One sentence, four pages

No sentence in `request-failure.ts` may name a password, an email address, an invite or a link: the
same three strings serve login, registration, a reset request and a reset. A page that needs
domain-specific wording owns it locally, in its `null` branch. This is what keeps the module from
growing a `page` parameter.

## `CONTEXT.md` edits

Add **rule 10** — additive, because other specs cite these rules by number and renumbering would
silently redirect those citations:

> 10. **A failure names its own cause, and a request the server never answered is not a rejection.**
>     A page may only tell the user their credentials, their invite or their link were rejected when
>     the server actually said so. A request that never arrived, one the server refused to process
>     yet, and one our own side failed on are three different facts, and each is said plainly —
>     because the message is the only thing the user can act on, and the destructive action a wrong
>     message invites is resetting a password that was always correct. The cross-cutting sentences are
>     written once (`lib/request-failure.ts`) and name nothing page-specific; anything the server
>     rejected outright is the page's own business. This is rule 7 one layer out: a wrong address is
>     not a missing thing, a slow one is not either, and neither is an unreachable server.

No new Terms row: this adds no word the user meets.

No ADR. The reasoning is local to one module and one rule, nothing is being reversed, and rule 10 plus
this file carry it.

## Acceptance criteria

Against the story's three criteria:

1. **Correct credentials with an unreachable server** say the app could not reach the server, not that
   the password is wrong. True for a refused connection, a DNS failure, a CORS rejection and — new — a
   host that hangs past 15 seconds.
2. **Genuinely wrong credentials** still say "Invalid email or password", unchanged, and still reveal
   nothing about whether the email exists.
3. **Rate limiting says it is rate limiting**, on login, registration and a reset request, with no
   backend string leaking through.

And, from this ticket:

4. A **5xx** on any of the four pages says something went wrong on our end.
5. **`ForgotPassword`** shows "check your inbox" only when the server actually answered 2xx — or
   answered a 4xx, which stays indistinguishable from success by design.
6. **`ResetPassword`** shows "This reset link is invalid or expired" only for a rejection; any other
   failure keeps the form and its inline message.
7. **`Register`** never renders a backend `detail` for a 429 or a 5xx, and never condemns an invite
   because `getInviteInfo` could not reach the server.
8. A **thrown non-axios error** anywhere in these four submit paths reads as "on our end", never as a
   credential, invite or link problem.

## Tests

`src/lib/request-failure.test.ts` — the classifier as a table, one case per branch: a non-axios value
(and `undefined`); an axios error with no `response`; 429; 500; 503; 400; 401; 404. Asserts the exact
constants, and asserts `null` for **every** 4xx so decision 2's contract is pinned rather than implied.

`src/pages/Login.test.tsx` — **new file**. `HttpResponse.error()` on `POST /auth/login` (the MSW idiom
already used at `ListDetail.test.tsx:260`) asserts the unreachable sentence and, critically, that
**"Invalid email or password" is absent** — the regression this ticket is. Then 401 → the credential
message; 429 → the rate-limit message; 500 → the server message; and a successful login still
navigates.

`ForgotPassword.test.tsx` — network failure and 500 each show their sentence and **keep the email
input mounted**; 429 shows the rate-limit sentence; a 400 still shows the generic success screen
(the anti-enumeration case, which is the one a future reader is most likely to break); the existing
2xx case stands.

`ResetPassword.test.tsx` — network failure shows the inline sentence and keeps the password fields
mounted, with **no** "Request a new link"; 500 likewise; the existing 400 case still shows the
dead-link screen.

`Register.test.tsx` — network failure on submit shows the unreachable sentence, not "Check your invite
link"; 429 shows the rate-limit sentence and **not** the backend's `"Rate limit exceeded: …"` string;
network failure on `getInviteInfo` shows the error arm and **not** "Invalid invite link."; the existing
detail-surfacing and password-mismatch cases stand.

The 15-second timeout is asserted as **configuration** — `apiClient.defaults.timeout` — not as
behaviour. Driving a real timeout needs fake timers fighting MSW and axios for one number, and the
branch it feeds is already covered by the no-response case.

## Out of scope

- **Reading `Retry-After`.** The backend sets it and CORS hides it (decision 10). Adding
  `expose_headers=["Retry-After"]` to `app/main.py` is a backend change, and this ticket is
  `repo:boone-gifts-frontend`. Recorded here so the next person finds a decision rather than a
  mystery; no ticket filed, because "wait a minute" is adequate and a countdown is not worth a
  cross-repo pair.
- **A rate limit on `/auth/reset-password`.** It has none (decision 6). Backend, and a different
  ticket.
- **The other 17 `isAxiosError` call sites.** Moving the whole app onto `failureMessage` was
  considered and rejected: those sites branch on domain statuses (409 on a duplicate share, 403 on an
  organizer-only action) that the module deliberately returns `null` for, so each would need its own
  rejection arm anyway. They are free to adopt it when one of them next changes.
- **Retrying automatically, or a retry control.** `retry: false` stands, and the submit button is
  already the retry on all four pages. The one arm with no submit button — `Register`'s
  `getInviteInfo` failure — retries by reload (decision 8).
- **Reporting these failures to Sentry.** `App.tsx` has the boundary; an expected network failure is
  not an exception and should not become noise.
- **`AuthContext.login` calling `apiClient.post` directly** (`contexts/AuthContext.tsx:112`) rather
  than `api/auth.ts`'s `login`. A real inconsistency, and irrelevant here: `login` and `register` both
  use `try`/`finally` with no `catch`, so the axios error reaches the page intact.
