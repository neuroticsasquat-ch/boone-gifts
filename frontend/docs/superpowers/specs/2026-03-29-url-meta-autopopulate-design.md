# URL Metadata Auto-Population — Design Spec

## Overview

When adding a gift to a list, the user can enter a URL and the system automatically fetches metadata (title, description, price) from that page to pre-populate the gift fields. This requires a backend proxy endpoint (to avoid browser CORS restrictions) and an updated frontend form with the URL field first.

## Design Decisions

- **Backend proxy required** — browsers can't fetch arbitrary URLs cross-origin. The backend fetches the page server-side and extracts meta tags.
- **Authenticated endpoint** — consistent with the rest of the API, prevents abuse as an open proxy.
- **SSRF mitigation** — block requests to private/reserved IP ranges. Resolve the hostname before fetching and check the resolved IP against a blocklist (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fd00::/8).
- **Debounce on input** — auto-fetches after 500ms of no typing (no explicit "Fetch" button).
- **Best-effort metadata** — if fetch fails or tags are missing, fields stay empty. No error shown to user. Loading indicator disappears on completion (success or failure).
- **All fields always visible** — URL field moves to first position, but name/description/price remain visible at all times. No hidden states, no progressive disclosure. Auto-populate fills in empty fields only; user can always override.
- **Image extracted but not used yet** — included in the response for a future feature, frontend ignores it for now.
- **httpx as runtime dependency** — currently in dev dependencies only (used for tests). Must be moved to main dependencies for the meta endpoint.
- **Character encoding** — `httpx` decodes using the Content-Type charset header (or defaults to UTF-8). Pages that declare encoding only via `<meta charset>` in the HTML body may decode incorrectly. This is a known limitation accepted for simplicity.

## Backend: `GET /meta` Endpoint

### Router: `app/routers/meta.py`

New router with a single endpoint. Prefix: `/meta`.

```
GET /meta?url=https://example.com/product
```

**Auth:** Requires `CurrentUser` (authenticated).

**Query parameter:** `url` (required string) — the URL to fetch metadata from.

**Validation:**
- URL must start with `http://` or `https://`. Otherwise return 400.
- Resolve the hostname to an IP address. If the resolved IP is in a private/reserved range, return 400. This prevents SSRF attacks targeting internal services or cloud metadata endpoints.

**Fetching:**
- Uses `httpx.Client` (sync — the app is sync throughout) to GET the URL.
- Timeout: 5 seconds.
- User-Agent: `Mozilla/5.0 (compatible; BooneGifts/1.0)`.
- `follow_redirects=True` (httpx defaults to `False`, must be set explicitly).
- If the request fails (timeout, connection error, non-2xx status), return 200 with all null fields.
- If the response Content-Type is not HTML (doesn't contain `text/html`), return 200 with all null fields.

**Parsing:**
Extract from the HTML, in priority order:

| Field | Priority 1 | Priority 2 |
|-------|-----------|-----------|
| title | `og:title` meta tag | `<title>` tag |
| description | `og:description` meta tag | `meta[name=description]` |
| price | `product:price:amount` meta tag | `og:price:amount` meta tag |
| image | `og:image` meta tag | — |

Use Python's stdlib `html.parser.HTMLParser` to parse. The parser only needs to look at `<meta>` tags (property/name/content attributes) and the `<title>` tag's text content. To avoid parsing large HTML bodies, raise a custom `StopParsing` exception from `handle_endtag` when `</head>` is encountered, and catch it in the caller.

**Response schema:** `UrlMetaResponse`

```python
class UrlMetaResponse(BaseModel):
    title: str | None = None
    description: str | None = None
    price: str | None = None
    image: str | None = None
```

**Response:** Always 200 with the schema above. Fields are null when not found. The only error case is 400 for an invalid URL scheme or a private IP.

### Schema: `app/schemas/meta.py`

Contains `UrlMetaResponse` only.

### Registration

Add `from app.routers import meta` and `application.include_router(meta.router)` in `app/main.py`.

## Frontend: Updated AddGiftForm

### Current State

The `AddGiftForm` in `src/pages/ListDetail.tsx` is a single-row form: Name*, Description, URL, Price, Add button. All fields always visible.

### New Layout

All fields remain always visible. The only changes:

1. **URL field moves to first position** — the field order becomes: URL, Name*, Description, Price, Add button.
2. **Auto-populate on URL entry** — when the user types/pastes a URL and 500ms passes without further input, the frontend calls `GET /meta?url=...`. A small "Fetching…" indicator appears next to the URL field during the request. On response, any empty name/description/price fields are populated from the metadata. The indicator disappears on completion (success or failure). If the fetch fails or returns nulls, nothing happens — fields stay as-is.
3. **Only populate empty fields** — if the user has already typed a name, the auto-populated title doesn't overwrite it.

### Debounce Behavior

- 500ms debounce on the URL input's `onChange`.
- Only trigger the fetch if the value starts with `http://` or `https://`.
- If the URL changes again before the debounce fires, reset the timer.
- If a fetch is already in-flight when a new debounce triggers, ignore the stale response.

### API Function: `src/api/meta.ts`

```typescript
export async function fetchUrlMeta(url: string): Promise<UrlMeta> {
  const response = await apiClient.get<UrlMeta>("/meta", { params: { url } });
  return response.data;
}
```

### Type: `UrlMeta`

Add to `src/types/index.ts`:

```typescript
export interface UrlMeta {
  title: string | null;
  description: string | null;
  price: string | null;
  image: string | null;
}
```

## Testing

### Backend Tests: `tests/routers/test_meta.py`

Mock the external HTTP call using `unittest.mock.patch` on `httpx.Client.get` (or the specific fetch function). Do not make real HTTP requests in tests.

Test cases:
- **Valid URL with OG tags** — returns parsed title, description, price, image.
- **Valid URL with only basic HTML tags** — falls back to `<title>` and `meta[name=description]`.
- **Valid URL with no relevant tags** — returns all null fields.
- **Non-HTML Content-Type** — returns all null fields (e.g., URL returns `application/json`).
- **Invalid URL scheme** (e.g., `ftp://...`) — returns 400.
- **Private IP URL** (e.g., `http://127.0.0.1/`) — returns 400.
- **Unauthenticated request** — returns 401.
- **Fetch failure** (timeout, connection error) — returns 200 with all null fields.

### Frontend Tests: `src/pages/ListDetail.test.tsx`

Add tests for the updated AddGiftForm (extend existing test file):

- **URL triggers metadata fetch and populates fields** — enter URL, wait for debounce, verify name/description fields populated from meta response.
- **Does not overwrite user-entered values** — type a name first, then enter URL, verify name is unchanged after meta fetch.
- **Fetch failure leaves fields empty** — mock a failed meta fetch, verify fields remain empty without error.

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/routers/meta.py` | Create | Meta endpoint with HTML parser and SSRF protection |
| `app/schemas/meta.py` | Create | `UrlMetaResponse` schema |
| `app/main.py` | Modify | Include meta router |
| `pyproject.toml` | Modify | Move httpx from dev to main dependencies |
| `tests/routers/test_meta.py` | Create | Backend meta endpoint tests |
| `src/api/meta.ts` | Create | `fetchUrlMeta` API function |
| `src/types/index.ts` | Modify | Add `UrlMeta` interface |
| `src/pages/ListDetail.tsx` | Modify | Update AddGiftForm — URL first, debounced auto-populate |
| `src/pages/ListDetail.test.tsx` | Modify | Add AddGiftForm tests |
