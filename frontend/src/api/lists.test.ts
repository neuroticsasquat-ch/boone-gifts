import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { setAccessToken, clearAccessToken } from "./client";
import {
  createList,
  getShareTargets,
  shareListWithOccasion,
  unshareListFromOccasion,
} from "./lists";

const BASE = "https://boone-gifts-api.localhost";

describe("lists API — sharing to an occasion", () => {
  beforeEach(() => {
    setAccessToken("test-token");
  });

  afterEach(() => {
    clearAccessToken();
  });

  it("createList sends occasion_ids when given", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/lists`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await createList({ name: "Birthday", occasion_ids: [7, 8] });
    expect(capturedBody).toEqual({ name: "Birthday", occasion_ids: [7, 8] });
  });

  it("getShareTargets returns each family with its members and occasions", async () => {
    const targets = [
      {
        id: 7,
        name: "The Boones",
        member_ids: [1, 2],
        occasions: [{ id: 1, name: "Christmas 2026", is_archived: false, shared: true }],
      },
      { id: 8, name: "The Smiths", member_ids: [1], occasions: [] },
    ];
    server.use(http.get(`${BASE}/lists/1/families`, () => HttpResponse.json(targets)));

    expect(await getShareTargets(1)).toEqual(targets);
  });

  it("shareListWithOccasion PUTs to the occasion URL", async () => {
    let called = false;
    server.use(
      http.put(`${BASE}/lists/1/occasions/3`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await shareListWithOccasion(1, 3);
    expect(called).toBe(true);
  });

  it("unshareListFromOccasion omits the claims param when not given", async () => {
    let claims: string | null = "unset";
    server.use(
      http.delete(`${BASE}/lists/1/occasions/3`, ({ request }) => {
        claims = new URL(request.url).searchParams.get("claims");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await unshareListFromOccasion(1, 3);
    expect(claims).toBeNull();
  });

  it.each(["release", "keep"] as const)(
    "unshareListFromOccasion sends claims=%s",
    async (choice) => {
      let claims: string | null = null;
      server.use(
        http.delete(`${BASE}/lists/1/occasions/3`, ({ request }) => {
          claims = new URL(request.url).searchParams.get("claims");
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await unshareListFromOccasion(1, 3, choice);
      expect(claims).toBe(choice);
    },
  );
});
