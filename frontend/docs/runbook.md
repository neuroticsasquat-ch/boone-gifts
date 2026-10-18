# Frontend Deploy & Operations Runbook

## Architecture

- **Host:** Cloudflare Worker `boone-gifts-frontend`, assets-only (no Worker script; `wrangler.jsonc`)
- **Runtime:** Static SPA (React + Vite build), served from `dist/` with SPA fallback to `index.html`
- **Auto-deploy:** Push to `main` triggers a Workers Builds build and deploy
- **Domain:** `app.boone.gift`
- **Monitoring:** Bugsink (error tracking, Sentry protocol)

The README's "Deployment" section is the reference for the Worker and its build settings. Moving `app.boone.gift` off the old Pages project is `ops/docs/runbooks/frontend-workers-migration.md`.

## Deploy

Push to `main`. Workers Builds detects the push, runs `npm run build` (`tsc -b && vite build`), then `npx wrangler deploy`, which uploads `dist/` as the Worker's static assets.

No manual steps required for a standard deploy.

### Verify a deploy

Open `https://app.boone.gift` in a browser. Check that the app loads and login works. The deploy step of the build log names Worker `boone-gifts-frontend`.

### Trigger a redeploy

Merge a commit to `main`. Useful when you change build variables (they only take effect on the next build).

Do **not** retry or start a build from the dashboard: a dashboard-started build sets `WORKERS_CI_COMMIT_SHA` to the branch name, so every error from that build is filed under release `main` instead of the commit SHA.

## Rollback

### Via Cloudflare dashboard

1. Go to Workers & Pages → `boone-gifts-frontend` → Deployments
2. Find the last known-good version
3. Choose "Rollback" on it

This is instant — no rebuild needed, it re-points the Worker to a previously uploaded version.

Never roll back to a version older than the push-triggered build of `0fce699`: the builds Cloudflare started when the repo was connected ran with no variables (no API URL, no DSN, no release), so that app is broken.

While the old Pages project still exists, the cutover itself can be undone by moving `app.boone.gift` back to it — see the boone-gifts-frontend "Rollback" in `ops/docs/runbooks/frontend-workers-migration.md`.

### Via git

    git revert <bad-commit> && git push origin main

This triggers a new build and deploy with the revert.

## Environment variables

Set in Workers & Pages → `boone-gifts-frontend` → Settings → Build → **build** variables. Not Worker runtime variables: the bundle is static, so every value is fixed at build time, and the dashboard refuses runtime variables on an assets-only Worker anyway.

The README's "Deployment" table is the list of what to set and why: `NODE_VERSION`, `VITE_API_URL`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_URL` and `SENTRY_AUTH_TOKEN` (as a **secret**). Leave `SENTRY_ORG` and `SENTRY_PROJECT` unset; they default to `bugsinkhasnoorgs` and `boone-gifts-frontend`.

After changing any variable, merge to `main` for it to take effect.

The values themselves (DSN, upload token) live in the business vault; `ops/docs/runbooks/bugsink.md` says which entry holds each.

## Error reporting

Errors go to Bugsink through `@sentry/react`; the README's "Error reporting (Bugsink)" section is the reference. What matters operationally:

- **Release** is the commit SHA from `WORKERS_CI_COMMIT_SHA`, which Workers Builds sets on a push-triggered build.
- **Source maps** upload to `SENTRY_URL` only when `SENTRY_AUTH_TOKEN` is set; they are emitted hidden and deleted from `dist/` after upload, so none is published.
- **To test**, load `https://app.boone.gift/?test-error` and look for a `BugsinkTestError` in Bugsink.

## Dashboards

- **Cloudflare Worker:** `https://dash.cloudflare.com` → Workers & Pages → `boone-gifts-frontend`
- **Bugsink:** `https://bugsink.neuroticsasquat.ch` → `boone-gifts-frontend` project
