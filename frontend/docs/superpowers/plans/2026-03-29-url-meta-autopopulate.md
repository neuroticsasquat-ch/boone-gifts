# URL Metadata Auto-Population — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate gift name, description, and price from a URL's meta tags when adding a gift to a list.

**Architecture:** A new backend endpoint (`GET /meta`) fetches an external URL server-side, parses HTML meta tags (Open Graph, standard meta, title), and returns extracted fields. The frontend's AddGiftForm is updated to debounce URL input and call this endpoint, populating empty fields from the response. All fields remain always visible — URL just moves to first position.

**Tech Stack:** Backend: FastAPI, httpx, stdlib html.parser. Frontend: React 19, TanStack Query, Axios.

**Spec:** `docs/superpowers/specs/2026-03-29-url-meta-autopopulate-design.md`

**IMPORTANT:** Do NOT run any git commands that change repo state (no git add, commit, reset, push). Only edit code files and run tests.

**Backend test command:** `cd /app/boone-gifts-backend && python -m pytest tests/ -v`
**Backend test single file:** `cd /app/boone-gifts-backend && python -m pytest tests/routers/test_meta.py -v`
**Frontend test command:** `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`
**Frontend test single file:** `cd /app/boone-gifts-frontend && npx vitest run src/pages/ListDetail.test.tsx --reporter=verbose`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `pyproject.toml` | Move httpx from dev to main dependencies |
| Create | `app/schemas/meta.py` | `UrlMetaResponse` schema |
| Create | `app/routers/meta.py` | `GET /meta` endpoint with HTML parser and SSRF protection |
| Modify | `app/main.py` | Include meta router |
| Create | `tests/routers/test_meta.py` | Backend endpoint tests |
| Create | `src/api/meta.ts` | `fetchUrlMeta` API function |
| Modify | `src/types/index.ts` | Add `UrlMeta` interface |
| Modify | `src/pages/ListDetail.tsx` | Update AddGiftForm — URL first, debounced auto-populate |
| Modify | `src/pages/ListDetail.test.tsx` | Add AddGiftForm auto-populate tests |

---

### Task 1: Move httpx to runtime dependencies

**Files:**
- Modify: `pyproject.toml`

httpx is currently a dev-only dependency (used for pytest). The meta endpoint needs it at runtime.

- [ ] **Step 1: Move httpx from dev to main dependencies**

In `pyproject.toml`, add `"httpx>=0.28.1"` to the `dependencies` list and remove it from the `[dependency-groups] dev` list.

The result should be:

```toml
[project]
name = "boone-gifts-backend"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0.128.5",
    "uvicorn>=0.40.0",
    "sqlalchemy>=2.0.46",
    "pydantic>=2.12.5",
    "pydantic-settings>=2.12.0",
    "pyjwt>=2.11.0",
    "bcrypt>=5.0.0",
    "alembic>=1.18.3",
    "httpx>=0.28.1",
]

[tool.pytest.ini_options]
filterwarnings = [
    "ignore::jwt.warnings.InsecureKeyLengthWarning",
]

[dependency-groups]
dev = [
    "pytest>=9.0.2",
]
```

- [ ] **Step 2: Sync the lock file**

Run:
```bash
cd /app/boone-gifts-backend && uv lock
```

- [ ] **Step 3: Verify existing tests still pass**

Run:
```bash
cd /app/boone-gifts-backend && python -m pytest tests/ -v
```
Expected: all 136 tests pass.

---

### Task 2: Backend meta endpoint — schema, router, and registration

**Files:**
- Create: `app/schemas/meta.py`
- Create: `app/routers/meta.py`
- Modify: `app/main.py`
- Create: `tests/routers/test_meta.py`

**Reference files:**
- `app/routers/gifts.py` — router pattern (prefix, tags, dependencies)
- `app/schemas/gift.py` — schema pattern
- `app/dependencies.py` — `CurrentUser` dependency
- `tests/routers/test_gifts.py` — test pattern (client, headers fixtures)

- [ ] **Step 1: Write the test file**

Create `tests/routers/test_meta.py`:

