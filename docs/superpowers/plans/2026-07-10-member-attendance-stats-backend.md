# Member Attendance Stats Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock data behind `[orgSlug]/stats` with a real, server-side, per-user attendance backend (percentages, status, Attended/Missed/All views, per-term + all-time, pagination), keeping the existing `feat/stats-view` UI.

**Architecture:** A server-only Clerk-JWT Supabase client feeds a `lib/stats-data.ts` seam (two server actions: `getMemberStats`, `getMeetingsPage`) that derives identity from `auth()` server-side. All term math, aggregation, and pagination logic lives in pure, unit-tested helpers in `lib/stats-terms.ts`; `lib/stats-data.ts` is thin orchestration over Supabase queries. The stats page and its components are rewired from "receive full arrays, group client-side" to "server-driven."

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, `@clerk/nextjs` ^7, `@supabase/supabase-js` ^2.90, vitest (node env, `lib/**/*.test.ts`), Supabase Postgres.

**Design spec:** `docs/superpowers/specs/2026-07-10-member-attendance-stats-backend-design.md`

**Note on commits:** The user's standing preference is *no commits without explicit OK*. Each task ends with a commit step per repo convention — get the user's confirmation before running it during execution.

---

## File Structure

**New files:**
- `lib/stats-terms.ts` — shared types + pure term/aggregation/pagination helpers (source of truth).
- `lib/stats-terms.test.ts` — unit tests for the above.
- `lib/membership.ts` — membership threshold config + `resolveMembership` helper.
- `lib/membership.test.ts` — unit tests.
- `app/utils/supabase/server.ts` — `createClerkSupabaseClient` (Clerk-JWT bridge).
- `lib/stats-data.ts` — `getMemberStats`, `getMeetingsPage` server actions.
- `supabase/migrations/20260710000000_add_meetings_description.sql` — add `meetings.description`.
- `components/stats/meeting-details-modal.tsx` — (stretch) details modal.

**Modified files:**
- `app/[orgSlug]/checkin/actions.ts` — import threshold config from `lib/membership.ts`.
- `components/stats/view-toggle.tsx` — `attended | missed | all`.
- `components/stats/meeting-list-item.tsx` — consume `StatsMeeting`.
- `components/stats/meetings-list.tsx` — consume `StatsMeeting`.
- `components/stats/membership-badge.tsx` — reflect role/status.
- `components/stats/term-tabs.tsx` — controlled tab bar (no client grouping).
- `components/stats/stats-view.tsx` — server-driven orchestration.
- `app/[orgSlug]/stats/page.tsx` — real data + auth + states.

**Deleted files:**
- `components/stats/mock-meetings.ts` — replaced by `lib/stats-terms.ts` + real data (Task 7).

---

## Task 0: Add `meetings.description` column

**Goal:** A nullable `description text` column on `meetings` so officers can write summaries.

**Files:**
- Create: `supabase/migrations/20260710000000_add_meetings_description.sql`

**Acceptance Criteria:**
- [ ] Migration adds `description text` (nullable) to `public.meetings`.
- [ ] Migration is idempotent (`IF NOT EXISTS`).

**Verify:** `supabase migration up` (or `supabase db reset`) applies cleanly; `\d public.meetings` shows the `description` column. If the Supabase CLI/DB is unavailable in the environment, verify the SQL parses and matches the pattern of existing migrations.

**Steps:**

- [ ] **Step 1: Write the migration**

```sql
-- Add a nullable meeting summary officers can write. Surfaced in the member
-- stats view (meeting-list-item / details modal).
ALTER TABLE "public"."meetings"
    ADD COLUMN IF NOT EXISTS "description" "text";
```

- [ ] **Step 2: Apply and verify**

