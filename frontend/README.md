# Boone Gifts Frontend

React SPA for the Boone Gifts platform — a gift list and wishlist app where users create lists, share them with connections and families, and claim gifts without the list's owner seeing who claimed what.

For architecture, routes, and conventions, see [`AGENTS.md`](AGENTS.md).

## Tech Stack

- **React 19** / **TypeScript** / **Vite**
- **Tailwind CSS v4** (styling)
- **React Router v7** (routing)
- **TanStack Query v5** + **Axios** (data fetching)
- **Vitest** + **React Testing Library** + **MSW** (testing)
- **Docker Compose** (the frontend container, behind the shared tbc-localdev-infra Traefik)

## Prerequisites

- Docker
- [go-task](https://taskfile.dev/)
- [pre-commit](https://pre-commit.com) (`brew install pre-commit`)
- [tbc-localdev-infra](https://github.com/tomboone/tbc-localdev-infra) checked out at `~/projects/tbc-localdev-infra` (Traefik, Mailpit and the `proxy` network)
- The backend, [boone-gifts-backend](../boone-gifts-backend), checked out beside this repo and started with its own `task up`

## Setup

1. Copy the environment template:

   ```
   cp .env.example .env
   ```

   `VITE_API_URL` must be a URL the **browser** can reach: `https://boone-gifts-api.localhost`, the backend's Traefik host.

2. Make sure this app's origin is in the backend's `APP_CORS_ORIGINS` — `https://boone-gifts.localhost`.

3. Start the shared infra and the frontend container:

   ```
   task up
   ```

4. Install the git hooks (once):

   ```
   pre-commit install
   ```

   They run `task lint`, `task typecheck` and `task test` inside the `boone-gifts-frontend` container, so it must be up to commit.

The app is available at `https://boone-gifts.localhost`, the API at `https://boone-gifts-api.localhost`, and Mailpit at `https://mailpit.localhost`.

## Development

```
task up                  # Start the shared infra, then the frontend container
task down                # Stop the frontend container (the shared infra keeps running)
task logs                # Follow the frontend container's logs
task restart             # Restart the frontend container
task build               # Rebuild the image, sync deps into node_modules, recreate the container
task shell               # Shell into the frontend container
task ps                  # Compose service status
task infra:status        # Shared infra status (also infra:up / infra:down / infra:logs)
```

Every other task runs inside the frontend container — nothing needs node on the host:

```
task test                # Run test suite
task test -- <path>      # Run a specific test file
task test:watch          # Run tests in watch mode
task lint                # oxlint
task typecheck           # tsc -b
task build:app           # Production build (vite build)
task deps:add -- <pkg>   # Install a package
task deps:add-dev -- <pkg> # Install a dev dependency
task deps:remove -- <pkg>  # Remove a package
task install             # Reinstall deps from the lock file, after pulling updates
```

After a dependency change, yours or pulled, run `task build`. `node_modules` lives in a named volume, which hides a rebuilt image's packages; `task build` syncs them into it.

The Taskfile, compose file and hooks follow the shared contract in `~/projects/tbc-localdev-infra/CONVENTIONS.md`.

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
| `NODE_VERSION` | `22`, matching CI and the Dockerfile; the repo pins no version, so the build image's default applies otherwise |
| `VITE_API_URL` | Backend base URL (`https://api.boone.gift`) |
| `VITE_SENTRY_DSN` | Bugsink DSN; unset leaves error reporting off |
| `VITE_SENTRY_ENVIRONMENT` | Environment tag; defaults to `production` |
| `SENTRY_URL` / `SENTRY_AUTH_TOKEN` | Source map upload (see "Error reporting" above); `SENTRY_ORG` / `SENTRY_PROJECT` default correctly (a blank value counts as unset) |

The release SHA needs no variable: Workers Builds sets `WORKERS_CI_COMMIT_SHA` itself.

To check the Worker locally, from `task shell`: `npm run build && npx wrangler deploy --dry-run` lists the assets it would upload, and `npx wrangler dev` serves `dist/` the way production does.

## Testing

```
task test
```

~215 tests across 26 files, run in jsdom with MSW mocking the API. The mock handlers pin the API origin, so they're unaffected by whatever `VITE_API_URL` your `.env` sets.