```python
from unittest.mock import patch, MagicMock

import httpx


def _mock_html_response(html: str, content_type: str = "text/html; charset=utf-8") -> MagicMock:
    """Create a mock httpx.Response with the given HTML body."""
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": content_type}
    mock_resp.text = html
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


OG_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Cool Gadget" />
    <meta property="og:description" content="A very cool gadget for everyone" />
    <meta property="product:price:amount" content="29.99" />
    <meta property="og:image" content="https://example.com/image.jpg" />
    <title>Cool Gadget - Example Store</title>
</head>
<body></body>
</html>
"""

BASIC_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Basic Page Title</title>
    <meta name="description" content="A basic page description" />
</head>
<body></body>
</html>
"""

EMPTY_HTML = """
<!DOCTYPE html>
<html>
<head></head>
<body><p>No meta tags here</p></body>
</html>
"""

OG_PRICE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Widget" />
    <meta property="og:price:amount" content="9.99" />
</head>
<body></body>
</html>
"""


def test_meta_with_og_tags(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", return_value=_mock_html_response(OG_HTML)):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/product"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Cool Gadget"
    assert data["description"] == "A very cool gadget for everyone"
    assert data["price"] == "29.99"
    assert data["image"] == "https://example.com/image.jpg"


def test_meta_with_basic_html_tags(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", return_value=_mock_html_response(BASIC_HTML)):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/page"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Basic Page Title"
    assert data["description"] == "A basic page description"
    assert data["price"] is None
    assert data["image"] is None


def test_meta_with_no_relevant_tags(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", return_value=_mock_html_response(EMPTY_HTML)):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/empty"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] is None
    assert data["description"] is None
    assert data["price"] is None
    assert data["image"] is None


def test_meta_og_price_fallback(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", return_value=_mock_html_response(OG_PRICE_HTML)):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/widget"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["price"] == "9.99"


def test_meta_non_html_content_type(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", return_value=_mock_html_response('{"key": "value"}', "application/json")):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/api.json"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] is None
    assert data["description"] is None
    assert data["price"] is None
    assert data["image"] is None


def test_meta_invalid_url_scheme(client, member_headers):
    response = client.get(
        "/meta",
        params={"url": "ftp://example.com/file"},
        headers=member_headers,
    )
    assert response.status_code == 400


def test_meta_private_ip(client, member_headers):
    response = client.get(
        "/meta",
        params={"url": "http://127.0.0.1/secret"},
        headers=member_headers,
    )
    assert response.status_code == 400


def test_meta_unauthenticated(client):
    response = client.get("/meta", params={"url": "https://example.com"})
    assert response.status_code == 403


def test_meta_fetch_failure(client, member_headers):
    with patch("app.routers.meta._resolve_and_validate_url"):
        with patch("app.routers.meta._fetch_url", side_effect=Exception("Connection failed")):
            response = client.get(
                "/meta",
                params={"url": "https://example.com/down"},
                headers=member_headers,
            )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] is None
    assert data["description"] is None
    assert data["price"] is None
    assert data["image"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /app/boone-gifts-backend && python -m pytest tests/routers/test_meta.py -v`

Expected: FAIL — module `app.routers.meta` does not exist.

- [ ] **Step 3: Create the schema**

Create `app/schemas/meta.py`:

```python
from pydantic import BaseModel


class UrlMetaResponse(BaseModel):
    title: str | None = None
    description: str | None = None
    price: str | None = None
    image: str | None = None
```

- [ ] **Step 4: Create the router**

Create `app/routers/meta.py`:

```python
import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import CurrentUser
from app.schemas.meta import UrlMetaResponse

router = APIRouter(prefix="/meta", tags=["meta"])

_USER_AGENT = "Mozilla/5.0 (compatible; BooneGifts/1.0)"
_TIMEOUT = 5.0

# Private/reserved IP networks to block (SSRF protection)
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fd00::/8"),
]


class _StopParsing(Exception):
    pass


class _MetaParser(HTMLParser):
    """Parses <head> for meta tags and <title>."""

    def __init__(self):
        super().__init__()
        self.og: dict[str, str] = {}
        self.meta_name: dict[str, str] = {}
        self.title_text: str | None = None
        self._in_title = False
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
            self._title_parts = []
            return

        if tag == "meta":
            attr_dict = {k.lower(): v for k, v in attrs if v is not None}
            content = attr_dict.get("content")
            if content is None:
                return

            prop = attr_dict.get("property", "").lower()
            if prop:
                self.og[prop] = content

            name = attr_dict.get("name", "").lower()
            if name:
                self.meta_name[name] = content

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
            self.title_text = "".join(self._title_parts).strip() or None
        if tag == "head":
            raise _StopParsing()

    def extract(self) -> UrlMetaResponse:
        title = self.og.get("og:title") or self.title_text
        description = self.og.get("og:description") or self.meta_name.get("description")
        price = self.og.get("product:price:amount") or self.og.get("og:price:amount")
        image = self.og.get("og:image")
        return UrlMetaResponse(
            title=title, description=description, price=price, image=image
        )


def _resolve_and_validate_url(url: str) -> None:
    """Resolve hostname and check against private IP ranges."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL.")
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not resolve hostname."
        )
    for _, _, _, _, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="URLs pointing to private networks are not allowed.",
                )


def _fetch_url(url: str) -> httpx.Response:
    """Fetch a URL with httpx. Separated for testability."""
    with httpx.Client(
        timeout=_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        return client.get(url)


def _parse_html(html: str) -> UrlMetaResponse:
    """Parse HTML and extract meta tag values."""
    parser = _MetaParser()
    try:
        parser.feed(html)
    except _StopParsing:
        pass
    return parser.extract()


@router.get("", response_model=UrlMetaResponse)
def get_url_meta(user: CurrentUser, url: str = Query(...)) -> UrlMetaResponse:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL must use http or https."
        )

    _resolve_and_validate_url(url)

    try:
        response = _fetch_url(url)
        response.raise_for_status()
    except Exception:
        return UrlMetaResponse()

    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type:
        return UrlMetaResponse()

    return _parse_html(response.text)
```

