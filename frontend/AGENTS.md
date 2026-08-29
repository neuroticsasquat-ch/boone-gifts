# Boone Gifts Frontend — Agent Guide

## Quick start
```bash
cp .env.example .env              # VITE_API_URL defaults to https://boone-gifts-api.localhost
task up                            # Docker build + Vite dev server (port 5173)
```
App at `https://boone-gifts.localhost` (requires Traefik on `proxy` network).

## Commands
All via `go-task` (`task`), every command runs **inside the Docker container**:
- `task up` — `docker compose up --build`
- `task test` — `npx vitest run`
- `task test-file -- <path>` — single test file
- `task test-watch` — `npx vitest` (watch mode)
- `task lint` — `npx oxlint`
- `task build` — `npx vite build` (production build)
- `task add -- <pkg>` / `task remove -- <pkg>` — npm install/uninstall
- `task install` — `npm ci` (after pulling lockfile changes)
- `task logs` / `task restart` — container logs / restart

## Stack & Config
- **React 19** / **TypeScript 7** / **Vite 8** / **Tailwind v4** (Vite plugin, no PostCSS)
- **React Router v7** (library/SPA mode via `createBrowserRouter`)
- **TanStack Query v5** + **Axios** (`withCredentials: true`) — API functions are plain async, called directly in queryFn/mutationFn (no custom query hooks)
- **Testing**: Vitest (jsdom) + React Testing Library + MSW
- **Lint**: oxlint with react-hooks rules enforced (`rules-of-hooks`, `exhaustive-deps`)
- **Build**: `tsc -b && vite build` — TypeScript errors block the build
- **tsconfig strict**: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`

## Architecture
- **Entry**: `src/main.tsx` → `App.tsx` (providers: QueryClient, Auth, Router, Sentry ErrorBoundary)
- **Auth**: Access token in memory (module-level variable in `api/client.ts`), refresh token in HttpOnly cookie (backend-managed). Silent refresh on mount restores sessions. 401 interceptor refreshes + retries (skips `/auth/` to avoid loops; queued during concurrent failures).
- **Routing**: `routes.tsx` — public paths (`/login`, `/register`, `/forgot-password`, `/reset-password`), then `ProtectedRoute` → `Layout` (nav shell) for all authenticated pages.
- **Simple mode**: Nav branches in `Layout.tsx` — full mode (Home/Lists/Connect/Families/Collect) vs simple mode (My Lists/Family Lists). Toggled on Account page.
- **Family invite flow**: `Register.tsx` reads `?family_invite=<token>` (in addition to `?token=` for admin invites). `AcceptFamilyInvite` at `/family-invites/:token` for authenticated users.
- **Pages** under `src/pages/`. `list-detail/` subdir for `GiftsTab`, `SharedWithTab`, `CollectionsTab`.

## Critical conventions
- **Docker**: `node_modules` lives in a named Docker volume to survive the bind mount. After `task add`, run `task up` to rebuild the image.
- **Vite HMR**: Configured with WSS on port 443 (`clientPort`) to work behind Traefik.
- **Tests**: MSW mocks in `src/test/mocks/handlers.ts` — includes `/auth/refresh → 401` default. Setup via `src/test/setup.ts`.
- **Type imports**: Use `import type { ... }` (no `--verbatimModuleSyntax` violations).
- **API client**: `src/api/client.ts` exports `setAccessToken`/`getAccessToken`/`clearAccessToken` — never store access token in localStorage.
- **Types** in `src/types/index.ts` — `AuthUser` decoded from JWT payload (`simple_mode` + `role`); separate `Gift`/`GiftOwnerView` for viewer vs owner responses.

## Debugging CI failures
- **If told a CI/workflow run failed, always investigate via `gh` first** before running anything locally or claiming it's fixed: `gh run list -w CI` to find the failed run, then `gh run view <id> --log-failed` to see what went wrong.
- **Never report something as fixed based on local runs alone** — CI runs `npx oxlint` and `npx vitest run` in a clean node environment and may surface issues local runs miss. Always push/prompt a fresh CI run and confirm it passes before declaring done.

## Pre-commit (not yet installed, but planned)
- Pre-commit will be installed **on the host** (system Python), not inside the container — the hooks themselves delegate via `task` commands to run checks **inside** the Docker container (e.g. `task lint`, `task test`).
- This matters: never install pre-commit or its hooks inside the container; it lives on the host and calls `docker compose exec` under the hood.

## Production
- **Deploy**: Push `main` → Cloudflare Pages auto-builds (`npm ci && npm run build`) and deploys to CDN.
- **Domain**: `app.boone.gift`
- **Sentry**: `VITE_SENTRY_DSN` env var; Sentry Vite plugin for source map uploads (`SENTRY_AUTH_TOKEN`). Sentry init at `main.tsx`.

## Environment essentials
| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend URL (dev: `https://boone-gifts-api.localhost`, prod: `https://api.boone.gift`) |
| `VITE_SENTRY_DSN` | Leave empty to disable Sentry |
| `SENTRY_AUTH_TOKEN` | Build-time only, for source map upload |
