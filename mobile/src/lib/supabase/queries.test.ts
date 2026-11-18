import { createSupabase } from "./client";
import {
  buildHomeOrgs,
  DataError,
  getMyAttendee,
  getMyMemberships,
  getMyMeetingCheckIn,
  getMyOrgMeetings,
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
      ["org-a", "org-a", "org-b", "org-not-a-member"].map((org_id, i) => ({
        org_id,
        meeting_id: `m-${i}`,
      })),
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
    expect(buildHomeOrgs([], [{ org_id: "org-a", meeting_id: "m-1" }])).toEqual([]);
  });

  // 3 PM Eastern on Wed 18 Nov 2026.
  const now = new Date("2026-11-18T20:00:00Z");
  const row = (id: string, start: string, end: string | null, status = true, org_id = "org-a") => ({
    id,
    org_id,
    title: id,
    start_time: start,
    end_time: end,
    status,
  });

  it("shows the next open meeting, using the website's rule", () => {
    const [acm] = buildHomeOrgs(
      [membership("org-a", "ACM")],
      [],
      [
        row("past", "2026-11-11T23:00:00Z", "2026-11-12T00:00:00Z"),
        row("closed", "2026-11-19T23:00:00Z", "2026-11-20T00:00:00Z", false),
        row("gbm", "2026-11-25T23:00:00Z", "2026-11-26T00:00:00Z"),
        row("other org", "2026-11-19T23:00:00Z", null, true, "org-b"),
      ],
      now,
    );
    expect(acm.nextMeeting).toEqual({
      id: "gbm",
      title: "gbm",
      startTime: "2026-11-25T23:00:00Z",
      endTime: "2026-11-26T00:00:00Z",
    });
  });

  it("has no next meeting when nothing is coming up", () => {
    const [acm] = buildHomeOrgs([membership("org-a", "ACM")], [], [], now);
    expect(acm.nextMeeting).toBeNull();
    expect(acm.checkedInToday).toBe(false);
  });

  it("marks checked in today only for a meeting that started today (Eastern)", () => {
    const meetings = [
      // 1 PM Eastern today, already over.
      row("today", "2026-11-18T18:00:00Z", "2026-11-18T19:00:00Z"),
      // 11 PM Eastern yesterday: 04:00 UTC today, but not today in Eastern.
      row("last night", "2026-11-18T04:00:00Z", "2026-11-18T05:00:00Z"),
    ];
    const checkedIn = (meeting_id: string) =>
      buildHomeOrgs([membership("org-a", "ACM")], [{ org_id: "org-a", meeting_id }], meetings, now)[0]
        .checkedInToday;
    expect(checkedIn("today")).toBe(true);
    expect(checkedIn("last night")).toBe(false);
  });
});

