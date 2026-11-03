# ACM Check-in — Architecture Overview

A 40-minute walkthrough of how the app is put together. By the end you should
know where a request goes, where authorization is enforced, which Supabase
client to use, and what to check first when data mysteriously goes missing.

| # | Section | Time |
|---|---|---|
| 1 | What the app is | 3 min |
| 2 | Where security lives | 7 min |
| 3 | Identity: two ids | 5 min |
| 4 | Authorization model | 7 min |
| 5 | The four Supabase clients | 6 min |
| 6 | Postgres does real work | 5 min |
| 7 | Frontend structure | 4 min |
| 8 | Debugging and known gaps | 3 min |

Short on time? Trim sections 6 and 7. The appendix (guest check-in, API
questions) is reference material for Q&A.

---

## 1. What the app is (3 min)

A check-in app shared by many UF student clubs.

- Members check in at meetings. The app counts attendance and promotes people
  to member once they hit the club's threshold.
- Officers create meetings, run check-in, and manage their roster.
- Guests can check in with just an email, no account.

**Stack:** Next.js 16 (App Router) · React 19 · Clerk (identity) · Supabase
Postgres (data) · Supabase Edge Functions · Tailwind 4 · Vitest.

**The one decision that shapes everything else:** there is no hand-written API.
Most pages talk to Supabase directly from the browser.

---

## 2. Where security lives (7 min)

This is the most important section.

```
Browser ──► Clerk (sign-in, issues a session JWT)
   │
   ├──► Next.js (proxy.ts protects routes, forces onboarding)
   │       └── server actions ──► Supabase (as the user, or as service_role)
   │
   ├──► Supabase REST API ──► RLS policies ──► only the rows you may see
   │         ▲
   │         └── Clerk JWT sent with every request; Supabase verifies it and
   │             exposes the user id as auth.jwt() ->> 'sub'
   │
   └──► Supabase Edge Functions (create-org, update-org-branding)
```

**The browser holds the Supabase anon key.** Anyone can open devtools and query
the database with it. So:

> A check in a React component (`if (!isOfficer)`) is UX, never security.

### Two enforcement points

| Path | Enforced by |
|---|---|
| Browser reads/writes (dashboard, admin console, settings) | **RLS** policies in Postgres |
| Membership RPCs (`invite_org_member`, `set_member_role`, …) | The SQL function's own checks |
| Member check-in (server action, runs as the user) | **RLS** |
| Guest check-in, onboarding, stats (service-role key) | **TypeScript code** — RLS is bypassed |
| Edge functions | The function's own checks |

One-liner to remember:

> **If it's on the service-role client, the code *is* the policy.**

### Supabase *is* the API

Without Supabase, you'd write a server to accept HTTP requests, verify the
Clerk token, check permissions in every endpoint, and hold the database
connection. Supabase does all of that for you:

- **PostgREST** turns each table into an HTTP endpoint.
- It **verifies the Clerk JWT** and puts the user id into the database session.
- **RLS policies** decide which rows each request can see or change.

So the app does have an API layer — Supabase generates it from the schema and
the policies. The trade-off is that authorization lives in SQL, not in
TypeScript.

---

## 3. Identity: two ids that aren't interchangeable (5 min)

| Column | Type | Holds |
|---|---|---|
| `attendees.user_id` | `text` | The Clerk id (`user_2abc…`). **NULL for guests** |
| `attendees.id` | `uuid` | Internal id. What `attendance.attendee_id` points to |
| `memberships.user_id` | `text` | The Clerk id |

- Role checks compare against the **Clerk id**.
- Anything about attendance has to **go through `attendees`** to translate
  Clerk id → `attendees.id`.

Use the SQL helpers instead of writing the join by hand:

| Helper | Returns |
|---|---|
| `current_clerk_id()` | The caller's Clerk id |
| `current_attendee_id()` | The caller's `attendees.id` |
| `is_global_admin()` | Whether the caller has `attendees.admin` |
| `has_org_role(org, roles[])` | Global admin, or holds one of those roles |
| `is_org_officer(org)` | Officer, co-owner or owner (or global admin) |

### Guest → member

