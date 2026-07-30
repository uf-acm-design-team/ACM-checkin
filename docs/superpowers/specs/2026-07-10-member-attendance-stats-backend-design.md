# Design: Member Attendance Stats Backend

**Date:** 2026-07-10
**Branch:** `feat/member-attendance-backend` (off `origin/main` @ `cb4694f`)
**Status:** Approved, ready for implementation plan

## Goal

The stats page at `app/[orgSlug]/stats` currently renders **mock** data
(`getMockMeetings(orgSlug)`). Replace that mock with a real, server-side,
per-user attendance backend so a signed-in member can see, for the club they're
viewing:

- their attendance **percentage / count** out of total meetings,
- their **status** (member/officer/etc. + progress toward membership),
- an **Attended**, **Missed**, and **All** view of meetings,
- **per-semester** tabs (Fall/Spring/Summer) plus an **all-time** view,
- **pagination** within a term,

while keeping the existing `feat/stats-view` UI (view toggle, term tabs,
membership badge). Stretch: cache total-meeting counts, and a meeting-details
modal showing the meeting's questions and the user's responses.

## Context: what exists today

The stats **frontend** is on `main` (merged via PR #16 `feat/stats-view`):

- `app/[orgSlug]/stats/page.tsx` — an async server component that calls the
  synchronous `getMockMeetings(orgSlug)` and passes `{ attendedMeetings,
  clubMeetings }` into `<StatsView>`.
- `components/stats/*` — `stats-view.tsx` (view toggle + membership threshold +
  count labels), `term-tabs.tsx` (groups a full client array by term),
  `view-toggle.tsx` (`attended | club`), `meetings-list.tsx`,
  `meeting-list-item.tsx` (inline description toggle), `membership-badge.tsx`,
  `mock-meetings.ts` (types + `getTerm`/`compareTermsDesc` helpers).
- `Meeting = { id, title, start_time, attended: boolean, description? }`.

The **database** (Supabase, `origin/main` baseline):

| Table | Relevant columns |
|-------|------------------|
| `meetings` | `id uuid`, `org_id uuid`, `title text`, `start_time timestamp` (date+time), `end_time timestamp`, `status boolean` (check-in live *now*, **not** term), `questions text[]`, `created_by text` |
| `attendance` | `id`, `org_id`, `attendee_id`, `meeting_id`, `checked_in_at`, `source`, `answers jsonb` |
| `attendees` | `id`, `email`, `first_name`, `last_name`, `grad_year`, `user_id text` (**Clerk** id) |
| `memberships` | `org_id`, `user_id text` (Clerk id), `role text`, `status text` |
| `organizations` | `id`, `slug`, `name` |

Key facts that shape this design:

- **`meetings.start_time` is a full `timestamp`** (date + time), so the term and
  "already occurred" logic works directly off it. No day column needed.
- **All club times are EST.** `start_time` is `timestamp without time zone`; we
  treat stored values as a fixed club timezone. Term boundaries are month-level,
  so DST is irrelevant.
- **There is no term column.** Term is derived from `start_time`.
- **RLS is disabled** (migration `20260518000100_disable_rls.sql`, PR #13),
  deliberately, because the dumped policies keyed on `auth.uid()` which is null
  under Clerk. The policies were then dropped
  (`20260518000200`) with a note to reintroduce them under a Clerk-aware scheme.
  So there is currently **no DB-level access control**.
- **Auth is Clerk.** `proxy.ts` on `main` runs `clerkMiddleware` +
  `auth.protect()` (route protection only). The app reaches Supabase via the
  **browser anon client** (`app/utils/supabase/client.ts`) — no Clerk token is
  forwarded to Supabase.
- **The Clerk↔Supabase token bridge does not exist.** The
  `app/utils/supabase/server.ts` files on other branches are `@supabase/ssr`
  **cookie** clients from the `aed` (Supabase-native auth) lineage — they do not
  forward a Clerk token, and there is no `server.ts` on `main` at all.

## Decisions (from brainstorming)

1. **Base = `main`** (the `feat/stats-view` UI). We port the good bones from the
   unmerged `orgslug-stats` branch — the `lib/stats-data.ts` seam idea, org
   resolution + auth wiring, and test discipline — but keep `main`'s richer
   attended/missed UI. `orgslug-stats` is **not** merged and only models
   *attended* meetings, so it is a reference, not the base.
2. **Server-side fetch with a Clerk-JWT → Supabase bridge** (RLS-ready). Queries
   run as the `authenticated` role. Identity is derived **server-side** from
   `auth()`; the client never supplies a user id.
3. **RLS stays off for now**, but all data access is done via direct table
   queries (the canonical RLS surface) so reviving RLS later is additive — write
   policies, flip `ENABLE`, no app-code change. No `SECURITY DEFINER` RPC
   footgun.
4. **App-layer join** in a server module (not a Postgres RPC) for the first cut,
   shaped so the internals could later move into an RPC without changing the
   seam signature.
5. **"Occurred" rule:** every count, denominator, and the Missed list includes
   only meetings with `start_time <= now`. Upcoming meetings are excluded until
   they happen.
6. **Two percentage modes:** per-term (each Fall/Spring/Summer tab) and all-time
   (the "across semesters" view).
7. **Archival:** tabs show terms in the **current academic year** only; older
   terms are reachable through the all-time view.
8. **Status is hybrid:** `role` + `status` from the `memberships` row, plus a
   computed "X of N to become a member" for non-members, using
   `ORG_MEMBERSHIP_THRESHOLDS` from `checkin/actions.ts` as the **single**
   threshold source (fixes the current 3-vs-5 mismatch).
9. **Add a nullable `meetings.description text` column** so officers can write
   meeting summaries (the UI already supports `description`).

## Term semantics

Terms are derived from `meetings.start_time`, reusing the existing boundaries in
`components/stats/mock-meetings.ts`:

| Season | Months | Window (EST) |
|--------|--------|--------------|
| Spring | Jan–May | Jan 1 – May 31 |
| Summer | Jun–Jul | Jun 1 – Jul 31 |
| Fall   | Aug–Dec | Aug 1 – Dec 31 |

New pure helper:

```ts
type TermKey = Term["key"];              // e.g. "2026-Fall"
function termBounds(key: TermKey): { start: Date; end: Date };
```

**Current academic year:** an AY runs Fall(Y) → Spring(Y+1) → Summer(Y+1),
starting in August. Given `now`, if month ≥ Aug the AY start year is the current
year, else the previous year. Tab set = the terms in the current AY that have at
least one occurred meeting, newest first.

## Architecture

### 1. Clerk-JWT Supabase client — `app/utils/supabase/server.ts` (new)

Created fresh on the `main` lineage. **Named distinctly** to avoid colliding
with the `@supabase/ssr` `createServerClient` used by the `aed` branches:

```ts
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Server-only. Forwards the Clerk session token so Postgres sees the Clerk
// identity (authenticated role). RLS is off today; this is the RLS-ready seam.
export function createClerkSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await auth()).getToken() },
  );
}
```

Until the one-time dashboard setup is done, `getToken()` returns `null` and the
client behaves like anon — which works today because RLS is off. So this is
**not** a blocker for shipping.

**One-time Clerk↔Supabase third-party auth setup** (native integration; the old
"JWT template named `supabase`" method was deprecated April 2025 — do not use
it):

1. **Clerk Dashboard → Configure → Integrations →** enable **Supabase**. Copy
   the **Clerk domain** (Frontend API URL) it shows.
2. **Supabase Dashboard → Authentication → Third-Party Auth → Add provider →
   Clerk**, paste the Clerk domain, save.
3. Code: the `accessToken` callback above (no JWT secret sharing).

Dashboard labels shift; confirm against live Clerk + Supabase docs when wiring.

### 2. Data seam — `lib/stats-data.ts` (`"use server"`)

Every function derives identity from `auth()` internally. The client passes only
`orgId`, scope, view, and page — never a user id. All `attendance` reads are
filtered by the **server-derived `attendeeId`**, so cross-user reads are
impossible even with RLS off. Meeting totals are org-wide (non-sensitive) by
design.

**Types (the stable contract):**

```ts
type View     = "attended" | "missed" | "all";
type TermKey  = Term["key"];
type Scope    = TermKey | "all";

type StatsMeeting = {
  id: string;
  title: string;
  start_time: string;      // ISO
  attended: boolean;
  hasDetails: boolean;     // description present OR questions.length > 0
};

type TermSummary = {       // occurred only
  key: string; label: string; season: Term["season"]; year: number;
  attended: number;        // this user
  total: number;           // org
};

type MemberStats = {
  orgId: string;
  orgName: string;
  attendeeId: string | null;   // null → user never checked in (zero state)
  role: string | null;         // from memberships row
  status: string | null;       // from memberships row (active/pending)
  isMember: boolean;
  threshold: number;
  remaining: number;           // max(threshold - attendedAllTime, 0)
  attendedAllTime: number;
  totalAllTime: number;
  terms: TermSummary[];        // current-AY tabs, newest first
};

type Page<T> = {
  items: T[]; total: number; page: number; pageSize: number; hasMore: boolean;
};
```

**`getMemberStats(orgSlug): Promise<MemberStats>`** — initial page load:

1. `auth()` → `userId`; resolve org by slug (→ "Club does not exist" on miss).
2. Resolve `attendeeId` (`attendees.user_id = userId`) and the `memberships`
   row (role/status). Either may be null.
3. Two aggregation queries (occurred only, `start_time <= now`):
   - org meetings `select(id, start_time).eq(org_id).lte(start_time, now)` →
     bucket by term → `total` per term + `totalAllTime`. **(Cache target — see
     Stretch.)**
   - the user's attendance joined to meeting `start_time`, occurred → bucket by
     term → `attended` per term + `attendedAllTime`.
4. `threshold = ORG_MEMBERSHIP_THRESHOLDS[slug] ?? DEFAULT_THRESHOLD`;
   `isMember = status === "active" || attendedAllTime >= threshold`;
   `remaining = max(threshold - attendedAllTime, 0)`.
5. Filter `terms` to the current AY, keep `total > 0`, sort desc.

**`getMeetingsPage(orgId, scope, view, page, pageSize = 10): Promise<Page<StatsMeeting>>`**
— per tab/view/page change:

1. `auth()` → `attendeeId`. Window: `termBounds(scope)` or all-time; **upper
   bound always capped at `now`**.
2. Fetch the user's attended `meeting_id`s in the window → a `Set`.
3. Branch by view, ordered `start_time DESC`, paginated with
   `.range((page-1)*pageSize, page*pageSize - 1)`:
   - **attended** — meetings `WHERE id IN attendedIds`; `total = attendedIds.size`.
   - **missed** — meetings `WHERE id NOT IN attendedIds` (PostgREST
     `.not("id","in","(…)")`); `total = totalInWindow - attendedIds.size`.
   - **all** — all meetings in window; `attended` flag from the set;
     `total = totalInWindow`.
4. Map rows → `StatsMeeting`; return `Page`.

Totals use `count: "exact", head: true` (as `checkin/actions.ts` already does).

### 3. Frontend integration

**`app/[orgSlug]/stats/page.tsx`** (stays a server component):

- `auth()` → redirect to `/` if unauthenticated (matches sibling routes).
- `getMemberStats(orgSlug)` → "Club does not exist" on org miss; **zero state**
  if `attendeeId` is null.
- Fetch the initial page
  (`getMeetingsPage(orgId, newestTermKey, "attended", 1)`) and pass both into
  `StatsView`.

**`StatsView`** — refactor from "receives full arrays, groups client-side" to
"server-driven":

- Receives `MemberStats` + initial `Page<StatsMeeting>`.
- Header: status badge (role/status), the percentage for the current scope, and
  "X of N to become a member" for non-members.
- On tab/view/page change → calls `getMeetingsPage`, renders the returned page.

**`TermTabs`** — driven by the server-provided `terms` list **plus an "All
semesters" tab** (all-time scope), instead of grouping a client array.

**`ViewToggle`** — reframed from `attended | club` to **`Attended | Missed |
All`**.

**Pagination** — a "Load more" button in the tabpanel using `Page.hasMore`
(append). Fits the existing max-height scroll container.

**`MeetingListItem`** — `hasDetails` drives the info affordance (baseline: inline
description toggle; stretch: opens the details modal).

**`MembershipBadge`** — extended to reflect role/status from the membership row.

## Stretch goals

1. **Cache total meetings** — wrap the org-meetings aggregation (the denominator
   source) in Next.js `unstable_cache`, keyed by `orgId`, tagged
   `org-meetings:${orgId}`. Invalidate via `revalidateTag` when a meeting is
   created (admin/check-in meeting creation), with a short TTL fallback.
   Non-breaking; seam signatures unchanged.
2. **Meeting-details modal** — a `MeetingDetailsModal` + a
   `getMeetingDetails(meetingId)` server action returning
   `{ title, start_time, end_time, description?, questions[], answers? }`, with
   `answers` scoped to the server-derived attendee. Attended → questions zipped
   with the user's responses; missed → meeting details + questions, no
   responses.

## Migrations

- **`meetings.description`** — add `description text` (nullable). Small,
  additive; unblocks the existing UI's summary affordance.

## Open items (flagged, not blockers)

- **`attendance.answers` (jsonb) shape isn't standardized** — the general
  check-in flow doesn't write answers yet. The details modal will handle
  `answers` as either an index-aligned array or an object keyed by question,
  with graceful fallback. Actual answer capture at check-in is out of scope.
- **Clerk↔Supabase third-party auth** is a one-time dashboard step (above);
  ship works without it because RLS is off.
- **`meetings.created_at` is `time with time zone`** (a schema quirk — a *time*,
  not a timestamp). We don't use it; everything keys on `start_time`.

## Testing

- **Unit (vitest, matches repo norm):** `termBounds` (key→window, EST,
  boundaries Jan 1 / Jul 31 / Aug 1 / Dec 31), `getTerm`/`compareTermsDesc`,
  current-AY filter, percentage math, pagination `hasMore`/`total`.
- **Data actions (Supabase-dependent):** manual verification against seed data,
  matching the repo's current test surface and the `orgslug-stats` precedent.

## Out of scope

- Reviving RLS (we leave it RLS-ready; policy work is a separate effort).
- Officer/admin analytics (this is the member's own view).
- Writing answers at check-in (we only read them).
- Any shell/branding changes.

## Risk / coordination notes

- The `aed` branch has a different `server.ts` (Supabase-cookie). Naming ours
  `createClerkSupabaseClient` avoids collision if `aed` ever merges.
- The "missed" anti-join via PostgREST `NOT IN` is fine at club scale; a Postgres
  RPC anti-join is the clean future optimization and does not change the seam
  signature.
- The stats-only components have no consumers outside the stats page, so the
  `StatsView`/`TermTabs` refactor is contained.
