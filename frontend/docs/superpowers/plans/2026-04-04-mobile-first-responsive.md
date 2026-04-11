# Mobile-First Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend mobile-friendly with a hamburger side-drawer navigation and responsive gift list items that wrap instead of truncate.

**Architecture:** Two files change: `Layout.tsx` gets a hamburger button + side drawer (visible below `md`/768px, hidden at `md`+), and `ListDetail.tsx` gets responsive gift rows that stack vertically on small screens with price and action buttons in a bottom row. CSS-only approach using Tailwind responsive prefixes — no new dependencies.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-04-mobile-first-responsive-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/Layout.tsx` | Modify | Add hamburger button, side drawer, backdrop, responsive nav visibility |
| `src/components/Layout.test.tsx` | Create | Tests for hamburger visibility, drawer open/close, nav links in drawer |
| `src/pages/ListDetail.tsx` | Modify | Responsive gift rows (GiftInfo, OwnerGiftRow, ViewerGiftRow) |
| `src/pages/ListDetail.test.tsx` | Modify | Add tests for responsive layout classes |

---

### Task 1: Layout — Hamburger Menu & Side Drawer Tests

**Files:**
- Create: `src/components/Layout.test.tsx`

- [ ] **Step 1: Write tests for the responsive Layout**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "../contexts/AuthContext";
import { Layout } from "./Layout";

const API = "https://boone-gifts-api.localhost";

const token = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "user@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

function renderLayout() {
  server.use(
    http.post(`${API}/auth/refresh`, () =>
      HttpResponse.json({ access_token: token, token_type: "bearer" })
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div>Home Content</div>} />
              <Route path="/lists" element={<div>Lists Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("Layout", () => {
  it("renders hamburger menu button", async () => {
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    expect(hamburger).toBeInTheDocument();
  });

  it("opens drawer when hamburger is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    // Drawer becomes visible (has role="dialog" when open)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("renders nav links inside the drawer", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Lists");
    expect(dialog).toHaveTextContent("Connections");
    expect(dialog).toHaveTextContent("Collections");
  });

  it("renders user email and logout in drawer", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("user@test.com");
    const logoutButtons = screen.getAllByText("Logout");
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("closes drawer when close button is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close menu"));
    // Drawer is still in DOM but no longer has role="dialog"
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes drawer when backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    const hamburger = await screen.findByLabelText("Open menu");
    await user.click(hamburger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("drawer-backdrop"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders desktop nav links in the header", async () => {
    renderLayout();
    await screen.findByLabelText("Open menu");
    const nav = document.querySelector("nav");
    expect(nav).toHaveTextContent("Lists");
    expect(nav).toHaveTextContent("Connections");
    expect(nav).toHaveTextContent("Collections");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `task test-file -- src/components/Layout.test.tsx`
Expected: FAIL — hamburger button not found, no drawer in DOM.

---

### Task 2: Layout — Implement Hamburger Menu & Side Drawer

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Implement the responsive Layout with hamburger and drawer**

Replace the entire content of `src/components/Layout.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function Layout() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Boone Gifts
            </Link>
            <Link to="/lists" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Lists
            </Link>
            <Link to="/connections" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Connections
            </Link>
            <Link to="/collections" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Collections
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer backdrop — always in DOM for transition */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        data-testid="drawer-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer — always in DOM, slides via translate */}
      <div
        {...(drawerOpen ? { role: "dialog", "aria-modal": true } : {})}
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-gray-600 hover:text-gray-900"
            aria-label="Close menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col px-4 py-4 gap-4">
          <Link to="/lists" className="text-gray-600 hover:text-gray-900 py-2">
            Lists
          </Link>
          <Link to="/connections" className="text-gray-600 hover:text-gray-900 py-2">
            Connections
          </Link>
          <Link to="/collections" className="text-gray-600 hover:text-gray-900 py-2">
            Collections
          </Link>
          <hr className="border-gray-200" />
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="text-left text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

