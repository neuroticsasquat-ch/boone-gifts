import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { apiClient, setTokens, getTokens, clearTokens } from "../api/client";

describe("apiClient", () => {
  beforeEach(() => {
    clearTokens();
  });

  it("attaches the access token to requests", async () => {
    setTokens("test-access-token", "test-refresh-token");

    let capturedAuth = "";
    server.use(
      http.get("https://boone-gifts-api.localhost/test", ({ request }) => {
        capturedAuth = request.headers.get("Authorization") ?? "";
        return HttpResponse.json({ ok: true });
      })
    );

    await apiClient.get("/test");
    expect(capturedAuth).toBe("Bearer test-access-token");
  });

  it("sends requests without token when not authenticated", async () => {
    let capturedAuth: string | null = "";
    server.use(
      http.get("https://boone-gifts-api.localhost/test", ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      })
    );

    await apiClient.get("/test");
    expect(capturedAuth).toBeNull();
  });

  it("refreshes the token on 401 and retries", async () => {
    setTokens("expired-token", "valid-refresh-token");

    let attempt = 0;
    server.use(
      http.get("https://boone-gifts-api.localhost/test", () => {
        attempt++;
        if (attempt === 1) {
          return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({
          access_token: "new-access-token",
          token_type: "bearer",
        });
      })
    );

    const response = await apiClient.get("/test");
    expect(response.data).toEqual({ ok: true });
    expect(getTokens().accessToken).toBe("new-access-token");
  });

  it("clears tokens when refresh fails", async () => {
    setTokens("expired-token", "expired-refresh-token");

    server.use(
      http.get("https://boone-gifts-api.localhost/test", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }),
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      })
    );

    await expect(apiClient.get("/test")).rejects.toThrow();
    expect(getTokens().accessToken).toBeNull();
  });
});
