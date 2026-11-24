import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  userId: "user-one",
  attendees: [] as Record<string, unknown>[],
  attendance: [] as Record<string, unknown>[],
  meetings: [] as Record<string, unknown>[],
  insertError: null as { code: string; message: string } | null,
  passwordOk: true,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
}));

type Row = Record<string, unknown>;
function database() {
  return {
    rpc: async () => ({ data: state.passwordOk, error: null }),
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let insert: Row | undefined;
      const run = () => {
        const rows = table === "organizations" ? [{ id: "org-one", slug: "acm" }]
          : table === "meetings" ? state.meetings
          : table === "attendees" ? state.attendees : state.attendance;
        if (insert) {
          if (table === "attendance") {
            if (state.insertError) return { data: null, error: state.insertError };
            // Check the device key first so retries exercise either-key handling.
            const deviceConflict = rows.some((r) =>
              r.meeting_id === insert!.meeting_id && r.device_id === insert!.device_id);
            const personConflict = rows.some((r) =>
              r.meeting_id === insert!.meeting_id && r.attendee_id === insert!.attendee_id);
            if (deviceConflict || personConflict) return {
              data: null,
              error: { code: "23505", message: deviceConflict
                ? 'duplicate key violates unique constraint "attendance_meeting_device_key"'
                : 'duplicate key violates unique constraint "attendance_meeting_attendee_key"' },
            };
          }
          const row = { id: randomUUID(), ...insert };
          rows.push(row);
          return { data: [row], error: null };
        }
        return { data: rows.filter((row) => filters.every((f) => f(row))), error: null };
      };
      const query = {
        select: () => query,
        order: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        ilike: (key: string, value: string) => {
          const literal = value.split(String.fromCharCode(92)).join("").toLowerCase();
          filters.push((row) => String(row[key]).toLowerCase() === literal);
          return query;
        },
        insert: (row: Row) => { insert = row; return query; },
        maybeSingle: async () => {
          const result = run();
          return { ...result, data: result.data?.[0] ?? null };
        },
        single: async () => query.maybeSingle(),
        then: (resolve: (result: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return query;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => database() }));
vi.mock("../app/utils/supabase/server", () => ({
  createClerkSupabaseClient: () => database(),
}));

import { guestCheckIn } from "../app/[orgSlug]/checkin/guest-actions";
import {
  DEVICE_ALREADY_CHECKED_IN_MESSAGE,
  DEVICE_REQUIRED_MESSAGE,
  issueDeviceCookie,
} from "./checkin-device";

let guestAction = guestCheckIn;

function guest(email = "one@ufl.edu", extras: Record<string, unknown> = {}) {
  return guestAction({ orgSlug: "acm", email, ...extras });
}

beforeEach(async () => {
  vi.resetModules();
  guestAction = (await import("../app/[orgSlug]/checkin/guest-actions")).guestCheckIn;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  state.cookie = issueDeviceCookie("test-key");
  state.userId = "user-one";
  state.insertError = null;
  state.passwordOk = true;
  state.attendees = [
    { id: "attendee-one", email: "one@ufl.edu", user_id: "user-one" },
    { id: "attendee-two", email: "two@ufl.edu", user_id: "user-two" },
  ];
  state.attendance = [];
  state.meetings = [{
    id: "meeting-one", org_id: "org-one", status: true, is_officer_only: false,
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60_000).toISOString(),
    form_schema: [], is_geo_locked: false, checkin_password: null,
  }];
});

describe("one web check-in per browser per meeting", () => {
  it("allows a repeat submission by the same guest without another attendance row", async () => {
    expect(await guest()).toEqual({ ok: true });
    expect(await guest()).toEqual({ ok: true, alreadyCheckedIn: true });
    expect(state.attendance).toHaveLength(1);
  });

  it("blocks another email on that browser, even after a server-module restart", async () => {
    expect(await guest()).toEqual({ ok: true });
    vi.resetModules();
    const { guestCheckIn: restarted } = await import("../app/[orgSlug]/checkin/guest-actions");
    expect(await restarted({ orgSlug: "acm", email: "two@ufl.edu" })).toEqual({
      ok: false, error: DEVICE_ALREADY_CHECKED_IN_MESSAGE,
    });
    expect(state.attendance).toHaveLength(1);
  });

  it("does not share the IP attempt budget between 61 separate browsers", async () => {
    for (let i = 0; i < 61; i++) {
      state.cookie = issueDeviceCookie("test-key");
      expect(await guest(`student${i}@ufl.edu`, {
        firstName: "A", lastName: "Student", gradYear: "2028",
      })).toEqual({ ok: true });
    }
    expect(state.attendance).toHaveLength(61);
  });

  it("does not consume a device during the email/profile steps", async () => {
    expect(await guest("new@ufl.edu")).toEqual({ ok: false, error: "NEEDS_PROFILE" });
    expect(state.attendance).toHaveLength(0);
    expect(await guest("new@ufl.edu", {
      firstName: "New", lastName: "Student", gradYear: "2028",
    })).toEqual({ ok: true });
    expect(state.attendance).toHaveLength(1);
  });

  it("does not consume the device on password rejection or a failed write", async () => {
    state.meetings[0].checkin_password = "secret";
    expect((await guest()).ok).toBe(false);
    state.insertError = { code: "08006", message: "Database unavailable" };
    expect((await guest("one@ufl.edu", { password: "secret" })).ok).toBe(false);
    expect(state.attendance).toHaveLength(0);
    state.insertError = null;
    expect(await guest("one@ufl.edu", { password: "secret" })).toEqual({ ok: true });
  });

  it("does not consume the device on invalid answers or geofence rejection", async () => {
    state.meetings[0].form_schema = [{
      id: "q_name", type: "short_text", label: "Name", required: true,
    }];
    expect((await guest()).ok).toBe(false);
    expect(state.attendance).toHaveLength(0);
    state.meetings[0].form_schema = [];
    Object.assign(state.meetings[0], {
      is_geo_locked: true, latitude: 29.65, longitude: -82.34, radius_meters: 200,
    });
    expect((await guest()).ok).toBe(false);
    expect(state.attendance).toHaveLength(0);
    state.meetings[0].is_geo_locked = false;
    expect(await guest()).toEqual({ ok: true });
  });

  it("retains a five-attempt device throttle even when the email changes", async () => {
    state.meetings[0].checkin_password = "secret";
    for (let i = 0; i < 5; i++) {
      expect(await guest(`attempt${i}@ufl.edu`)).toEqual({
        ok: false, error: "Incorrect meeting password.",
      });
    }
    expect(await guest("another@ufl.edu", { password: "secret" })).toEqual({
      ok: false, error: "Too many attempts. Wait a minute and try again.",
    });
    expect(state.attendance).toHaveLength(0);
  });

  it("allows the browser to check in at another meeting", async () => {
    expect(await guest()).toEqual({ ok: true });
    state.meetings[0].id = "meeting-two";
    expect(await guest()).toEqual({ ok: true });
    expect(state.attendance).toHaveLength(2);
  });

  it("allows another browser on the same network to check in someone else", async () => {
    expect(await guest()).toEqual({ ok: true });
    state.cookie = issueDeviceCookie("test-key");
    expect(await guest("two@ufl.edu")).toEqual({ ok: true });
  });

  it("rejects submissions without a valid server-issued cookie", async () => {
    for (const value of [undefined, "forged"]) {
      state.cookie = value;
      expect(await guest()).toEqual({ ok: false, error: DEVICE_REQUIRED_MESSAGE });
    }
    expect(state.attendance).toHaveLength(0);
  });

  it("keeps an existing attendee's retry idempotent from another browser", async () => {
    expect(await guest()).toEqual({ ok: true });
    state.cookie = issueDeviceCookie("test-key");
    expect(await guest()).toEqual({ ok: true, alreadyCheckedIn: true });
    expect(state.attendance).toHaveLength(1);
  });

  it("records only one of two simultaneous guests from the same browser", async () => {
    const results = await Promise.all([guest(), guest("two@ufl.edu")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, error: DEVICE_ALREADY_CHECKED_IN_MESSAGE },
    ]);
    expect(state.attendance).toHaveLength(1);
  });
});