Key differences from the original Layout:
- Drawer and backdrop are always in the DOM (not conditionally rendered)
- Backdrop uses `opacity-0 pointer-events-none` when closed, `opacity-100` when open, with `transition-opacity duration-300`
- Drawer uses `translate-x-full` when closed, `translate-x-0` when open, with `transition-transform duration-300 ease-in-out`
- `role="dialog"` and `aria-modal` are only applied when open (spread conditionally)
- Close (X) button at top-right, no "Menu" title
- `useLocation` effect closes drawer on navigation

- [ ] **Step 2: Run tests to verify they pass**

Run: `task test-file -- src/components/Layout.test.tsx`
Expected: All 7 tests PASS.

- [ ] **Step 3: Run the full test suite**

Run: `task test`
Expected: All existing tests still pass.

---

### Task 3: GiftInfo — Remove Truncation, Responsive Price Tests

**Files:**
- Modify: `src/pages/ListDetail.test.tsx`

- [ ] **Step 1: Add tests for gift item responsive classes**

Add a new describe block to the end of `src/pages/ListDetail.test.tsx`:

```tsx
describe("Gift list item responsive layout", () => {
  const ownerListWithGift = {
    ...ownerListDetail,
    gifts: [
      { id: 10, name: "Test Gift", description: "A long description that should wrap", url: "https://example.com", price: "29.99" },
    ],
  };

  const viewerListWithGift = {
    ...viewerListDetail,
    gifts: [
      { id: 10, name: "Viewer Gift", description: "Viewer description", url: null, price: "15.00", claimed_by_id: null },
    ],
  };

  it("renders gift name without truncate class", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    const link = await screen.findByText("Test Gift");
    expect(link.className).not.toContain("truncate");
    expect(link.className).toContain("break-words");
  });

  it("renders gift name without URL using break-words", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
    );

    renderListDetail(viewerToken);

    const name = await screen.findByText("Viewer Gift");
    expect(name.tagName).toBe("P");
    expect(name.className).toContain("break-words");
  });

  it("renders gift description without truncate class", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    const desc = await screen.findByText("A long description that should wrap");
    expect(desc.className).not.toContain("truncate");
    expect(desc.className).toContain("break-words");
  });

  it("renders duplicate price in owner gift row for mobile", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListWithGift)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
    );

    renderListDetail(ownerToken);

    // Price appears twice (once in GiftInfo for desktop, once in row for mobile)
    const prices = await screen.findAllByText("$29.99");
    expect(prices.length).toBe(2);
  });

  it("renders duplicate price in viewer gift row for mobile", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(viewerListWithGift)),
    );

    renderListDetail(viewerToken);

    // Price appears twice (once in GiftInfo for desktop, once in row for mobile)
    const prices = await screen.findAllByText("$15.00");
    expect(prices.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `task test-file -- src/pages/ListDetail.test.tsx`
Expected: The 5 new tests FAIL (truncate still present, only one price element).

---

### Task 4: GiftInfo + Gift Rows — Implement Responsive Layout

**Files:**
- Modify: `src/pages/ListDetail.tsx:459-475` (GiftInfo)
- Modify: `src/pages/ListDetail.tsx:443-456` (OwnerGiftRow)
- Modify: `src/pages/ListDetail.tsx:685-691` (ViewerGiftRow)

- [ ] **Step 1: Update GiftInfo to remove truncation and hide price on mobile**

In `src/pages/ListDetail.tsx`, replace the `GiftInfo` function (lines 459-475):

Old:
```tsx
function GiftInfo({ name, description, url, price }: { name: string; description: string | null; url: string | null; price: string | null }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline truncate">
            {name}
          </a>
        ) : (
          <p className="font-semibold text-gray-900">{name}</p>
        )}
        {price && <span className="text-sm text-gray-500 shrink-0">${price}</span>}
      </div>
      {description && <p className="text-sm text-gray-500 truncate">{description}</p>}
    </div>
  );
}
```

New:
```tsx
function GiftInfo({ name, description, url, price }: { name: string; description: string | null; url: string | null; price: string | null }) {
  return (
    <div className="min-w-0 md:flex-1">
      <div className="flex items-baseline justify-between gap-3">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline break-words">
            {name}
          </a>
        ) : (
          <p className="font-semibold text-gray-900 break-words">{name}</p>
        )}
        {price && <span className="hidden md:inline text-sm text-gray-500 shrink-0">${price}</span>}
      </div>
      {description && <p className="text-sm text-gray-500 break-words">{description}</p>}
    </div>
  );
}
```

Changes:
- `flex-1` → `md:flex-1` (not needed in vertical stack on mobile)
- `truncate` → `break-words` on name link, name paragraph, and description
- Price span: added `hidden md:inline` to hide on mobile (rendered by parent row instead)

- [ ] **Step 2: Update OwnerGiftRow for responsive stacking**

In `src/pages/ListDetail.tsx`, replace the return JSX of `OwnerGiftRow` (lines 443-456):

Old:
```tsx
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex gap-2 shrink-0 ml-4">
        <button
          onClick={() => setEditing(true)}
          className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Edit
        </button>
        <DeleteGiftButton giftId={gift.id} listId={listId} queryClient={queryClient} />
      </div>
    </li>
  );