Run: `supabase migration up`
Expected: applies with no error; `meetings` now has a nullable `description` column.
(If no DB access: confirm the file mirrors the `ALTER TABLE` style in `supabase/migrations/20260518000200_memberships_user_id_text.sql`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710000000_add_meetings_description.sql
git commit -m "feat(db): add nullable meetings.description column"
```

---

## Task 1: Pure term, aggregation & pagination helpers (`lib/stats-terms.ts`)

**Goal:** All timezone-safe term logic, per-term aggregation, and pagination math as pure functions with full unit tests — the testable core the data layer orchestrates.

**Files:**
- Create: `lib/stats-terms.ts`
- Test: `lib/stats-terms.test.ts`

**Acceptance Criteria:**
- [ ] `getTerm` classifies by EST month from the timestamp string without relying on `Date` timezone.
- [ ] `termBounds` returns correct `[start, end]` ISO strings per season.
- [ ] `academicYearTerms` returns the current AY's three term keys given (year, month).
- [ ] `buildTermSummaries` produces per-term `{attended,total}` + all-time totals.
- [ ] `pageRange`, `hasMore`, `percentage` compute correctly including zero/boundary cases.

**Verify:** `npx vitest run lib/stats-terms.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// lib/stats-terms.test.ts
import { describe, it, expect } from "vitest";
import {
  getTerm, termBounds, compareTermsDesc, academicYearTerms,
  buildTermSummaries, pageRange, hasMore, percentage,
} from "./stats-terms";

describe("getTerm (EST month boundaries)", () => {
  it("classifies Jan–May as Spring", () => {
    expect(getTerm("2026-01-01T00:00:00").season).toBe("Spring");
    expect(getTerm("2026-05-31T23:59:59").season).toBe("Spring");
  });
  it("classifies Jun–Jul as Summer", () => {
    expect(getTerm("2026-06-01T00:00:00").season).toBe("Summer");
    expect(getTerm("2026-07-31T23:59:59").season).toBe("Summer");
  });
  it("classifies Aug–Dec as Fall", () => {
    expect(getTerm("2026-08-01T00:00:00").season).toBe("Fall");
    expect(getTerm("2026-12-31T23:59:59").season).toBe("Fall");
  });
  it("builds key and label", () => {
    expect(getTerm("2026-09-04T18:00:00")).toMatchObject({
      key: "2026-Fall", label: "Fall 2026", season: "Fall", year: 2026,
    });
  });
});

describe("termBounds", () => {
  it("Fall window", () => {
    expect(termBounds("2026-Fall")).toEqual({
      startIso: "2026-08-01T00:00:00", endIso: "2026-12-31T23:59:59",
    });
  });
  it("Spring window", () => {
    expect(termBounds("2025-Spring")).toEqual({
      startIso: "2025-01-01T00:00:00", endIso: "2025-05-31T23:59:59",
    });
  });
});

describe("compareTermsDesc", () => {
  it("orders newest first, Fall > Summer > Spring within a year", () => {
    const terms = [
      { season: "Spring", year: 2026 }, { season: "Fall", year: 2025 },
      { season: "Fall", year: 2026 }, { season: "Summer", year: 2026 },
    ] as const;
    const sorted = [...terms].sort(compareTermsDesc).map(t => `${t.year}-${t.season}`);
    expect(sorted).toEqual(["2026-Fall", "2026-Summer", "2026-Spring", "2025-Fall"]);
  });
});

describe("academicYearTerms", () => {
  it("Aug–Dec: AY starts this year", () => {
    expect(academicYearTerms(2026, 9)).toEqual(["2026-Fall", "2027-Spring", "2027-Summer"]);
  });
  it("Jan–Jul: AY started last year", () => {
    expect(academicYearTerms(2026, 3)).toEqual(["2025-Fall", "2026-Spring", "2026-Summer"]);
  });
});

describe("buildTermSummaries", () => {
  it("counts occurred meetings per term and attended intersection", () => {
    const meetings = [
      { id: "a", start_time: "2026-09-04T18:00:00" }, // Fall 2026
      { id: "b", start_time: "2026-10-09T18:00:00" }, // Fall 2026
      { id: "c", start_time: "2026-02-06T18:00:00" }, // Spring 2026
    ];
    const attended = new Set(["a", "c"]);
    const res = buildTermSummaries(meetings, attended);
    expect(res.totalAllTime).toBe(3);
    expect(res.attendedAllTime).toBe(2);
    const fall = res.terms.find(t => t.key === "2026-Fall")!;
    expect(fall).toMatchObject({ total: 2, attended: 1 });
    const spring = res.terms.find(t => t.key === "2026-Spring")!;
    expect(spring).toMatchObject({ total: 1, attended: 1 });
    // newest-first
    expect(res.terms[0].key).toBe("2026-Fall");
  });
});

describe("pagination + percentage", () => {
  it("pageRange", () => {
    expect(pageRange(1, 10)).toEqual({ from: 0, to: 9 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });
  it("hasMore", () => {
    expect(hasMore(1, 10, 25)).toBe(true);
    expect(hasMore(3, 10, 25)).toBe(false);
    expect(hasMore(1, 10, 10)).toBe(false);
  });
  it("percentage rounds and guards zero", () => {
    expect(percentage(3, 4)).toBe(75);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(1, 3)).toBe(33);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/stats-terms.test.ts`
Expected: FAIL — `stats-terms` module / exports not found.

- [ ] **Step 3: Implement `lib/stats-terms.ts`**

```ts
// Shared types + pure helpers for the member attendance stats feature.
// No I/O — everything here is unit-tested and orchestrated by lib/stats-data.ts.

export type Season = "Spring" | "Summer" | "Fall";
export type Term = { key: string; label: string; season: Season; year: number };
export type TermKey = Term["key"];
export type View = "attended" | "missed" | "all";
export type Scope = TermKey | "all";

export type StatsMeeting = {
  id: string;
  title: string;
  start_time: string;
  attended: boolean;
  description?: string;
};

export type TermSummary = {
  key: string;
  label: string;
  season: Season;
  year: number;
  attended: number; // this user, occurred only
  total: number;    // org, occurred only
};

export type MemberStats = {
  orgId: string;
  orgName: string;
  attendeeId: string | null;
  role: string | null;
  status: string | null;
  isMember: boolean;
  threshold: number;
  remaining: number;
  attendedAllTime: number;
  totalAllTime: number;
  terms: TermSummary[];
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type MeetingRow = { id: string; start_time: string };

const SEASON_ORDER: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2 };

// Classify by the date PARTS of the string (EST wall-clock, stored tz-less),
// never via Date.getMonth() which depends on the server timezone.
export function getTerm(startTime: string): Term {
  const year = Number(startTime.slice(0, 4));
  const month = Number(startTime.slice(5, 7)); // 1-12
  const season: Season = month <= 5 ? "Spring" : month <= 7 ? "Summer" : "Fall";
  return { key: `${year}-${season}`, label: `${season} ${year}`, season, year };
}

export function compareTermsDesc(
  a: { season: Season; year: number },
  b: { season: Season; year: number },
): number {
  if (a.year !== b.year) return b.year - a.year;
  return SEASON_ORDER[b.season] - SEASON_ORDER[a.season];
}

export function termBounds(key: TermKey): { startIso: string; endIso: string } {
  const [yearStr, season] = key.split("-") as [string, Season];
  const year = Number(yearStr);
  switch (season) {
    case "Spring": return { startIso: `${year}-01-01T00:00:00`, endIso: `${year}-05-31T23:59:59` };
    case "Summer": return { startIso: `${year}-06-01T00:00:00`, endIso: `${year}-07-31T23:59:59` };
    case "Fall":   return { startIso: `${year}-08-01T00:00:00`, endIso: `${year}-12-31T23:59:59` };
  }
}

// AY starts in August. Aug–Dec → AY start = this year; Jan–Jul → previous year.
export function academicYearTerms(year: number, month: number): TermKey[] {
  const startYear = month >= 8 ? year : year - 1;
  return [`${startYear}-Fall`, `${startYear + 1}-Spring`, `${startYear + 1}-Summer`];
}

export function buildTermSummaries(
  orgMeetings: MeetingRow[],
  attendedMeetingIds: Set<string>,
): { terms: TermSummary[]; totalAllTime: number; attendedAllTime: number } {
  const map = new Map<string, TermSummary>();
  let totalAllTime = 0;
  let attendedAllTime = 0;
  for (const m of orgMeetings) {
    const t = getTerm(m.start_time);
    totalAllTime++;
    const attended = attendedMeetingIds.has(m.id);
    if (attended) attendedAllTime++;
    const existing = map.get(t.key);
    if (existing) {
      existing.total++;
      if (attended) existing.attended++;
    } else {
      map.set(t.key, {
        key: t.key, label: t.label, season: t.season, year: t.year,
        total: 1, attended: attended ? 1 : 0,
      });
    }
  }
  const terms = Array.from(map.values()).sort(compareTermsDesc);
  return { terms, totalAllTime, attendedAllTime };
}

export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function hasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total;
}

export function percentage(attended: number, total: number): number {
  return total === 0 ? 0 : Math.round((attended / total) * 100);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run lib/stats-terms.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/stats-terms.ts lib/stats-terms.test.ts
git commit -m "feat(stats): pure term/aggregation/pagination helpers with tests"
```

---

## Task 2: Membership threshold helper (`lib/membership.ts`) + refactor check-in

**Goal:** One source of truth for the membership threshold and `isMember` logic, shared by the stats layer and the existing check-in flow (fixes the 3-vs-5 mismatch).

**Files:**
- Create: `lib/membership.ts`
- Test: `lib/membership.test.ts`
- Modify: `app/[orgSlug]/checkin/actions.ts` (lines 5-9, 18)

**Acceptance Criteria:**
- [ ] `membershipThreshold(slug)` returns the per-org threshold or the default.
- [ ] `resolveMembership` returns `{threshold, isMember, remaining}` with `isMember = status==="active" || attended >= threshold`.
- [ ] `checkin/actions.ts` imports the config from `lib/membership.ts` (no duplicate map).

**Verify:** `npx vitest run lib/membership.test.ts` → all pass; `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// lib/membership.test.ts
import { describe, it, expect } from "vitest";
import { membershipThreshold, resolveMembership, DEFAULT_THRESHOLD } from "./membership";

describe("membershipThreshold", () => {
  it("returns per-org threshold", () => expect(membershipThreshold("ACM")).toBe(3));
  it("falls back to default for unknown org", () =>
    expect(membershipThreshold("nope")).toBe(DEFAULT_THRESHOLD));
});

describe("resolveMembership", () => {
  it("active status is a member regardless of count", () => {
    expect(resolveMembership("member", "active", 0, "ACM"))
      .toEqual({ threshold: 3, isMember: true, remaining: 3 });
  });
  it("non-active becomes member once count reaches threshold", () => {
    expect(resolveMembership(null, "pending", 3, "ACM"))
      .toEqual({ threshold: 3, isMember: true, remaining: 0 });
  });
  it("non-member shows remaining", () => {
    expect(resolveMembership(null, null, 1, "ACM"))
      .toEqual({ threshold: 3, isMember: false, remaining: 2 });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/membership.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/membership.ts`**

```ts
// Single source of truth for org membership thresholds and member status.
// Shared by the check-in flow (app/[orgSlug]/checkin/actions.ts) and the
// member stats layer (lib/stats-data.ts).

export const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  // Add org slugs and their required attendance count here.
  ACM: 3,
};
export const DEFAULT_THRESHOLD = 0;

export function membershipThreshold(orgSlug: string): number {
  return ORG_MEMBERSHIP_THRESHOLDS[orgSlug] ?? DEFAULT_THRESHOLD;
}

export function resolveMembership(
  role: string | null,
  status: string | null,
  attendedAllTime: number,
  orgSlug: string,
): { threshold: number; isMember: boolean; remaining: number } {
  const threshold = membershipThreshold(orgSlug);
  const isMember = status === "active" || attendedAllTime >= threshold;
  const remaining = Math.max(threshold - attendedAllTime, 0);
  return { threshold, isMember, remaining };
}
```

- [ ] **Step 4: Refactor `app/[orgSlug]/checkin/actions.ts`**

Replace the local threshold declarations (lines 5-9) with an import, and use the shared getter.

Change the top of the file from:
```ts
import { createClient } from "../../utils/supabase/client";

const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  // Add org slugs and their required attendance count here
  "ACM": 3,
};
const DEFAULT_THRESHOLD = 0;
```
to:
```ts
import { createClient } from "../../utils/supabase/client";
import { membershipThreshold } from "@/lib/membership";
```
And change the threshold lookup (was line 18):
```ts
  const threshold = ORG_MEMBERSHIP_THRESHOLDS[orgSlug] ?? DEFAULT_THRESHOLD;
```
to:
```ts
  const threshold = membershipThreshold(orgSlug);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run lib/membership.test.ts && npx tsc --noEmit`
Expected: tests PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/membership.ts lib/membership.test.ts app/[orgSlug]/checkin/actions.ts
git commit -m "refactor(membership): shared threshold config + resolveMembership helper"
```

---

## Task 3: Clerk-JWT Supabase server client (`app/utils/supabase/server.ts`)

**Goal:** A server-only Supabase client that forwards the Clerk session token (RLS-ready), named distinctly from the `@supabase/ssr` client used by the `aed` branches.

**Files:**
- Create: `app/utils/supabase/server.ts`

**Acceptance Criteria:**
- [ ] Exports `createClerkSupabaseClient()` returning a supabase-js client configured with an `accessToken` callback reading the Clerk token.
- [ ] No import from `@supabase/ssr` (avoids the naming collision).

**Verify:** `npx tsc --noEmit` clean. (Runtime auth requires a request context + the one-time Clerk↔Supabase dashboard setup from the spec; verified end-to-end in Task 7's manual check.)

**Steps:**

- [ ] **Step 1: Implement the client**

```ts
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client that forwards the Clerk session token so Postgres
// sees the Clerk identity (authenticated role). RLS is disabled today; this is
// the RLS-ready seam. Named createClerkSupabaseClient to avoid colliding with
// the @supabase/ssr createServerClient used on the aed branch.
//
// One-time setup (see design spec): enable the Supabase integration in the Clerk
// dashboard, then register Clerk as a Third-Party Auth provider in Supabase.
// Until then getToken() returns null and this behaves like the anon client
// (works because RLS is off).
export function createClerkSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await auth()).getToken() },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/utils/supabase/server.ts
git commit -m "feat(supabase): server-only Clerk-JWT client (RLS-ready)"
```

---

## Task 4: Data layer server actions (`lib/stats-data.ts`)

**Goal:** The `getMemberStats` and `getMeetingsPage` server actions — the seam the page/StatsView call — deriving identity server-side and orchestrating Supabase queries over the Task 1 pure helpers.

**Files:**
- Create: `lib/stats-data.ts`

**Acceptance Criteria:**
- [ ] `getMemberStats(orgSlug)` returns a `MemberStats` (org resolve, attendee/membership resolve, occurred aggregation, current-AY term filter, resolved status). Throws `"ORG_NOT_FOUND"` on unknown slug.
- [ ] `getMeetingsPage(orgId, scope, view, page)` returns a `Page<StatsMeeting>` with the correct window (capped at now), attended flag, and view filtering (attended = `in`, missed = `not.in`, all = none).
- [ ] Both derive the Clerk user from `auth()` internally; neither accepts a user id argument.

**Verify:** `npx tsc --noEmit` clean. Behavior verified against seed data in Task 7's manual check (needs a running app + DB).

**Steps:**

- [ ] **Step 1: Implement `lib/stats-data.ts`**

```ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/app/utils/supabase/server";
import { resolveMembership } from "@/lib/membership";
import {
  academicYearTerms,
  buildTermSummaries,
  hasMore,
  pageRange,
  termBounds,
  type MemberStats,
  type Page,
  type Scope,
  type StatsMeeting,
  type View,
} from "@/lib/stats-terms";

// Current time as EST wall-clock parts + an ISO string usable for tz-less
// `start_time` comparisons (meetings.start_time is timestamp WITHOUT time zone,
// and all club times are EST).
function nowEst(): { year: number; month: number; iso: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(
    fmt.formatToParts(new Date()).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    year: Number(p.year),
    month: Number(p.month),
    iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`,
  };
}

export async function getMemberStats(orgSlug: string): Promise<MemberStats> {
  const { userId } = await auth();
  const supabase = createClerkSupabaseClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();
  if (!org) throw new Error("ORG_NOT_FOUND");

  let attendeeId: string | null = null;
  let role: string | null = null;
  let status: string | null = null;

  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    attendeeId = attendee?.id ?? null;

    const { data: membership } = await supabase
      .from("memberships").select("role, status")
      .eq("org_id", org.id).eq("user_id", userId).maybeSingle();
    role = membership?.role ?? null;
    status = membership?.status ?? null;
  }

  const now = nowEst();

  const { data: orgMeetings } = await supabase
    .from("meetings")
    .select("id, start_time")
    .eq("org_id", org.id)
    .lte("start_time", now.iso);

  let attendedIds = new Set<string>();
  if (attendeeId) {
    const { data: att } = await supabase
      .from("attendance")
      .select("meeting_id")
      .eq("org_id", org.id)
      .eq("attendee_id", attendeeId);
    attendedIds = new Set((att ?? []).map((a) => a.meeting_id as string));
  }

  const { terms: allTerms, totalAllTime, attendedAllTime } =
    buildTermSummaries(orgMeetings ?? [], attendedIds);

  const ayKeys = new Set(academicYearTerms(now.year, now.month));
  const terms = allTerms.filter((t) => ayKeys.has(t.key) && t.total > 0);

  const { threshold, isMember, remaining } = resolveMembership(
    role, status, attendedAllTime, org.slug,
  );

  return {
    orgId: org.id,
    orgName: org.name,
    attendeeId,
    role,
    status,
    isMember,
    threshold,
    remaining,
    attendedAllTime,
    totalAllTime,
    terms,
  };
}

export async function getMeetingsPage(
  orgId: string,
  scope: Scope,
  view: View,
  page: number,
  pageSize = 10,
): Promise<Page<StatsMeeting>> {
  const { userId } = await auth();
  const supabase = createClerkSupabaseClient();
  const now = nowEst();

  // Window (always capped at now — occurred meetings only).
  let startIso = "0001-01-01T00:00:00";
  let endIso = now.iso;
  if (scope !== "all") {
    const b = termBounds(scope);
    startIso = b.startIso;
    endIso = b.endIso < now.iso ? b.endIso : now.iso;
  }

  // Attended meeting ids within the window.
  const attendedIds = new Set<string>();
  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    const attendeeId = attendee?.id ?? null;
    if (attendeeId) {
      const { data: att } = await supabase
        .from("attendance")
        .select("meeting_id, meetings!inner(start_time)")
        .eq("org_id", orgId)
        .eq("attendee_id", attendeeId)
        .gte("meetings.start_time", startIso)
        .lte("meetings.start_time", endIso);
      for (const a of att ?? []) attendedIds.add((a as { meeting_id: string }).meeting_id);
    }
  }

  const attendedArr = Array.from(attendedIds);
  const { from, to } = pageRange(page, pageSize);

  let query = supabase
    .from("meetings")
    .select("id, title, start_time, description, questions", { count: "exact" })
    .eq("org_id", orgId)
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: false });

  if (view === "attended") {
    if (attendedArr.length === 0) {
      return { items: [], total: 0, page, pageSize, hasMore: false };
    }
    query = query.in("id", attendedArr);
  } else if (view === "missed" && attendedArr.length > 0) {
    query = query.not("id", "in", `(${attendedArr.join(",")})`);
  }

  const { data, count } = await query.range(from, to);
  const total = count ?? 0;

  const items: StatsMeeting[] = (data ?? []).map((m) => {
    const row = m as {
      id: string; title: string; start_time: string;
      description: string | null; questions: string[] | null;
    };
    return {
      id: row.id,
      title: row.title,
      start_time: row.start_time,
      attended: attendedIds.has(row.id),
      description: row.description ?? undefined,
    };
  });

  return { items, total, page, pageSize, hasMore: hasMore(page, pageSize, total) };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/stats-data.ts
git commit -m "feat(stats): getMemberStats + getMeetingsPage server actions"
```

---

## Task 5: Presentational component updates (types, view toggle, badge)

**Goal:** Repoint the leaf components off `mock-meetings`' `Meeting` type onto `StatsMeeting`, switch the view toggle to `Attended | Missed | All`, and surface role/status in the badge — all still pure presentational.

**Files:**
- Modify: `components/stats/view-toggle.tsx`
- Modify: `components/stats/meeting-list-item.tsx`
- Modify: `components/stats/meetings-list.tsx`
- Modify: `components/stats/membership-badge.tsx`

**Acceptance Criteria:**
- [ ] `ViewToggle` offers `attended | missed | all` with `MeetingView` typed accordingly.
- [ ] `MeetingListItem` and `MeetingsList` consume `StatsMeeting` from `@/lib/stats-terms`.
- [ ] `MembershipBadge` shows the role when it's a non-member role (e.g. Officer), else member/potential.

**Verify:** `npx tsc --noEmit` clean; `npm run build` compiles the stats route.

**Steps:**

- [ ] **Step 1: `view-toggle.tsx` — 3-way options**

Replace the type + options:
```ts
export type MeetingView = "attended" | "missed" | "all";

const OPTIONS: { value: MeetingView; label: string }[] = [
  { value: "attended", label: "Attended" },
  { value: "missed", label: "Missed" },
  { value: "all", label: "All Meetings" },
];
```
(The rest of the dropdown component is unchanged — it renders `OPTIONS` and the `aria-label="Meeting view"` list.)

- [ ] **Step 2: `meeting-list-item.tsx` — consume `StatsMeeting`**

Change the import:
```ts
import type { StatsMeeting } from "@/lib/stats-terms";
```
Change the prop type:
```ts
export function MeetingListItem({ meeting }: { meeting: StatsMeeting }) {
```
The body is unchanged — it already reads `meeting.title`, `meeting.start_time`, and gates the info toggle on `meeting.description?.trim()`.

- [ ] **Step 3: `meetings-list.tsx` — consume `StatsMeeting`**

Change the import + prop type:
```ts
import type { StatsMeeting } from "@/lib/stats-terms";
// ...
export function MeetingsList({
  meetings,
  emptyMessage = "No meetings yet.",
}: {
  meetings: StatsMeeting[];
  emptyMessage?: string;
}) {
```
Body unchanged (maps to `MeetingListItem`).

- [ ] **Step 4: `membership-badge.tsx` — reflect role**

Add an optional `role` prop and derive the label:
```ts
export function MembershipBadge({
  isMember,
  orgName,
  role,
}: {
  isMember: boolean;
  orgName: string;
  role?: string | null;
}) {
  const label =
    role && role !== "member"
      ? role.charAt(0).toUpperCase() + role.slice(1)
      : isMember
        ? `${orgName} member`
        : "Potential member";
  // ...existing span; replace the ternary text node with {label}...
}
```
Replace the existing `{isMember ? \`${orgName} member\` : "Potential member"}` text node with `{label}`. Officers/owners render as a member visually (`isMember` still drives color).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles. (Type errors in `stats-view.tsx`/`term-tabs.tsx` are expected here and fixed in Tasks 6–7; if `npm run build` fails only on those two files, that's acceptable at this checkpoint — confirm the errors are confined to them.)

- [ ] **Step 6: Commit**

```bash
git add components/stats/view-toggle.tsx components/stats/meeting-list-item.tsx components/stats/meetings-list.tsx components/stats/membership-badge.tsx
git commit -m "feat(stats): repoint leaf components to StatsMeeting + 3-way view toggle"
```

---

## Task 6: Controlled term tab bar (`components/stats/term-tabs.tsx`)

**Goal:** Convert `TermTabs` from a client-side grouper into a controlled tab bar driven by server-provided `TermSummary[]` plus an "All semesters" tab; it renders tabs only (meeting rendering moves to `StatsView`).

**Files:**
- Modify: `components/stats/term-tabs.tsx`

**Acceptance Criteria:**
- [ ] `TermTabs` accepts `{ terms: TermSummary[]; activeScope: Scope; onSelect: (scope: Scope) => void }`.
- [ ] Renders one tab per term (label + `attended/total` count) plus a trailing "All semesters" tab.
- [ ] Selecting a tab calls `onSelect` with the term key or `"all"`; the active tab is styled.
- [ ] No import from `mock-meetings`; no `MeetingsList` rendering here.

**Verify:** `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1: Rewrite `term-tabs.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { Scope, TermSummary } from "@/lib/stats-terms";

export function TermTabs({
  terms,
  activeScope,
  onSelect,
}: {
  terms: TermSummary[];
  activeScope: Scope;
  onSelect: (scope: Scope) => void;
}) {
  const tabs: { key: Scope; label: string; count: string }[] = [
    ...terms.map((t) => ({
      key: t.key as Scope,
      label: t.label,
      count: `${t.attended}/${t.total}`,
    })),
    { key: "all" as Scope, label: "All semesters", count: "" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Semester"
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeScope;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-action text-white shadow-[0_4px_12px_rgba(225,59,53,0.3)]"
                : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white",
            )}
          >
            {tab.label}
            {tab.count && <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `term-tabs.tsx` (remaining errors, if any, are in `stats-view.tsx`, fixed in Task 7).

- [ ] **Step 3: Commit**

```bash
git add components/stats/term-tabs.tsx
git commit -m "feat(stats): controlled term tab bar with all-semesters tab"
```

---

## Task 7: Server-driven StatsView + real page + delete mock

**Goal:** Wire the real data end-to-end — the page fetches `getMemberStats` + the initial page and passes them to a `StatsView` that refetches via `getMeetingsPage` on tab/view/Load-more, with header percentage and status. Delete the mock module.

**Files:**
- Modify: `app/[orgSlug]/stats/page.tsx`
- Modify: `components/stats/stats-view.tsx`
- Delete: `components/stats/mock-meetings.ts`

**Acceptance Criteria:**
- [ ] Page redirects unauthenticated users to `/`, shows "Club does not exist" on unknown slug, and renders `StatsView` with initial data otherwise.
- [ ] Header shows scope percentage, attended/total count, status badge, and "X of N to become a member" for non-members.
- [ ] Changing tab or view refetches page 1; "Load more" appends the next page using `hasMore`.
- [ ] `mock-meetings.ts` is deleted and nothing imports it.

**Verify:** `npx tsc --noEmit && npm run build` clean. Manual: run `npm run dev`, sign in, visit `/acm/stats` against seeded data — Attended/Missed/All + term tabs + all-time + Load more behave; a member's counts match the DB.

**Steps:**

- [ ] **Step 1: Rewrite `app/[orgSlug]/stats/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { StatsView } from "@/components/stats/stats-view";
import { getMemberStats, getMeetingsPage } from "@/lib/stats-data";
import type { Scope } from "@/lib/stats-terms";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  let stats;
  try {
    stats = await getMemberStats(orgSlug);
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <p className="text-center text-white/80">Club does not exist</p>
      </main>
    );
  }

  const initialScope: Scope = stats.terms[0]?.key ?? "all";
  const initialPage = await getMeetingsPage(stats.orgId, initialScope, "attended", 1);

  return (
    <main className="mx-auto w-full max-w-4xl">
      <StatsView stats={stats} initialScope={initialScope} initialPage={initialPage} />
    </main>
  );
}
```

- [ ] **Step 2: Rewrite `components/stats/stats-view.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";

import { useBranding } from "@/app/components/BrandingProvider";
import { getMeetingsPage } from "@/lib/stats-data";
import {
  percentage,
  type MemberStats,
  type Page,
  type Scope,
  type StatsMeeting,
} from "@/lib/stats-terms";
import { MembershipBadge } from "./membership-badge";
import { MeetingsList } from "./meetings-list";
import { TermTabs } from "./term-tabs";
import { ViewToggle, type MeetingView } from "./view-toggle";

export function StatsView({
  stats,
  initialScope,
  initialPage,
}: {
  stats: MemberStats;
  initialScope: Scope;
  initialPage: Page<StatsMeeting>;
}) {
  const { name } = useBranding();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [view, setView] = useState<MeetingView>("attended");
  const [page, setPage] = useState<Page<StatsMeeting>>(initialPage);
  const [items, setItems] = useState<StatsMeeting[]>(initialPage.items);
  const [pending, startTransition] = useTransition();

  function refetch(nextScope: Scope, nextView: MeetingView) {
    startTransition(async () => {
      const res = await getMeetingsPage(stats.orgId, nextScope, nextView, 1);
      setPage(res);
      setItems(res.items);
    });
  }

  function onSelectScope(next: Scope) {
    setScope(next);
    refetch(next, view);
  }
  function onChangeView(next: MeetingView) {
    setView(next);
    refetch(scope, next);
  }
  function onLoadMore() {
    startTransition(async () => {
      const res = await getMeetingsPage(stats.orgId, scope, view, page.page + 1);
      setPage(res);
      setItems((prev) => [...prev, ...res.items]);
    });
  }

  const activeTerm = scope === "all" ? null : stats.terms.find((t) => t.key === scope);
  const attended = scope === "all" ? stats.attendedAllTime : activeTerm?.attended ?? 0;
  const total = scope === "all" ? stats.totalAllTime : activeTerm?.total ?? 0;
  const pct = percentage(attended, total);

  const countLabel = stats.isMember
    ? `${attended} of ${total} meetings attended (${pct}%)`
    : `${stats.attendedAllTime} of ${stats.threshold} meetings — ${stats.remaining} more to become a member`;

  const emptyMessage =
    view === "attended"
      ? `No meetings attended yet. Check in at the next ${name} event!`
      : view === "missed"
        ? "No missed meetings here."
        : "No club meetings yet. Check back soon!";

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 md:px-10 md:py-12">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">
            Your Activity
          </p>
          <MembershipBadge isMember={stats.isMember} orgName={name} role={stats.role} />
          <ViewToggle value={view} onChange={onChangeView} />
        </div>
        <h1 className="text-2xl font-bold text-white md:text-3xl">Your Attendance</h1>
        <p className="text-sm text-white/60">{countLabel}</p>
      </header>

      <TermTabs terms={stats.terms} activeScope={scope} onSelect={onSelectScope} />

      <div className={`max-h-[60vh] overflow-y-auto pr-1 ${pending ? "opacity-60" : ""}`}>
        <MeetingsList meetings={items} emptyMessage={emptyMessage} />
        {page.hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={pending}
            className="mt-4 w-full rounded-full border border-white/25 bg-white/5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Delete the mock module**

Run: `git rm components/stats/mock-meetings.ts`
Expected: removed. Confirm nothing imports it:
Run: `grep -rn "mock-meetings" app components lib` → no results.

- [ ] **Step 4: Typecheck, build, manual verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.
Manual: `npm run dev`; sign in; open `/acm/stats`. Confirm term tabs list current-AY terms, Attended/Missed/All switch the list, "All semesters" shows the all-time percentage, Load more appends when a term has > 10 occurred meetings, and a known member's attended/total matches the DB.

- [ ] **Step 5: Commit**

```bash
git add app/[orgSlug]/stats/page.tsx components/stats/stats-view.tsx
git commit -m "feat(stats): server-driven StatsView + real data page; remove mock"
```

---

## Task 8 (Stretch): Cache org meeting totals

**Goal:** Cache the org-meetings aggregation (the denominator source) so the totals aren't recomputed on every load, invalidated when meetings change.

**Files:**
- Modify: `lib/stats-data.ts`

**Acceptance Criteria:**
- [ ] The occurred org-meetings fetch in `getMemberStats` is wrapped in `unstable_cache`, keyed by `orgId`, tagged `org-meetings:${orgId}`.
- [ ] A short `revalidate` TTL is set; a comment documents calling `revalidateTag(\`org-meetings:${orgId}\`)` on meeting create/update.

**Verify:** `npx tsc --noEmit && npm run build` clean; manual: repeated `/acm/stats` loads still show correct totals; adding a meeting (or waiting past TTL) refreshes them.

**Steps:**

- [ ] **Step 1: Extract + cache the org-meetings fetch**

Add near the top of `lib/stats-data.ts`:
```ts
import { unstable_cache } from "next/cache";
```
Replace the inline org-meetings query in `getMemberStats` with a cached loader:
```ts
const loadOrgMeetings = unstable_cache(
  async (orgId: string, nowIso: string) => {
    const supabase = createClerkSupabaseClient();
    const { data } = await supabase
      .from("meetings")
      .select("id, start_time")
      .eq("org_id", orgId)
      .lte("start_time", nowIso);
    return data ?? [];
  },
  ["org-meetings"],
  { revalidate: 300 }, // 5 min TTL fallback
);
```
And in `getMemberStats`, swap:
```ts
  const { data: orgMeetings } = await supabase
    .from("meetings")
    .select("id, start_time")
    .eq("org_id", org.id)
    .lte("start_time", now.iso);
```
for:
```ts
  // Cached: org meeting totals change only when officers add/edit meetings.
  // Invalidate on meeting create/update via revalidateTag(`org-meetings:${org.id}`).
  const orgMeetings = await loadOrgMeetings(org.id, now.iso);
```
Then update the `buildTermSummaries(orgMeetings ?? [], ...)` call to `buildTermSummaries(orgMeetings, ...)`.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/stats-data.ts
git commit -m "feat(stats): cache org meeting totals (5m TTL, tag-invalidated)"
```

---

## Task 9 (Stretch): Meeting details modal with questions + responses

**Goal:** A modal that shows a meeting's details plus its questions; for attended meetings, the user's own responses.

**Files:**
- Create: `components/stats/meeting-details-modal.tsx`
- Modify: `lib/stats-data.ts` (add `getMeetingDetails`)
- Modify: `components/stats/meeting-list-item.tsx` (open modal)
- Modify: `lib/stats-terms.ts` (add `hasDetails` to `StatsMeeting`)

**Acceptance Criteria:**
- [ ] `getMeetingDetails(meetingId)` returns `{ title, start_time, end_time, description, questions, answers }` with `answers` scoped to the server-derived attendee (null if not attended).
- [ ] The modal lists each question; attended → shows the paired response; missed → shows questions only.
- [ ] `answers` is parsed defensively (index-aligned array OR object keyed by question), never throwing on an unexpected shape.

**Verify:** `npx tsc --noEmit && npm run build` clean; manual: an attended meeting with questions shows responses; a missed meeting shows questions without responses.

**Steps:**

- [ ] **Step 1: Add `hasDetails` to `StatsMeeting` and populate it**

In `lib/stats-terms.ts`, extend the type:
```ts
export type StatsMeeting = {
  id: string;
  title: string;
  start_time: string;
  attended: boolean;
  description?: string;
  hasDetails: boolean; // description present OR questions exist
};
```
In `lib/stats-data.ts` `getMeetingsPage`, set it when mapping rows:
```ts
    return {
      id: row.id,
      title: row.title,
      start_time: row.start_time,
      attended: attendedIds.has(row.id),
      description: row.description ?? undefined,
      hasDetails:
        Boolean(row.description?.trim()) ||
        (Array.isArray(row.questions) && row.questions.length > 0),
    };
```

- [ ] **Step 2: Add `getMeetingDetails` to `lib/stats-data.ts`**

```ts
export type MeetingDetails = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  questions: string[];
  answers: string[] | null; // aligned to questions; null if user didn't attend
};

export async function getMeetingDetails(meetingId: string): Promise<MeetingDetails> {
  const { userId } = await auth();
  const supabase = createClerkSupabaseClient();

  const { data: m } = await supabase
    .from("meetings")
    .select("id, title, start_time, end_time, description, questions")
    .eq("id", meetingId)
    .single();
  if (!m) throw new Error("MEETING_NOT_FOUND");

  const questions: string[] = Array.isArray(m.questions) ? m.questions : [];

  let answers: string[] | null = null;
  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    if (attendee?.id) {
      const { data: att } = await supabase
        .from("attendance")
        .select("answers")
        .eq("meeting_id", meetingId)
        .eq("attendee_id", attendee.id)
        .maybeSingle();
      if (att) answers = normalizeAnswers(att.answers, questions);
    }
  }

  return {
    id: m.id, title: m.title, start_time: m.start_time,
    end_time: m.end_time ?? null, description: m.description ?? null,
    questions, answers,
  };
}

// attendance.answers is jsonb with no standardized shape yet. Accept an
// index-aligned array or an object keyed by question text; fall back to empty.
function normalizeAnswers(raw: unknown, questions: string[]): string[] {
  if (Array.isArray(raw)) return questions.map((_, i) => String(raw[i] ?? ""));
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return questions.map((q) => String(obj[q] ?? ""));
  }
  return questions.map(() => "");
}
```

- [ ] **Step 3: Create `components/stats/meeting-details-modal.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { getMeetingDetails, type MeetingDetails } from "@/lib/stats-data";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
});

export function MeetingDetailsModal({
  meetingId,
  onClose,
}: {
  meetingId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<MeetingDetails | null>(null);

  useEffect(() => {
    let active = true;
    getMeetingDetails(meetingId).then((d) => {
      if (active) setDetails(d);
    });
    return () => {
      active = false;
    };
  }, [meetingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-brand-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!details ? (
          <p className="text-white/60">Loading…</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">{details.title}</h2>
                <p className="text-xs text-white/60">
                  {DATE_FORMAT.format(new Date(details.start_time))}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {details.description && (
              <p className="mb-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
                {details.description}
              </p>
            )}

            {details.questions.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {details.questions.map((q, i) => (
                  <li key={i} className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-sm font-medium text-white">{q}</p>
                    {details.answers ? (
                      <p className="mt-1 text-sm text-brand-primary">
                        {details.answers[i] || "—"}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs italic text-white/40">
                        You did not attend this meeting.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/50">No questions were asked at this meeting.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the modal into `meeting-list-item.tsx`**

Replace the inline description toggle with a details button that opens the modal. Update imports:
```ts
import { useState } from "react";
import { Calendar, Info } from "lucide-react";
import type { StatsMeeting } from "@/lib/stats-terms";
import { MeetingDetailsModal } from "./meeting-details-modal";
```
Replace the component body's toggle logic:
```tsx
export function MeetingListItem({ meeting }: { meeting: StatsMeeting }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-background">
          <Calendar className="h-5 w-5 text-brand-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{meeting.title}</p>
          <p className="text-xs text-white/60">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short", month: "short", day: "numeric", year: "numeric",
            }).format(new Date(meeting.start_time))}
          </p>
        </div>
        {meeting.hasDetails && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </button>
        )}
      </div>
      {showModal && (
        <MeetingDetailsModal meetingId={meeting.id} onClose={() => setShowModal(false)} />
      )}
    </li>
  );
}
```

- [ ] **Step 5: Typecheck, build, manual verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.
Manual: open a meeting with questions you attended → responses show; open a missed meeting with questions → "You did not attend this meeting."

- [ ] **Step 6: Commit**

```bash
git add lib/stats-terms.ts lib/stats-data.ts components/stats/meeting-details-modal.tsx components/stats/meeting-list-item.tsx
git commit -m "feat(stats): meeting details modal with questions + user responses"
```

---

## Self-Review

**Spec coverage:**
- Active/current-term meetings + per-term % → Tasks 1, 4, 7.
- Attended / Missed views + details-if-missing → Tasks 5, 7, 9.
- Status display (hybrid) → Tasks 2, 4, 7.
- Per-semester Fall/Spring/Summer + all-time + archival → Tasks 1, 6, 7.
- Pagination → Tasks 1, 4, 7.
- Server-side + Clerk-JWT bridge, RLS-ready → Tasks 3, 4.
- `meetings.description` migration → Task 0.
- Stretch: caching → Task 8; details modal (questions + responses) → Task 9.

**Placeholder scan:** none — every code step contains full code.

**Type consistency:** `StatsMeeting`, `TermSummary`, `MemberStats`, `Page`, `Scope`, `View` defined in Task 1 and used verbatim in Tasks 4–9. `hasDetails` is added to `StatsMeeting` in Task 9 (the only task that consumes it); Tasks 5/7 don't reference it, so the baseline compiles without it. `getMemberStats`/`getMeetingsPage`/`getMeetingDetails` signatures are consistent across producer (Task 4/9) and consumers (Task 7/9).
