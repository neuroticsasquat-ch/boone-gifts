import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { setAccessToken, clearAccessToken } from "./client";
import {
  getFamilies,
  createFamily,
  getFamily,
  renameFamily,
  deleteFamily,
  removeMember,
  updateMemberRole,
  createInvite,
  getInvites,
  revokeInvite,
  getIncomingFamilyInvites,
  acceptFamilyInvite,
  declineFamilyInvite,
} from "./families";

const BASE = "https://boone-gifts-api.localhost";

const familyDetail = {
  id: 1,
  name: "Smith Family",
  created_by_id: 10,
  members: [{ user_id: 10, name: "Alice Smith", role: "organizer" }],
};

const familyInvite = {
  id: 5,
  family_id: 1,
  email: "bob@example.com",
  role: "member",
  token: "tok_abc123",
  invited_by_id: 10,
  expires_at: "2026-07-28T00:00:00Z",
  accepted_at: null,
  declined_at: null,
  created_at: "2026-06-28T00:00:00Z",
  status: "pending" as const,
};

describe("families API", () => {
  beforeEach(() => {
    setAccessToken("test-token");
  });

  afterEach(() => {
    clearAccessToken();
  });

  it("getFamilies returns list", async () => {
    const families = [{ id: 1, name: "Smith Family", role: "organizer", member_count: 3 }];
    server.use(http.get(`${BASE}/families`, () => HttpResponse.json(families)));
    const result = await getFamilies();
    expect(result).toEqual(families);
  });

  it("createFamily posts body and returns FamilyDetail", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/families`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(familyDetail, { status: 201 });
      }),
    );
    const result = await createFamily({ name: "Smith Family" });
    expect(capturedBody).toEqual({ name: "Smith Family" });
    expect(result).toEqual(familyDetail);
  });

  it("getFamily returns FamilyDetail", async () => {
    server.use(http.get(`${BASE}/families/1`, () => HttpResponse.json(familyDetail)));
    const result = await getFamily(1);
    expect(result).toEqual(familyDetail);
  });

  it("renameFamily puts body and returns FamilyDetail", async () => {
    let capturedBody: unknown;
    server.use(
      http.put(`${BASE}/families/1`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...familyDetail, name: "Jones Family" });
      }),
    );
    const result = await renameFamily(1, { name: "Jones Family" });
    expect(capturedBody).toEqual({ name: "Jones Family" });
    expect(result.name).toBe("Jones Family");
  });

  it("deleteFamily sends DELETE and returns void", async () => {
    let hit = false;
    server.use(
      http.delete(`${BASE}/families/1`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = await deleteFamily(1);
    expect(hit).toBe(true);
    expect(result).toBeUndefined();
  });

  it("removeMember sends DELETE to correct URL and returns void", async () => {
    let hit = false;
    server.use(
      http.delete(`${BASE}/families/1/members/42`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = await removeMember(1, 42);
    expect(hit).toBe(true);
    expect(result).toBeUndefined();
  });

  it("updateMemberRole puts body and returns FamilyDetail", async () => {
    let capturedBody: unknown;
    server.use(
      http.put(`${BASE}/families/1/members/42/role`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(familyDetail);
      }),
    );
    const result = await updateMemberRole(1, 42, { role: "member" });
    expect(capturedBody).toEqual({ role: "member" });
    expect(result).toEqual(familyDetail);
  });

  it("createInvite posts body and returns FamilyInvite", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/families/1/invites`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(familyInvite, { status: 201 });
      }),
    );
    const result = await createInvite(1, { email: "bob@example.com" });
    expect(capturedBody).toEqual({ email: "bob@example.com" });
    expect(result).toEqual(familyInvite);
  });

  it("getInvites returns FamilyInvite[]", async () => {
    server.use(
      http.get(`${BASE}/families/1/invites`, () => HttpResponse.json([familyInvite])),
    );
    const result = await getInvites(1);
    expect(result).toEqual([familyInvite]);
  });

  it("revokeInvite sends DELETE and returns void", async () => {
    let hit = false;
    server.use(
      http.delete(`${BASE}/families/1/invites/5`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = await revokeInvite(1, 5);
    expect(hit).toBe(true);
    expect(result).toBeUndefined();
  });

  it("getIncomingFamilyInvites returns IncomingFamilyInvite[]", async () => {
    const incoming = [
      {
        id: 7,
        token: "tok_abc123",
        role: "member",
        family: { id: 1, name: "Smith Family" },
        invited_by: { id: 10, name: "Alice Smith" },
        expires_at: "2026-07-28T00:00:00Z",
        created_at: "2026-06-28T00:00:00Z",
      },
    ];
    server.use(http.get(`${BASE}/families/invites`, () => HttpResponse.json(incoming)));
    const result = await getIncomingFamilyInvites();
    expect(result).toEqual(incoming);
  });

  it("acceptFamilyInvite posts to token URL and returns family + role", async () => {
    const payload = { family: { id: 1, name: "Smith Family" }, role: "member" };
    let hit = false;
    server.use(
      http.post(`${BASE}/families/invites/tok_abc123/accept`, () => {
        hit = true;
        return HttpResponse.json(payload);
      }),
    );
    const result = await acceptFamilyInvite("tok_abc123");
    expect(hit).toBe(true);
    expect(result).toEqual(payload);
  });

  it("declineFamilyInvite posts to token URL and returns void", async () => {
    let hit = false;
    server.use(
      http.post(`${BASE}/families/invites/tok_abc123/decline`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = await declineFamilyInvite("tok_abc123");
    expect(hit).toBe(true);
    expect(result).toBeUndefined();
  });
});