- [ ] **Step 5: Register the router in app/main.py**

In `app/main.py`, add the import and include. After the existing line:

```python
from app.routers import auth, users, invites, lists, gifts, list_shares, connections, collections
```

Change it to:

```python
from app.routers import auth, users, invites, lists, gifts, list_shares, connections, collections, meta
```

And after the existing `application.include_router(collections.router)` line, add:

```python
    application.include_router(meta.router)
```

- [ ] **Step 6: Run the meta tests**

Run: `cd /app/boone-gifts-backend && python -m pytest tests/routers/test_meta.py -v`

Expected: all 9 tests PASS.

- [ ] **Step 7: Run full backend test suite**

Run: `cd /app/boone-gifts-backend && python -m pytest tests/ -v`

Expected: all tests pass (136 existing + 9 new = 145).

---

### Task 3: Frontend — API function and type

**Files:**
- Create: `src/api/meta.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the UrlMeta type**

Add to the end of `src/types/index.ts`:

```typescript
// URL Metadata
export interface UrlMeta {
  title: string | null;
  description: string | null;
  price: string | null;
  image: string | null;
}
```

- [ ] **Step 2: Create the API function**

Create `src/api/meta.ts`:

```typescript
import { apiClient } from "./client";
import type { UrlMeta } from "../types";

