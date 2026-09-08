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
  // Default handler: no pending invites (organizer-only useQuery mounts on every organizer render)
  http.get("https://boone-gifts-api.localhost/families/:familyId/invites", () => {
    return HttpResponse.json([]);
  }),
  // Default handler: no incoming family invites (ActionableBanner mounts on Lists and People)
  http.get("https://boone-gifts-api.localhost/families/invites", () => {
    return HttpResponse.json([]);
  }),
  // Default handler: no folders (the Lists page's folder filter fetches these
  // in full mode on every render)
  http.get("https://boone-gifts-api.localhost/folders", () => {
    return HttpResponse.json([]);
  }),
  // Default handler: a plain, un-shared account (the Account page's shared-account
  // card fetches this whenever the page renders)
  http.get("https://boone-gifts-api.localhost/account", () => {
    return HttpResponse.json({ is_shared_account: false, people: [] });
  }),
];