describe("getMyOrgMeetings", () => {
  it("returns every meeting with whether you attended it", async () => {
    const { fetchImpl, requests } = recordingFetch((u) =>
      u.includes("/rpc/get_member_meetings_page")
        ? jsonResponse([
            { id: "m1", title: "GBM", start_time: "2026-10-01T23:00:00Z", attended: true,
              description: "Officer updates", total_count: 2,
              form_schema: [{ id: "q1", type: "text", label: "How did you hear about us?" }, { nope: 1 }] },
            { id: "m2", title: "Workshop", start_time: "2026-09-20T23:00:00Z", attended: false,
              description: null, form_schema: null, total_count: 2 },
          ])
        : jsonResponse([{ id: "attendee_1", user_id: "user_1" }]),
    );
    const supabase = createSupabase(async () => fakeJwt({ sub: "user_1" }), {
      url, anonKey, fetch: fetchImpl,
    });

    const result = await getMyOrgMeetings(supabase, "org_1", {
      start: "2000-01-01T00:00:00Z", end: "2026-11-03T00:00:00Z",
    });

    expect(result).toEqual({
      meetings: [
        { id: "m1", title: "GBM", startTime: "2026-10-01T23:00:00Z", attended: true,
          description: "Officer updates", questions: [{ id: "q1", label: "How did you hear about us?" }] },
        { id: "m2", title: "Workshop", startTime: "2026-09-20T23:00:00Z", attended: false,
          description: null, questions: [] },
      ],
      total: 2,
    });
    expect(requests.some((r) => r.url.includes("/rpc/get_member_meetings_page"))).toBe(true);
  });

  it("pages through a semester with more than 100 meetings", async () => {
    const offsets: number[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!u.includes("/rpc/get_member_meetings_page")) {
        return jsonResponse([{ id: "attendee_1", user_id: "user_1" }]);
      }
      const { p_offset, p_limit } = JSON.parse(String(init?.body));
      offsets.push(p_offset);
      const count = Math.max(Math.min(p_limit, 150 - p_offset), 0);
      return jsonResponse(Array.from({ length: count }, (_, i) => ({
        id: `m${p_offset + i}`, title: "GBM", start_time: "2026-10-01T23:00:00Z", attended: false,
        description: null, form_schema: null, total_count: 150,
      })));
    }) as typeof fetch;
    const supabase = createSupabase(async () => fakeJwt({ sub: "user_1" }), {
      url, anonKey, fetch: fetchImpl,
    });

    const result = await getMyOrgMeetings(supabase, "org_1", {
      start: "2026-08-01T04:00:00Z", end: "2027-01-01T04:59:00Z",
    });

    expect(offsets).toEqual([0, 100]);
    expect(result.total).toBe(150);
    expect(result.meetings).toHaveLength(150);
    expect(result.meetings[149].id).toBe("m149");
  });

  it("returns nothing when signed out", async () => {
    await expect(getMyOrgMeetings(null, "org_1", { start: "", end: "" }))
      .resolves.toEqual({ meetings: [], total: 0 });
  });
});

describe("getMyMeetingCheckIn", () => {
  const signedIn = (handler: (url: string) => Response) => {
    const { fetchImpl, requests } = recordingFetch(handler);
    const supabase = createSupabase(async () => fakeJwt({ sub: "user_1" }), { url, anonKey, fetch: fetchImpl });
    return { supabase, requests };
  };

  it("returns the end time and your own check-in", async () => {
    const { supabase, requests } = signedIn((u) => {
      if (u.includes("/attendees")) return jsonResponse([{ id: "attendee_1", user_id: "user_1" }]);
      if (u.includes("/meetings")) return jsonResponse({ end_time: "2026-10-02T00:30:00Z" });
      return jsonResponse({ checked_in_at: "2026-10-01T23:04:00Z", answers: { q1: "Discord" } });
    });

    await expect(getMyMeetingCheckIn(supabase, "m1")).resolves.toEqual({
      endTime: "2026-10-02T00:30:00Z",
      checkedInAt: "2026-10-01T23:04:00Z",
      answers: { q1: "Discord" },
    });
    // Narrowed to this meeting and to the caller's own attendee row.
    const attendance = requests.find((r) => r.url.includes("/attendance"));
    expect(attendance?.url).toContain("meeting_id=eq.m1");
    expect(attendance?.url).toContain("attendee_id=eq.attendee_1");
  });

  it("has no check-in for a meeting you didn't attend", async () => {
    const { supabase } = signedIn((u) => {
      if (u.includes("/attendees")) return jsonResponse([{ id: "attendee_1", user_id: "user_1" }]);
      if (u.includes("/meetings")) return jsonResponse({ end_time: null });
      return jsonResponse(null);
    });

    await expect(getMyMeetingCheckIn(supabase, "m2")).resolves.toEqual({
      endTime: null, checkedInAt: null, answers: {},
    });
  });

  it("returns nothing when signed out", async () => {
    await expect(getMyMeetingCheckIn(null, "m1")).resolves.toEqual({
      endTime: null, checkedInAt: null, answers: {},
    });
  });
});