1. A guest checks in by email → an `attendees` row with `user_id = NULL`.
2. They later sign up with the same email.
3. Onboarding **claims** the orphaned row, so their guest attendance carries
   over.

### "Member" means two things

- A **`memberships` row**: an explicit role in a club.
- A **member by attendance**: computed live in `lib/org-members.ts` from
  attendance against the club's threshold. This includes guests, who can never
  have a `memberships` row.

Thresholds are currently hardcoded in `lib/membership.ts`.

---

## 4. Authorization model (7 min)

Two separate concepts — don't mix them up:

| Signal | Scope | Means |
|---|---|---|
| `attendees.admin` | **Global** | Platform admin: creates clubs, passes every club check |
| `memberships.role` | **Per club** | `member` → `officer` → `co-owner` → `owner` |

### Who can do what in a club

| Action | Who |
|---|---|
| Add a member | Officer and above |
| Appoint an officer | Owner, or global admin |
| Appoint a co-owner | **Global admin only** |
| Hand over ownership | Current owner, or global admin |
| Demote officer/co-owner | Co-owner and above |
| Remove the owner | **Global admin only** |
| Edit club branding, read club audit log | Owner, co-owner |

The principle: **granting power is centralized; taking it away is local.** A
club can remove a problem officer immediately, but one compromised officer
can't mint more officers.

These changes go through SECURITY DEFINER RPCs, not direct table writes.

### Teaching moment: RLS can't protect a single column

Members may update their own `attendees` row. That row has the `admin` column.
So without a guard, anyone could run:

```sql
update attendees set admin = true where user_id = '<me>';
```

A **trigger** blocks it. It is `SECURITY INVOKER` because Supabase switches
roles with `SET ROLE` — only an invoker function sees the real caller. It
exempts `service_role` so the first admin can be created from the dashboard.

Similarly, people who add themselves to a club are forced to `role = 'member'`,
so nobody can promote themselves.

### Audit log

Officer and admin actions (role changes, removals, meeting deletes, status
toggles, admin grants) are recorded in `audit_log` by triggers and RPCs, all
through one function, `_write_audit_log()`. Changes made directly in the
database show up as `system:<role>`.

---

## 5. The four Supabase clients (6 min)

Picking the wrong one is the most common bug.

| Helper | Where | Identity | RLS |
|---|---|---|---|
| `createClient()` | Browser | The signed-in user (null when signed out) | Yes |
| `createClerkSupabaseClient()` | Server | The signed-in user | Yes |
| `createAnonSupabaseClient()` | Server | None — safe inside `unstable_cache` | Yes |
| `createServiceSupabaseClient()` | Server only | **Superuser** | **Bypassed** |

Rules:

- Default to `createClerkSupabaseClient()` in server actions.
- Server actions get the user's identity from `auth()`. **Never accept a user
  id as a parameter** — the caller can send anyone's.
- Every service-role query must be filtered by ids you resolved yourself.
  One missing `.eq()` leaks data.

Current service-role call sites: guest check-in, onboarding, stats.

---

## 6. Postgres does real work (5 min)

Not everything lives in TypeScript.

- **`get_member_meetings_page`** — attended/missed filtering and paging in SQL,
  so a long list of meeting ids never ends up in a URL.
- **`pg_cron`** — closes meetings past their end time, every minute.
- **Officer-only meetings** — hidden from guests and members by RLS entirely.
- **Check-in password** — a room code. The column is hidden from normal reads;
  officers fetch it via `get_meeting_password`, members are checked via
  `verify_meeting_checkin_password`, which only returns true/false.
- **Check-in forms** — `meetings.form_schema` (jsonb). Questions have types and
  stable ids, so editing a form doesn't scramble past answers.
- **Meeting times** are `timestamptz`.
- **Deleting a meeting** deletes its attendance too.

---

## 7. Frontend structure (4 min)

