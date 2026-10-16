import { createSupabase } from "./client";
import {
  buildHomeOrgs,
  DataError,
  getMyAttendee,
  getMyMemberships,
  getOrgBySlug,
} from "./queries";
import { anonKey, fakeJwt, jsonResponse, recordingFetch } from "./test-helpers";

const url = "http://127.0.0.1:54321";

describe("signed out", () => {
  it("returns nothing when there is no client", async () => {
    await expect(getMyAttendee(null)).resolves.toBeNull();
    await expect(getMyMemberships(null)).resolves.toEqual([]);
    await expect(getOrgBySlug(null, "acm")).resolves.toBeNull();
  });

  it("returns nothing without a network call when the session has ended", async () => {
    const { fetchImpl, requests } = recordingFetch();
    const supabase = createSupabase(async () => null, {
      url,
      anonKey,
      fetch: fetchImpl,
    });

    await expect(getMyAttendee(supabase)).resolves.toBeNull();
    await expect(getMyMemberships(supabase)).resolves.toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

describe("signed in", () => {
  it("narrows to the Clerk id from the token, not a caller-supplied id", async () => {
    const { fetchImpl, requests } = recordingFetch();
    const supabase = createSupabase(
      async () => fakeJwt({ sub: "user_from_token" }),
      {
        url,
        anonKey,
        fetch: fetchImpl,
      },
    );

    await getMyAttendee(supabase);
    await getMyMemberships(supabase);

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(new URL(request.url).searchParams.get("user_id")).toBe(
        "eq.user_from_token",
      );
    }
  });

  it("throws a DataError when Supabase returns an error", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse(
        { code: "42501", message: "permission denied for table memberships" },
        403,
      ),
    );
    const supabase = createSupabase(async () => fakeJwt({ sub: "user_a" }), {
      url,
      anonKey,
      fetch: fetchImpl,
    });

    const error = await getMyMemberships(supabase).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: "42501", authRejected: false });
  });

  it("flags a rejected Clerk token so it does not look like empty data", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ code: "PGRST303", message: "JWT expired" }, 401),
    );
    const supabase = createSupabase(async () => fakeJwt({ sub: "user_a" }), {
      url,
      anonKey,
      fetch: fetchImpl,
    });

    const error = await getMyAttendee(supabase).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: "PGRST303", authRejected: true });
  });
});

describe("buildHomeOrgs", () => {
  const membership = (orgId: string, name: string, role = "member") => ({
    org_id: orgId,
    role,
    status: "active",
    created_at: "2026-10-01",
    organization: {
      id: orgId,
      slug: name.toLowerCase(),
      name,
      branding: null,
      created_at: "2026-10-01T00:00:00Z",
    },
  });

  it("counts check-ins per org and sorts by org name", () => {
    const rows = buildHomeOrgs(
      [
        membership("org-b", "ColorStack"),
        membership("org-a", "ACM", "officer"),
      ],
      ["org-a", "org-a", "org-b", "org-not-a-member"],
    );
    expect(rows.map((row) => [row.org.name, row.role, row.attended])).toEqual([
      ["ACM", "officer", 2],
      ["ColorStack", "member", 1],
    ]);
  });

  it("shows zero for an org with no check-ins", () => {
    expect(buildHomeOrgs([membership("org-a", "ACM")], [])[0].attended).toBe(0);
  });

  it("returns nothing when you have no memberships", () => {
    expect(buildHomeOrgs([], ["org-a"])).toEqual([]);
  });
});
