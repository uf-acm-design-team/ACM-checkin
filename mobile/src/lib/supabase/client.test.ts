import { assertPublicKey, createSupabase } from "./client";
import { decodeJwtClaims, subjectOf } from "./jwt";
import { anonKey, fakeJwt, recordingFetch } from "./test-helpers";

const url = "http://127.0.0.1:54321";

describe("assertPublicKey", () => {
  it("accepts the anon key and publishable keys", () => {
    expect(() => assertPublicKey(anonKey)).not.toThrow();
    expect(() => assertPublicKey("sb_publishable_abc123")).not.toThrow();
  });

  it("rejects service-role and secret keys", () => {
    expect(() => assertPublicKey(fakeJwt({ role: "service_role" }))).toThrow(/service-role/);
    expect(() => assertPublicKey("sb_secret_abc123")).toThrow(/service-role/);
  });

  it("refuses to build a client from a service-role key", () => {
    expect(() =>
      createSupabase(async () => null, { url, anonKey: fakeJwt({ role: "service_role" }) }),
    ).toThrow(/service-role/);
  });
});

describe("jwt helpers", () => {
  it("reads the Clerk subject from a token", () => {
    expect(subjectOf(fakeJwt({ sub: "user_2abc" }))).toBe("user_2abc");
    expect(subjectOf(fakeJwt({ sub: "" }))).toBeNull();
    expect(subjectOf(null)).toBeNull();
    expect(subjectOf("not-a-jwt")).toBeNull();
  });

  it("decodes non-ASCII claims", () => {
    expect(decodeJwtClaims(fakeJwt({ name: "José Ñúñez" }))?.name).toBe("José Ñúñez");
  });
});

describe("createSupabase", () => {
  it("asks for a fresh token on every request", async () => {
    const first = fakeJwt({ sub: "user_a" });
    const refreshed = fakeJwt({ sub: "user_a", refreshed: true });
    let current = first;
    const { fetchImpl, requests } = recordingFetch();
    const supabase = createSupabase(async () => current, { url, anonKey, fetch: fetchImpl });

    await supabase.client.from("organizations").select("id");
    current = refreshed;
    await supabase.client.from("organizations").select("id");

    expect(requests.map((r) => r.authorization)).toEqual([
      `Bearer ${first}`,
      `Bearer ${refreshed}`,
    ]);
  });

  it("falls back to the anon key when there is no session token", async () => {
    const { fetchImpl, requests } = recordingFetch();
    const supabase = createSupabase(async () => null, { url, anonKey, fetch: fetchImpl });

    await supabase.client.from("organizations").select("id");

    expect(requests[0].authorization).toBe(`Bearer ${anonKey}`);
  });

  it("exposes the Clerk id the current token carries", async () => {
    let token: string | null = fakeJwt({ sub: "user_a" });
    const supabase = createSupabase(async () => token, { url, anonKey });

    expect(await supabase.clerkId()).toBe("user_a");
    token = null;
    expect(await supabase.clerkId()).toBeNull();
  });
});