```

New:
```tsx
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 md:ml-4">
        {gift.price && <span className="text-sm text-gray-500 md:hidden">${gift.price}</span>}
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Edit
          </button>
          <DeleteGiftButton giftId={gift.id} listId={listId} queryClient={queryClient} />
        </div>
      </div>
    </li>
  );
```

Changes:
- `li`: `flex` → `flex flex-col gap-2 md:flex-row md:items-center md:justify-between` (stack on mobile, row on desktop)
- Buttons wrapper: added `items-center justify-between md:justify-end` for mobile bottom row layout
- Added mobile-only price (`md:hidden`) in the bottom row
- Wrapped edit/delete buttons in an inner div to keep them grouped on the right

- [ ] **Step 3: Update ViewerGiftRow for responsive stacking**

In `src/pages/ListDetail.tsx`, replace the return JSX of `ViewerGiftRow` (lines 685-691):

Old:
```tsx
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="shrink-0 ml-4">{claimButton}</div>
    </li>
  );
```

New:
```tsx
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <GiftInfo name={gift.name} description={gift.description} url={gift.url} price={gift.price} />
      <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 md:ml-4">
        {gift.price && <span className="text-sm text-gray-500 md:hidden">${gift.price}</span>}
        {claimButton}
      </div>
    </li>
  );
```

Changes:
- Same vertical stack pattern as OwnerGiftRow
- Mobile-only price in the bottom row alongside the claim button

- [ ] **Step 4: Run the new tests**

Run: `task test-file -- src/pages/ListDetail.test.tsx`
Expected: All tests PASS, including the 5 new responsive tests.

- [ ] **Step 5: Run the full test suite**

Run: `task test`
Expected: All tests pass.

---

### Task 5: Manual Verification

- [ ] **Step 1: Verify the app loads and looks correct**

Run: `task up` (if not already running)

Open `https://boone-gifts.localhost` in a browser. Verify:
1. At full width (>768px): nav bar shows all links, email, logout — same as before
2. Resize below 768px: hamburger icon appears, nav links and email/logout disappear from header
3. Click hamburger: drawer slides in from right with nav links, email, logout
4. Click a nav link in drawer: drawer closes, page navigates
5. Click backdrop: drawer closes
6. Gift list items at full width: horizontal layout with price and buttons on the right
7. Gift list items below 768px: name/description wrap, price and buttons in a bottom row
8. Long gift names and descriptions wrap instead of being truncated at any width
