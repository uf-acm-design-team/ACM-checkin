# AGENTS.md

Notes for anyone (human or agent) changing this codebase. Setup lives in
[ONBOARDING.md](ONBOARDING.md) (web) and [mobile/README.md](mobile/README.md)
(phone app).

## What this is

Attendance check-in for UF student orgs (ACM and others). Each org has a slug,
its own branding, and meetings. Attendees scan a QR code that opens
`/[orgSlug]/checkin`, and officers run meetings and see the results from the
admin dashboard. Signed-out guests can check in too.

| Layer    | Stack                                                          |
| -------- | -------------------------------------------------------------- |
| Web      | Next.js 16 (App Router), React 19, Tailwind v4, Recharts       |
| Mobile   | Expo / React Native in `mobile/`, Expo Router, Jest            |
| Auth     | Clerk, on both web and mobile                                  |
| Data     | Supabase Postgres with RLS, Storage (`org-logos`), Edge Functions (Deno) |
| Tests    | Vitest (web, `lib/**/*.test.ts`), Jest (mobile)                |

## Graphify: read the graph first

This repo is mapped with graphify (PyPI package `graphifyy`, used through the
`/graphify` skill in Claude Code) into a knowledge graph in `graphify-out/`. **Every contributor is expected to have it
installed and keep it fresh.** The output is gitignored, so each person builds
their own copy.

**Setup (once per machine/clone):**

```bash
uv tool install graphifyy     # or: pip install graphifyy
# then, in Claude Code at the repo root:
/graphify                     # builds graphify-out/
graphify hook install         # rebuilds the graph after every commit
```

**Agents: before exploring the codebase:**

1. If `graphify-out/` is missing, run `/graphify` before anything else.
2. Read `graphify-out/GRAPH_REPORT.md` for the community map and god nodes.
3. Answer "where / how / what touches X" questions with the graph first, then
   open the files it points to:
   - `/graphify query "<question>"`: broad context (`--dfs` traces one path)
   - `/graphify path "A" "B"`: how two concepts connect
   - `/graphify explain "<node>"`: a plain-language summary of one node
4. After changing docs, migrations, or other non-code files, run
   `/graphify --update`. The commit hook only re-extracts code files.

The graph helps you find your way around, but it isn't the source of truth. If
it disagrees with the code, trust the code and rebuild the graph.

## Repo map

```
app/                      Next.js routes
  [orgSlug]/
    checkin/              public check-in page + server actions (member + guest)
    admin-dashboard/      officer tools: meetings, QR, members, branding, live feed
    stats/                attendee's own attendance and membership progress
  onboarding/             attendee profile creation (required after sign-up)
  dashboard/ settings/    signed-in home and account settings
  developer/              global-admin tools (create org, audit log)
  utils/supabase/         client.ts (browser) and server.ts (Clerk / anon / service-role)
  chart-demo/, analytics-design-demo/, new-vs-returning-demo/,
  [orgSlug]/checkin/states-preview/
                          design sandboxes, not product pages (see below)
components/               shared UI (charts, check-in states, forms, stats, primitives)
lib/                      pure logic + its *.test.ts (geo, roles, membership, branding, forms, CSV…)
proxy.ts                  Clerk middleware: public routes + onboarding redirect gate
supabase/
  migrations/             the ONLY way the schema changes
  functions/              create-org, onboard-attendee, update-org-branding (Deno)
mobile/                   Expo app: its own package.json, lockfile, tests, CI
scripts/                  setup-dev, db backup/restore
docs/                     analytics dashboard design + sprint tickets
```

## Commands

Web (repo root):

```bash
npm run setup               # first-time: Docker, Supabase, migrations, .env files
npm run supabase:start      # local Supabase (Docker)
npm run dev                 # Next.js on :3000
npm run dev:functions       # Edge Functions locally
npm test                    # Vitest
npm run lint
npx supabase migration new <name>   # new migration
npx supabase db reset               # replay all migrations locally
```

Mobile (`cd mobile` first):

```bash
npm start                   # Expo dev server
npm run lint && npm run typecheck && npm test   # what CI runs
npm run test:rls            # RLS integration check against local Supabase
npm run gen:types           # regenerate database.types.ts from the local DB
```

## Rules that bite

### Clerk ↔ Supabase identity and RLS

