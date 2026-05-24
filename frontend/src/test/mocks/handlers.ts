import { http, HttpResponse } from "msw";

export const handlers = [
  // Silent refresh returns 401 by default (no cookie in tests).
  // Tests that need a session override this with server.use().
  http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
    return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }),
  // Badge query defaults — Layout fetches these on every render.
  http.get("https://boone-gifts-api.localhost/connections/requests", () => {
    return HttpResponse.json([]);
  }),
  http.get("https://boone-gifts-api.localhost/lists/unseen-count", () => {
    return HttpResponse.json({ count: 0 });
  }),
];
