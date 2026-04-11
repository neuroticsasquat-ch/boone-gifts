# Mobile-First Responsive Design

## Overview

Make the frontend mobile-friendly with two changes: a hamburger menu with side drawer for navigation on small screens, and responsive gift list item layout that wraps content instead of truncating.

## Breakpoint

All responsive changes use `md` (768px) as the threshold.

## 1. Hamburger Menu & Side Drawer

**File:** `src/components/Layout.tsx`

### Below `md`

- Header bar shows "Boone Gifts" logo (left) and a hamburger icon button (right).
- Nav links (Lists, Connections, Collections), user email, and logout button are hidden from the header.
- Tapping the hamburger opens a side drawer sliding in from the right.
- Drawer contents (top to bottom):
  - Close (X) button at the top-right
  - Nav links stacked vertically with full-width tap targets
  - Divider line
  - User email (text) and Logout button
- Semi-transparent backdrop overlay behind the drawer; tapping it closes the drawer.
- Drawer closes automatically on navigation (link click).
- State: `useState<boolean>` toggling open/closed.

### `md` and above

- No changes. Current horizontal nav layout with all links, email, and logout visible in the header bar.

## 2. Gift List Items — Responsive Layout

**File:** `src/pages/ListDetail.tsx`

### All widths

- Remove `truncate` class from gift name and description in `GiftInfo`. Add `break-words` (Tailwind: `break-words`) to prevent long unbroken strings from causing horizontal overflow.

### Below `md`

- Gift list items (`OwnerGiftRow`, `ViewerGiftRow`) use a vertical stack layout:
  - Top: gift name, description (from `GiftInfo`, without price)
  - Bottom row: price left-aligned, action buttons (edit/delete or claim/unclaim/claimed badge) right-aligned
- Price visibility: use CSS-only approach. The price `<span>` inside `GiftInfo` gets `hidden md:inline` to hide on mobile. Each parent row component renders a duplicate price element with `md:hidden` in its bottom row. This avoids changing `GiftInfo`'s prop signature.
- The `min-w-0 flex-1` on GiftInfo's root div should become `min-w-0 md:flex-1` since below `md` the item is a vertical stack and `flex-1` is not needed.

### `md` and above

- Current horizontal layout: `GiftInfo` (name, description, price inline) on the left, action buttons on the right.

### Out of scope for list items

- `EditGiftRow` (the inline edit form) already has its own responsive grid layout (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) and does not need changes.

## Implementation Details

### Icons

Use inline SVG for the hamburger (3 horizontal lines) and close (X) icons. No icon library — keeps the "no new dependencies" constraint.

### Drawer animation

Use CSS transitions: the drawer is always in the DOM but positioned off-screen with `translate-x-full`. On open, transition to `translate-x-0` with `transition-transform duration-300 ease-in-out`. The backdrop fades in with `transition-opacity duration-300`.

### Accessibility

- Hamburger button: `aria-label="Open menu"`, `aria-expanded={isOpen}`
- Close button: `aria-label="Close menu"`
- Drawer: `role="dialog"`, `aria-modal="true"`
- No focus trapping (out of scope for this iteration)

### Body scroll

Not locked when drawer is open (out of scope for this iteration).

## Components Affected

| Component | File | Change |
|-----------|------|--------|
| `Layout` | `src/components/Layout.tsx` | Hamburger + side drawer below `md` |
| `GiftInfo` | `src/pages/ListDetail.tsx` | Remove truncation, add break-words, responsive price visibility |
| `OwnerGiftRow` | `src/pages/ListDetail.tsx` | Vertical stack with bottom row below `md` |
| `ViewerGiftRow` | `src/pages/ListDetail.tsx` | Vertical stack with bottom row below `md` |

## Out of Scope

- No new files or dependencies
- No changes to other pages (Dashboard, Lists, Connections, Collections)
- No changes to routing, API calls, or data fetching
- `EditGiftRow` inline edit form (already responsive)
- Focus trapping and body scroll locking (future iteration)