- Clerk is the identity provider. Supabase is registered with Clerk as a
  third-party auth provider, so RLS reads the caller from
  `auth.jwt() ->> 'sub'`, the Clerk id. Never use `auth.uid()`.
- There are **two identity columns**, and mixing them up is the most common bug:
  - `attendees.user_id` and `memberships.user_id`: **text**, the Clerk id
    (`user_2abc…`). `attendees.user_id` is NULL for guests.
  - `attendees.id`: **uuid**. `attendance.attendee_id` references this.
  
  Role checks compare against the Clerk id. Anything that touches attendance
  joins through `attendees`. Use the SQL helpers `current_clerk_id()`,
  `current_attendee_id()` and `has_org_role()` instead of writing that
  translation by hand (see `20260813000100_enable_rls_clerk.sql`).
- Pick the right client in `app/utils/supabase/server.ts`:
  - `createClerkSupabaseClient`: the default for user-scoped reads and writes.
  - `createAnonSupabaseClient`: public org-wide reads. Safe inside
    `unstable_cache`.
  - `createServiceSupabaseClient`: bypasses RLS. Only use it when the code
    derives the user/org from `auth()` itself, never from caller input.
- When the browser client is missing a token, the request runs as `anon` and
  RLS denies it. You get **an empty list with no error**, not an auth failure.
- `lib/org-roles.ts` only mirrors the permission matrix so the UI can hide
  controls. The SECURITY DEFINER RPCs in migrations enforce it, so a role rule
  change goes in both places.
- Edge Functions can't import from `lib/`. `create-org` keeps its own copy of
  `DEFAULT_BRANDING`, so change it alongside `lib/branding.ts`.

### Schema changes

Migrations only. Never edit schema in the cloud dashboard. Test each one with
`npx supabase db reset`. Lead developers run `supabase db push` after merge.
After a schema change, regenerate the mobile types (`npm run gen:types` in
`mobile/`).

### Web vs mobile are separate projects

- `mobile/` has its own `package.json`, `package-lock.json`, ESLint config,
  and Jest setup. Install mobile deps from inside `mobile/` and never add them
  to the root `package.json` (or the other way round).
- Root `npm test` (Vitest) only covers `lib/**/*.test.ts`. Mobile tests run
  only with `npm test` inside `mobile/`.
- Mobile CI (`.github/workflows/mobile.yml`) runs on changes to `mobile/**`
  **and `app/globals.css`**, because a mobile test checks the theme tokens
  against the web CSS. When you change a web color token, update
  `mobile/src/theme/tokens.ts` too.

### Demo and preview routes

`app/chart-demo`, `app/analytics-design-demo`, `app/new-vs-returning-demo` and
`app/[orgSlug]/checkin/states-preview` are design sandboxes with hard-coded
data. Don't link to them from product UI, don't treat them as real features,
and don't "fix" their data to come from Supabase. `states-preview` and
`new-vs-returning-demo` return a 404 in production. The other two have no guard.

## Known rough edges

### Geolock trusts client-supplied coordinates

The check-in geolock is enforced in two places, using the same math in
`lib/geo.ts`:

- **Client** (`app/[orgSlug]/checkin/geolock.ts`): the fast UX path. It reads the
  browser's GPS fix and shows the "too far" / "location denied" screens without
  a round trip.
- **Server** (`memberCheckIn` in `checkin/actions.ts`, `guestCheckIn` in
  `checkin/guest-actions.ts`): when the meeting `is_geo_locked`, the action
  recomputes the distance against the meeting's `latitude` / `longitude` /
  `radius_meters` and rejects anything outside the radius. Missing or malformed
  coordinates on a geo-locked meeting are rejected, not allowed.

The coordinates are still supplied by the client. The server check stops casual
bypass (calling the action directly, or checking in from a photo of a static QR
code without sending a location), but **not a spoofed GPS fix**: anyone who
sends fake coordinates inside the radius passes. Treat the geolock as a
deterrent, not proof of attendance. Real proof needs something the attendee
can't forge, such as a rotating QR code or a code shown only in the room.

Two related behaviours to keep in mind:

- A geo-locked meeting with no pin (`latitude`/`longitude` NULL) is not
  enforced on either side, because there's nothing to measure against.
- The reported `accuracy` is passed along but does not widen the radius.