| Route | Who | Purpose |
|---|---|---|
| `/` | Public | Landing page |
| `/onboarding` | Signed in | Create or claim your profile |
| `/dashboard` | Signed in | Your clubs |
| `/settings` | Signed in | Your profile |
| `/developer` | Global admin | Create clubs, platform audit log |
| `/[orgSlug]` | Signed in | Club home |
| `/[orgSlug]/checkin` | **Public** | Guest and member check-in |
| `/[orgSlug]/stats` | Signed in | Your attendance history (server-rendered) |
| `/[orgSlug]/admin-dashboard` | Officer+ | The club admin console |
| `/[orgSlug]/admin-dashboard/meetings/[id]` | Officer+ | Meeting editor: questions, settings, responses |

**`proxy.ts`** (Next 16's new name for middleware):

- Protects every non-public route.
- Sends signed-in users without an `attendees` row to `/onboarding`.
- Checks the **database**, not a Clerk claim.
- **Lets users through if that lookup fails**, so a Supabase hiccup can't trap
  anyone in a redirect loop.

**Design system:**

- White surfaces, a slate text ramp, one accent color.
- Use the tokens (`bg-surface`, `text-ink`, `accent`…), never raw palette
  classes like `slate-500`.
- Shared components live in `components/ui/primitives.tsx`.
- Everything under `/[orgSlug]` takes the **club's** accent color. Only the
  accent changes per club, and readable text colors on it are computed
  automatically.

---

## 8. Debugging and known gaps (3 min)

### RLS failures look like missing data

A denied query returns **an empty result, not an error.**

| Symptom | Likely cause |
|---|---|
| Empty lists or "does not exist" while signed in | Clerk JWT not accepted by Supabase |
| Works signed out, fails signed in | JWT problem, not a policy problem |
| `permission denied for table X` | Table grant, not a policy |
| `42501 new row violates row-level security` on an allowed insert | `.insert().select()` — reading back needs SELECT too |
| `401 Invalid API key` | Anon key changed — update `.env.local` and restart dev |

### Known gaps

- **Geolock is browser-only** — advisory, can be bypassed.
- **Guest rate limit is in memory** — per server instance, resets on deploy.
- **Officer meeting edits happen in the browser** — no server step for cache
  refresh or server-side validation.
- **Membership thresholds are hardcoded** rather than stored per club.
- **The anon key hasn't been rotated** since RLS was enabled.

---

## Appendix A: Guest check-in in detail

The `guestCheckIn` server action (`app/[orgSlug]/checkin/guest-actions.ts`):

1. Rate limit: 5 attempts/minute per IP and per email.
2. Find an open, non-officer-only meeting inside its scheduled time.
3. Check the room code, if set.
4. Validate answers against the form stored in the database.
5. Find the attendee by email, or create one with `user_id = NULL`.
6. Insert attendance as `source: 'guest'`.

It uses the service-role key because guests may insert but not read, and both
the insert-then-return-id and the duplicate check fail under RLS.

**Is the key exposed?** No. It has no `NEXT_PUBLIC_` prefix, so it never reaches
the browser, and env files aren't committed. The risk is that RLS doesn't apply
here, so the code is the only protection.

**Open issues on this path:**

- The email lookup doesn't skip signed-up members, so anyone can check in a
  member by typing their email.
- Email matching uses `ilike`, where `%` and `_` are wildcards. This allows
  pattern-guessing emails and false matches like `john_doe` ↔ `johnxdoe`. The
  onboarding claim has the same bug.
- A guest row can be planted for an email before its owner signs up, and gets
  attached to them on sign-up.

**Direction:** replace the service-role client here with a narrow
`SECURITY DEFINER` Postgres function, which can only do what that function
does.

## Appendix B: When do we need our own API?

Not for everything — a blanket API would duplicate RLS. Build endpoints when:

1. **A second app needs the same logic.** The mobile app can't call Next.js
   server actions. Move guest check-in, member check-in, onboarding and stats
   into route handlers (`app/api/...`) before mobile work starts.
2. **Old app versions must keep working.** Mobile users stay on old builds for
   months; reading tables directly means a column rename breaks them. An API
   (or RPCs/views) gives a stable contract.
3. **A rule needs a secret or server-side check** — service-role key, real
   geolock, a shared rate limit.
4. **An outside system calls in** — Clerk webhooks, exports to other tools.
5. **A write must trigger follow-up work** — notifications, cache refresh.

Simple reads and admin screens should stay on Supabase + RLS; they already work
from mobile unchanged.
