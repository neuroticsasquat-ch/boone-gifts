# Boone Gifts Frontend

React SPA for the Boone Gifts platform — a gift list and wishlist app where users create lists, share them with connections and families, and claim gifts without the list's owner seeing who claimed what.

For architecture, routes, and conventions, see [`AGENTS.md`](AGENTS.md).

## Tech Stack

- **React 19** / **TypeScript** / **Vite**
- **Tailwind CSS v4** (styling)
- **React Router v7** (routing)
- **TanStack Query v5** + **Axios** (data fetching)
- **Vitest** + **React Testing Library** + **MSW** (testing)
- **Docker Compose** (web, api and a Mailpit mail catcher)

## Prerequisites

- Docker
- [go-task](https://taskfile.dev/)

The compose file lives one directory up and starts the whole stack — this app, the backend API, and Mailpit — so there's no separate backend to launch by hand.

## Setup

1. Copy the environment template:

   ```
   cp .env.example .env
   ```

   `VITE_API_URL` must be a URL the **browser** can reach. `http://localhost:8000` works when you're on the machine running the stack; on a remote workspace, use the api subdomain it publishes.

2. Make sure this app's origin is in the backend's `APP_CORS_ORIGINS` — `http://localhost:5173` by default.

3. Start the stack (from the workspace root, or with `task -d ..` from here):

   ```
   task up
   ```

The app is available at `http://localhost:5173`, the API at `http://localhost:8000`, and Mailpit at `http://localhost:8025`.

## Development

Stack lifecycle lives in the workspace root Taskfile:

```
task up                  # Start db, mail, api, web
task down                # Stop the stack
task ps                  # Service status
task logs -- web         # Follow one service's logs
task restart -- web      # Restart one service
task rebuild -- web      # Rebuild and recreate one service
task shell -- web        # Shell into a service
```

Repo tasks run inside the web container — from this directory, or prefixed `fe:` from the root:

```
task test                # Run test suite
task test-file -- <path> # Run a specific test file
task test-watch          # Run tests in watch mode
task lint                # oxlint
task build               # Production build (tsc -b && vite build)
task add -- <pkg>        # Install a package
task remove -- <pkg>     # Remove a package
task install             # Reinstall deps from the lock file, after pulling updates
```

After `task add`, rebuild the image (`task rebuild -- web` from the root) so the dependency survives container recreation — `node_modules` lives in a named volume.

## Environment Variables

See [`.env.example`](.env.example) for the annotated set.

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL, as reached by the browser |
| `VITE_SENTRY_DSN` | Bugsink DSN for this project. Leave empty to disable error reporting locally |
| `VITE_SENTRY_ENVIRONMENT` | Environment tag on every event; defaults to `production` |

### Error reporting (Bugsink)

Errors go to [Bugsink](https://www.bugsink.com/), which speaks the Sentry protocol, so the client is still `@sentry/react` and the build still uses `@sentry/vite-plugin`. These are **build-time** variables, read from the build host's environment rather than from `.env`, and none of them reaches the bundle except the release SHA:

| Variable | Notes |
|---|---|
| `SENTRY_AUTH_TOKEN` | Bugsink auth token. Without it the build still succeeds, but emits no source maps and uploads nothing |
| `SENTRY_URL` | The Bugsink host, e.g. `https://bugsink.neuroticsasquat.ch` |
| `SENTRY_ORG` | Any value; defaults to `bugsinkhasnoorgs`. Bugsink has no organisations, but `sentry-cli` requires one |
| `SENTRY_PROJECT` | The Bugsink project slug; defaults to `boone-gifts-frontend` |
| `SOURCE_COMMIT` / `WORKERS_CI_COMMIT_SHA` / `CF_PAGES_COMMIT_SHA` | Set by Coolify / Workers Builds / Cloudflare Pages; the first that is set and not Coolify's literal `unknown` wins. Becomes the `release` on every event and on the uploaded maps |

With a token, Vite emits hidden source maps, the plugin injects debug IDs and uploads them to Bugsink as an artifact bundle, then deletes every `.map` from `dist/`, so none is published to the CDN.

To check reporting end to end, load any page with `?test-error` (e.g. `https://app.boone.gift/?test-error`). It throws a `BugsinkTestError`, which the top-level `Sentry.ErrorBoundary` catches and reports. Nothing links to it.

## Deployment

The app deploys as a Cloudflare Worker with static assets, built and deployed by Workers Builds. `wrangler.jsonc` declares an **assets-only** Worker — no `main`, so no Worker script runs: the platform serves `dist/` directly and answers unknown paths with `index.html` (`not_found_handling: "single-page-application"`), so deep links reach the router. There is no `_redirects` file; that setting replaces it.

Workers Builds settings:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy` (the `deploy` script runs the same thing)
- **Root directory:** the repo root

Build variables the app reads — set them as **build** variables, not Worker runtime variables, because the bundle is static and every value is fixed at build time:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL (`https://api.boone.gift`) |
| `VITE_SENTRY_DSN` | Bugsink DSN; unset leaves error reporting off |
| `VITE_SENTRY_ENVIRONMENT` | Environment tag; defaults to `production` |
| `SENTRY_URL` / `SENTRY_AUTH_TOKEN` | Source map upload (see "Error reporting" above); `SENTRY_ORG` / `SENTRY_PROJECT` default correctly (a blank value counts as unset) |

The release SHA needs no variable: Workers Builds sets `WORKERS_CI_COMMIT_SHA` itself.

To check the Worker locally, from `task shell -- web`: `npm run build && npx wrangler deploy --dry-run` lists the assets it would upload, and `npx wrangler dev` serves `dist/` the way production does.

## Testing

```
task test
```

~215 tests across 26 files, run in jsdom with MSW mocking the API. The mock handlers pin the API origin, so they're unaffected by whatever `VITE_API_URL` your `.env` sets.
