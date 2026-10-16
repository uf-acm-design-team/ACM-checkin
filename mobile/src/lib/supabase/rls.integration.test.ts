import { createHmac, randomUUID } from "node:crypto";
import { fetch as nodeFetch } from "undici";
import { createSupabase, type MobileSupabase } from "./client";
import { DataError, getMyAttendee, getMyMemberships, getOrgBySlug } from "./queries";

const url = process.env.SUPABASE_URL ?? process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET;
const configured = Boolean(url && anonKey && jwtSecret);

if (process.env.RLS_TEST_REQUIRED === "1" && !configured) {
  throw new Error(
    "Local Supabase is not reachable. Start it from the repo root with `npm run supabase:start`, then rerun `npm run test:rls`.",
  );
}

type TestUser = { clerkId: string; token: string; supabase: MobileSupabase };

async function mintSessionToken(clerkId: string, expiresAt?: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: clerkId,
    role: "authenticated",
    sid: `sess_${randomUUID()}`,
    iat: expiresAt ? expiresAt - 120 : now,
    exp: expiresAt ?? now + 300,
  });
  const signature = createHmac("sha256", jwtSecret!).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function clientFor(getToken: () => Promise<string | null>): MobileSupabase {
  return createSupabase(getToken, { url: url!, anonKey: anonKey!, fetch: nodeFetch as unknown as typeof fetch });
}

async function signedInUser(label: string): Promise<TestUser> {
  const clerkId = `user_rlstest_${label}_${randomUUID().slice(0, 8)}`;
  const token = await mintSessionToken(clerkId);
  const supabase = clientFor(async () => token);
  const { error } = await supabase.client.from("attendees").insert({
    user_id: clerkId,
    email: `${clerkId}@rls-test.example`,
    first_name: "RLS",
    last_name: label,
    grad_year: "2029",
  });
  if (error) throw new Error(`could not create attendee for ${label}: ${error.message}`);
  return { clerkId, token, supabase };
}

(configured ? describe : describe.skip)("RLS through the mobile client (local Supabase)", () => {
  let memberA: TestUser;
  let memberB: TestUser;
  let orgSlug: string;

  beforeAll(async () => {
    memberA = await signedInUser("a");
    memberB = await signedInUser("b");

    const { data: org, error } = await memberA.supabase.client
      .from("organizations")
      .select("id, slug")
      .not("slug", "is", null)
      .limit(1)
      .single();
    if (error || !org?.slug) throw new Error("no seeded organization found; run `npm run setup`");
    orgSlug = org.slug;

    const join = await memberA.supabase.client
      .from("memberships")
      .insert({ org_id: org.id, user_id: memberA.clerkId, role: "member", status: "pending" });
    if (join.error) throw new Error(`could not create membership: ${join.error.message}`);
  });

  it("returns the signed-in member's own attendees row", async () => {
    const attendee = await getMyAttendee(memberA.supabase);
    expect(attendee?.user_id).toBe(memberA.clerkId);
  });

  it("returns nothing for another user's attendees row", async () => {
    const { data, error } = await memberA.supabase.client
      .from("attendees")
      .select("*")
      .eq("user_id", memberB.clerkId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("only ever sees its own row, even without a filter", async () => {
    const { data, error } = await memberA.supabase.client.from("attendees").select("user_id");
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: memberA.clerkId }]);
  });

  it("returns the member's memberships with the org embedded", async () => {
    const memberships = await getMyMemberships(memberA.supabase);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: "member", organization: { slug: orgSlug } });
    await expect(getMyMemberships(memberB.supabase)).resolves.toEqual([]);
  });

  it("hides another user's memberships", async () => {
    const { data, error } = await memberB.supabase.client
      .from("memberships")
      .select("*")
      .eq("user_id", memberA.clerkId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("reads the token on every request, so a rotated session is picked up", async () => {
    let current = memberA.token;
    const supabase = clientFor(async () => current);
    expect((await getMyAttendee(supabase))?.user_id).toBe(memberA.clerkId);
    current = memberB.token;
    expect((await getMyAttendee(supabase))?.user_id).toBe(memberB.clerkId);
  });

  it("looks up an org by slug", async () => {
    await expect(getOrgBySlug(memberA.supabase, orgSlug)).resolves.toMatchObject({ slug: orgSlug });
    await expect(getOrgBySlug(memberA.supabase, `missing-${randomUUID()}`)).resolves.toBeNull();
  });

  it("returns nothing when signed out and does not throw", async () => {
    await expect(getMyAttendee(null)).resolves.toBeNull();
    await expect(getMyMemberships(null)).resolves.toEqual([]);
    await expect(getOrgBySlug(null, orgSlug)).resolves.toBeNull();

    const endedSession = clientFor(async () => null);
    await expect(getMyAttendee(endedSession)).resolves.toBeNull();
    await expect(getMyMemberships(endedSession)).resolves.toEqual([]);
  });

  it("gives anon no personal data even if a screen bypasses the query module", async () => {
    const anon = clientFor(async () => null).client;
    const attendees = await anon.from("attendees").select("*");
    expect(attendees.data ?? []).toEqual([]);
    const memberships = await anon.from("memberships").select("*");
    expect(memberships.data ?? []).toEqual([]);
  });

  it("surfaces an expired token as an auth error instead of empty data", async () => {
    const expired = await mintSessionToken(memberA.clerkId, Math.floor(Date.now() / 1000) - 60);
    const error = await getMyAttendee(clientFor(async () => expired)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).authRejected).toBe(true);
  });
});