export async function fetchUrlMeta(url: string): Promise<UrlMeta> {
  const response = await apiClient.get<UrlMeta>("/meta", { params: { url } });
  return response.data;
}
```

- [ ] **Step 3: Run existing frontend tests to verify no regressions**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all 34 existing tests pass.

---

### Task 4: Frontend — Update AddGiftForm with URL auto-populate

**Files:**
- Modify: `src/pages/ListDetail.tsx` (the `AddGiftForm` component, lines 236-313)
- Modify: `src/pages/ListDetail.test.tsx` (add new tests)

**Reference:**
- Current `AddGiftForm` component in `src/pages/ListDetail.tsx:236-313`
- Existing `ListDetail.test.tsx` — test patterns with MSW + AuthProvider

- [ ] **Step 1: Add tests for auto-populate behavior**

Append the following new `describe` block to `src/pages/ListDetail.test.tsx`, after the existing `describe("ListDetail Sharing Section", ...)` block:

```tsx
describe("AddGiftForm URL Auto-Populate", () => {
  it("populates fields from URL metadata", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () =>
        HttpResponse.json({
          title: "Cool Gadget",
          description: "A very cool gadget",
          price: "29.99",
          image: null,
        })
      ),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("URL")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("URL"), "https://example.com/product");

    // Wait for debounce + fetch to populate fields
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Name *")).toHaveValue("Cool Gadget");
    });
    expect(screen.getByPlaceholderText("Description")).toHaveValue("A very cool gadget");
    expect(screen.getByPlaceholderText("Price")).toHaveValue("29.99");
  });

  it("does not overwrite user-entered values", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () =>
        HttpResponse.json({
          title: "From Meta",
          description: "Meta description",
          price: "9.99",
          image: null,
        })
      ),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Name *")).toBeInTheDocument();
    });

    // User types a name first
    await userEvent.type(screen.getByPlaceholderText("Name *"), "My Custom Name");

    // Then enters a URL
    await userEvent.type(screen.getByPlaceholderText("URL"), "https://example.com/product");

    // Wait for debounce + fetch
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Description")).toHaveValue("Meta description");
    });

    // Name should NOT be overwritten
    expect(screen.getByPlaceholderText("Name *")).toHaveValue("My Custom Name");
  });

  it("handles fetch failure gracefully", async () => {
    server.use(
      http.get(`${API}/lists/1`, () => HttpResponse.json(ownerListDetail)),
      http.get(`${API}/connections`, () => HttpResponse.json([])),
      http.get(`${API}/lists/1/shares`, () => HttpResponse.json([])),
      http.get(`${API}/meta`, () => HttpResponse.error()),
    );

    renderListDetail(ownerToken);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("URL")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("URL"), "https://example.com/broken");

    // Wait for the "Fetching…" indicator to appear (debounce fired) then disappear (fetch completed/failed)
    await waitFor(() => {
      expect(screen.queryByText("Fetching…")).not.toBeInTheDocument();
    }, { timeout: 2000 });

    // Fields should remain empty — no error shown
    expect(screen.getByPlaceholderText("Name *")).toHaveValue("");
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/ListDetail.test.tsx --reporter=verbose`

Expected: the new auto-populate tests FAIL (existing sharing tests still pass).

- [ ] **Step 3: Update the AddGiftForm component**

Replace the `AddGiftForm` component in `src/pages/ListDetail.tsx` (lines 236-313, from `function AddGiftForm` through the closing `}` of its return statement). Add the import for `fetchUrlMeta` at the top of the file alongside the other imports, and add `useRef, useEffect` to the React import.

Add to the existing React import (line 1):

```tsx
import { useState, useRef, useEffect, type FormEvent } from "react";
```

Add a new import after the existing API imports:

```tsx
import { fetchUrlMeta } from "../api/meta";
```

Replace the entire `AddGiftForm` function with the following. Note: refs are used alongside state for name/description/price so the debounced callback can check the *current* field values (not stale closure values) when deciding whether to auto-populate.

```tsx
function AddGiftForm({
  listId,
  queryClient,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const nameRef = useRef("");
  const descriptionRef = useRef("");
  const priceRef = useRef("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string; url?: string; price?: string }) =>
      createGift(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setUrl("");
      setName("");
      setDescription("");
      setPrice("");
      nameRef.current = "";
      descriptionRef.current = "";
      priceRef.current = "";
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateName(value: string) {
    setName(value);
    nameRef.current = value;
  }

  function updateDescription(value: string) {
    setDescription(value);
    descriptionRef.current = value;
  }

  function updatePrice(value: string) {
    setPrice(value);
    priceRef.current = value;
  }

  function handleUrlChange(value: string) {
    setUrl(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.startsWith("http://") && !value.startsWith("https://")) return;

    const currentFetchId = ++fetchIdRef.current;

    debounceRef.current = setTimeout(async () => {
      setIsFetching(true);
      try {
        const meta = await fetchUrlMeta(value);
        if (fetchIdRef.current !== currentFetchId) return;
        if (meta.title && !nameRef.current) updateName(meta.title);
        if (meta.description && !descriptionRef.current) updateDescription(meta.description);
        if (meta.price && !priceRef.current) updatePrice(meta.price);
      } catch {
        // Best-effort — ignore failures
      } finally {
        if (fetchIdRef.current === currentFetchId) setIsFetching(false);
      }
    }, 500);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      url: url || undefined,
      price: price || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Add a gift</h2>
      {mutation.isError && <p className="text-sm text-red-600 mb-2">Failed to add gift.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <input
            type="url"
            placeholder="URL"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {isFetching && (
            <span className="absolute right-2 top-2 text-xs text-gray-400">Fetching…</span>
          )}
        </div>
        <input
          type="text"
          placeholder="Name *"
          value={name}
          onChange={(e) => updateName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => updateDescription(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Price"
            value={price}
            onChange={(e) => updatePrice(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {mutation.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run ListDetail tests**

Run: `cd /app/boone-gifts-frontend && npx vitest run src/pages/ListDetail.test.tsx --reporter=verbose`

Expected: all tests PASS (5 existing sharing + 3 new auto-populate = 8).

- [ ] **Step 5: Run full frontend test suite**

Run: `cd /app/boone-gifts-frontend && npx vitest run --reporter=verbose`

Expected: all tests pass (34 existing + 3 new = 37).
