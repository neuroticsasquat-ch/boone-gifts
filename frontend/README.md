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
| `VITE_SENTRY_DSN` | Leave empty to disable Sentry locally |
| `SENTRY_AUTH_TOKEN` | Build-time only, for source map upload |

## Testing

```
task test
```

~215 tests across 26 files, run in jsdom with MSW mocking the API. The mock handlers pin the API origin, so they're unaffected by whatever `VITE_API_URL` your `.env` sets.
