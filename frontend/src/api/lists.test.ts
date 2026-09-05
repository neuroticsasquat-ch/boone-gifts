import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { setAccessToken, clearAccessToken } from "./client";
import {
  createList,
  getListFamilies,
  shareListWithFamily,
  unshareListFromFamily,
} from "./lists";

const BASE = "https://boone-gifts-api.localhost";

describe("lists API — family sharing", () => {
  beforeEach(() => {
    setAccessToken("test-token");
  });

  afterEach(() => {
    clearAccessToken();
  });

  it("createList sends family_ids when given", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/lists`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await createList({ name: "Birthday", family_ids: [7, 8] });
    expect(capturedBody).toEqual({ name: "Birthday", family_ids: [7, 8] });
  });

  it("getListFamilies returns the share state for each family", async () => {
    const states = [
      { id: 7, name: "The Boones", shared: true },
      { id: 8, name: "The Smiths", shared: false },
    ];
    server.use(http.get(`${BASE}/lists/1/families`, () => HttpResponse.json(states)));

    expect(await getListFamilies(1)).toEqual(states);
  });

  it("shareListWithFamily PUTs to the grant URL", async () => {
    let called = false;
    server.use(
      http.put(`${BASE}/lists/1/families/7`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await shareListWithFamily(1, 7);
    expect(called).toBe(true);
  });

  it("unshareListFromFamily omits the claims param when not given", async () => {
    let claims: string | null = "unset";
    server.use(
      http.delete(`${BASE}/lists/1/families/7`, ({ request }) => {
        claims = new URL(request.url).searchParams.get("claims");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await unshareListFromFamily(1, 7);
    expect(claims).toBeNull();
  });

  it.each(["release", "keep"] as const)(
    "unshareListFromFamily sends claims=%s",
    async (choice) => {
      let claims: string | null = null;
      server.use(
        http.delete(`${BASE}/lists/1/families/7`, ({ request }) => {
          claims = new URL(request.url).searchParams.get("claims");
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await unshareListFromFamily(1, 7, choice);
      expect(claims).toBe(choice);
    },
  );
});
