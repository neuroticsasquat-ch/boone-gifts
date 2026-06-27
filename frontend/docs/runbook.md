# Frontend Deploy & Operations Runbook

## Architecture

- **Host:** Cloudflare Pages
- **Runtime:** Static SPA (React + Vite build)
- **Auto-deploy:** Push to `main` triggers Cloudflare Pages build and deploy
- **Domain:** `app.boone.gift`
- **Monitoring:** Sentry (error tracking)

## Deploy

Push to `main`. Cloudflare Pages detects the push, runs `npm ci` then the build command, and deploys the output to its CDN.

The build command must inject the commit SHA as the Sentry release tag:

    VITE_GIT_SHA=$CF_PAGES_COMMIT_SHA npm run build

(`npm run build` is `tsc -b && vite build`; `CF_PAGES_COMMIT_SHA` is provided
automatically by Cloudflare Pages.) Tagging the release lets Sentry tie errors and
the uploaded source maps to a specific deploy. Source maps are uploaded to Sentry at
build time and then deleted from the output, so they are never served on the CDN.

No manual steps required for a standard deploy once the build command is set.

### Verify a deploy

Open `https://app.boone.gift` in a browser. Check that the app loads and login works.

### Trigger a manual redeploy

In the Cloudflare dashboard: Pages → boone-gifts project → Deployments → latest production deploy → three-dot menu → "Retry deployment".

Useful when you change environment variables (they only take effect on the next build).

## Rollback

### Via Cloudflare dashboard

1. Go to Pages → boone-gifts project → Deployments
2. Find the last known-good production deployment
3. Click the three-dot menu → "Rollback to this deploy"

This is instant — no rebuild needed, it just re-points the domain to a previous build artifact.

### Via git

    git revert <bad-commit> && git push origin main

This triggers a new build and deploy with the revert.

## Environment variables

Set in Cloudflare Pages → Settings → Environment variables:

**Runtime (baked into the build via Vite):**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL (`https://api.boone.gift`) |
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking |
| `VITE_SENTRY_ENVIRONMENT` | Sentry environment tag |
| `VITE_GIT_SHA` | Sentry release tag — set in the build command via `$CF_PAGES_COMMIT_SHA` (see Deploy) |

**Build-time (used by plugins during build, not shipped to browser):**

| Variable | Purpose |
|---|---|
| `SENTRY_ORG` | Sentry org slug (for source map upload) |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Sentry auth token |

After changing any variable, trigger a redeploy for it to take effect.

## Dashboards

- **Cloudflare Pages:** `https://dash.cloudflare.com` → Pages → boone-gifts project
- **Sentry:** `https://sentry.io` → boone-gifts-frontend project
