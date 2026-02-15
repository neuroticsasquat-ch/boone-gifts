# Boone Gifts Frontend

## Overview
React SPA frontend for the Boone Gifts platform. TypeScript, runs entirely in Docker (no host node_modules).

## Architecture
- **Toolchain**: Vite with React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7 (library/SPA mode)
- **Data fetching**: TanStack Query v5 + Axios
- **Auth**: JWT tokens stored in memory (React context), Axios interceptors handle token refresh
- **Task runner**: Taskfile.yaml
- **Testing**: Vitest + React Testing Library + MSW

## Development Workflow
```
task app:up          # Build image and start container (detached, idle)
task app:run         # Start Vite dev server
task app:build       # Production build
task app:test        # Run test suite (Vitest)
task app:test-file -- <path>  # Run a specific test file
task app:test-watch  # Run tests in watch mode
task app:stop        # Stop container without removing
task app:down        # Stop and remove container
```

## Dependency Management
```
task app:add -- <package>      # Install a package
task app:remove -- <package>   # Remove a package
```

## Project Structure
```
Dockerfile           # node:22-slim, npm ci, idles
docker-compose.yml   # App service on proxy network with Traefik labels
Taskfile.yaml        # All dev commands under app: namespace
index.html           # Vite entry HTML
vite.config.ts       # Vite + Tailwind + Vitest config
src/
  main.tsx           # React DOM entry point
  App.tsx            # Providers (QueryClient, Auth, Router)
  index.css          # Tailwind import
  routes.tsx         # Route definitions
  api/
    client.ts        # Axios instance with JWT interceptors
    auth.ts          # Auth API functions (login, register, refresh)
    lists.ts         # Gift list API functions
    gifts.ts         # Gift API functions (CRUD + claim/unclaim)
    connections.ts   # Connections API functions
    shares.ts        # Shares API functions
    collections.ts   # Collections API functions
  contexts/
    AuthContext.tsx   # Auth state provider (tokens + user in memory)
  hooks/
    useAuth.ts       # Auth context hook
  components/
    Layout.tsx       # App shell (nav + outlet)
    ProtectedRoute.tsx  # Auth guard for routes
  pages/
    Login.tsx        # Login form
    Register.tsx     # Registration form (invite token required)
    Dashboard.tsx    # Home page (placeholder)
    Lists.tsx        # Gift lists page (placeholder)
    ListDetail.tsx   # Single list view (placeholder)
    Connections.tsx  # Connections page (placeholder)
    Collections.tsx  # Collections page (placeholder)
    CollectionDetail.tsx  # Single collection view (placeholder)
  types/
    index.ts         # TypeScript types matching backend Pydantic schemas
  test/
    setup.ts         # Vitest setup (Testing Library + MSW)
    mocks/
      handlers.ts    # MSW default handlers
      server.ts      # MSW server instance
```

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (e.g., `https://boone-gifts-api.localhost`) |

## Testing
- 10 tests: 1 App smoke + 4 API client + 3 AuthContext + 2 ProtectedRoute
- Tests run inside the Docker container via `task app:test`

## Key Design Decisions
- **`node_modules` in a named Docker volume** — survives the bind mount (`.:/app`)
- **JWT tokens in memory only** — not in localStorage (XSS protection). Closing the tab logs you out.
- **Axios interceptors handle token refresh** — 401 triggers silent refresh and request retry. Failed queue mechanism handles concurrent requests during refresh.
- **API functions are plain async functions** — no custom hooks wrapping each query (YAGNI). TanStack Query calls them directly in queryFn/mutationFn.
- **Vite HMR configured for Traefik** — WebSocket connects via wss on port 443 (clientPort)
