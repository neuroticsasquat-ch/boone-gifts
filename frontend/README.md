# Boone Gifts Frontend

React SPA for the Boone Gifts platform — a gift list and wishlist app where users create lists, share them with connections, and claim gifts.

## Tech Stack

- **React 19** / **TypeScript** / **Vite**
- **Tailwind CSS v4** (styling)
- **React Router v7** (routing)
- **TanStack Query v5** + **Axios** (data fetching)
- **Vitest** + **React Testing Library** + **MSW** (testing)
- **Docker Compose** + **Traefik** (reverse proxy)

## Prerequisites

- Docker Desktop
- [go-task](https://taskfile.dev/)
- A running Traefik instance on the external `proxy` Docker network
- The [Boone Gifts Backend](../boone-gifts-backend) running

## Setup

1. Clone the repo and copy the environment template:

   ```
   cp .env.example .env
   ```

2. Add `https://boone-gifts.localhost` to the backend's `APP_CORS_ORIGINS` in its `.env`.

3. Build and start the container:

   ```
   task app:up
   ```

4. Start the dev server:

   ```
   task app:run
   ```

The app is available at `https://boone-gifts.localhost` (via Traefik).

## Development

```
task app:up              # Build image and start container
task app:run             # Start Vite dev server
task app:build           # Production build
task app:test            # Run test suite
task app:test-file -- <path>  # Run a specific test file
task app:test-watch      # Run tests in watch mode
task app:add -- <pkg>    # Install a package
task app:remove -- <pkg> # Remove a package
```
