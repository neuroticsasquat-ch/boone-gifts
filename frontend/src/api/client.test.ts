import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  apiClient,
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  setSessionEndedHandler,
} from "../api/client";

describe("apiClient", () => {
  beforeEach(() => {
    clearAccessToken();
  });

  afterEach(() => {
    setSessionEndedHandler(null);
  });

  it("gives up on a host that never answers", () => {
    // Asserted as configuration rather than behaviour: driving a real timeout
    // needs fake timers fighting MSW and axios over one number, and the branch
    // it feeds — a failure carrying no response — is covered by
    // `lib/request-failure.test.ts`. Without it a hung request leaves the button
    // on "Logging in…" with no message at all.
    expect(apiClient.defaults.timeout).toBe(15_000);
  });

  it("attaches the access token to requests", async () => {
    setAccessToken("test-access-token");

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
    setAccessToken("expired-token");

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
    expect(getAccessToken()).toBe("new-access-token");
  });

  it("clears tokens when refresh fails", async () => {
    setAccessToken("expired-token");

    server.use(
      http.get("https://boone-gifts-api.localhost/test", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }),
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      })
    );

    await expect(apiClient.get("/test")).rejects.toThrow();
    expect(getAccessToken()).toBeNull();
  });

  it("tells the session-ended handler when refresh fails", async () => {
    setAccessToken("expired-token");
    const onSessionEnded = vi.fn();
    setSessionEndedHandler(onSessionEnded);

    server.use(
      http.get("https://boone-gifts-api.localhost/test", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }),
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      })
    );

    await expect(apiClient.get("/test")).rejects.toThrow();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone when refresh succeeds", async () => {
    setAccessToken("expired-token");
    const onSessionEnded = vi.fn();
    setSessionEndedHandler(onSessionEnded);

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
        return HttpResponse.json({ access_token: "new-access-token", token_type: "bearer" });
      })
    );

    await apiClient.get("/test");
    expect(onSessionEnded).not.toHaveBeenCalled();
  });
});
