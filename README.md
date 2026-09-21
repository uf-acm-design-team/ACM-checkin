# ACM Check-in

Meeting check-in and attendance tracking for UF student orgs. Multi-tenant: each org gets its own slug, branding, meetings, and member roster.

**Stack:** Next.js 16 (App Router) · Clerk (auth) · Supabase (Postgres + Edge Functions) · Tailwind v4

New here? Read [ONBOARDING.md](ONBOARDING.md) — it covers the full path from a fresh clone to production, organized by stage: local, PR/CI, staging, production.

## Quick start

```bash
npm run setup     # Docker + Supabase + migrations + .env.local
npm run dev       # http://localhost:3000
```

`npm run setup` is idempotent — re-run it any time your local stack gets weird. It preserves your Clerk keys.

## Environments

Three, in increasing order of "be careful":

| Environment | What it's for | How you point at it |
| --- | --- | --- |
| **Local** (Docker) | Day-to-day work, migrations | `npm run setup` |
| **Staging** (hosted) | Edge Functions, storage, previews, sharing | `npm run env:staging` |
| **Production** (hosted) | The real thing | `npm run env:prod` — leads only |

Default to **local**. It's faster, free to reset, and the only place you can safely verify a migration replays from an empty database.

Move to **staging** when you hit something local can't reproduce:

- Edge Function behavior (cold starts, real deploys)
- Storage / CDN URLs — local logo URLs are `127.0.0.1`, useless off your machine
- `pg_cron` — the auto-close job doesn't reliably fire locally (see below)
- Testing on a phone, or sharing a URL with a teammate

### Switching targets

Keep one file per target and copy the active one into place:

```
.env.local        # active — whatever you're pointed at right now
.env.staging      # staging project creds
.env.production   # production creds
```

All are gitignored (`.env*`, except `.env.example`).

```bash
npm run env:staging    # .env.staging -> .env.local
npm run env:prod       # .env.production -> .env.local
npm run env:which      # just show me where I'm pointed
```

Restart `npm run dev` after switching — Next.js reads env at boot.

Each of these prints **both** targets, because there are two and they're set independently:

```
  app (.env.local)  stagingref123
  cli (db push)     prodref999

  WARNING app and CLI point at different projects.
  A `supabase db push` now targets prodref999, not stagingref123.
```

> **The CLI link is separate from `.env.local`.** `npx supabase link` is global to the repo, stored in `supabase/.temp/project-ref`, and nothing keeps it in sync with your app credentials. That's how a migration meant for staging lands on production. `npm run env:which` before any `db push` — it's free.

To set the files up the first time:

```bash
cp .env.local .env.production   # snapshot what you have now
# then create .env.staging from the staging project's dashboard
```

## Database changes

Schema lives in `supabase/migrations/`, never in the dashboard. Full workflow — creating, testing, and applying migrations — is in [ONBOARDING.md § Part 1.9](ONBOARDING.md#9-writing-a-migration).

The short version:

```bash
npx supabase migration new add_something   # 1. create
# ...write SQL...
npx supabase db reset                      # 2. verify it replays from zero
                                           # 3. commit, PR, merge
npx supabase db push                       # 4. lead applies to hosted
```

Step 2 is the one that matters and the one people skip. It's also the thing local dev uniquely gives you — staging can't prove a migration works from an empty database, because staging isn't empty.

## CI/CD

Every PR into `main` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml): tests, lint, build, and — when the PR touches `supabase/` — a full migration replay against an empty database. CI uses dummy credentials and talks to no real project, so no secrets are needed for a PR to pass.

Run the same checks before you push:

```bash
npm test && npm run lint && npm run build
npx supabase db reset      # if you touched migrations
```

Merging to `main` deploys the **app** to production via Vercel. **Database migrations never deploy automatically** — a lead applies them with `db push`, staging first. Full pipeline in [ONBOARDING.md Parts 2–4](ONBOARDING.md#part-2-the-pull-request).

## Known local/hosted differences

Things that behave differently on Docker than on a real project. None are bugs; all have bitten someone.

**Meetings don't auto-close.** [`20260820000000_auto_close_expired_meetings.sql`](supabase/migrations/20260820000000_auto_close_expired_meetings.sql) schedules a `pg_cron` job every minute. It often doesn't run locally — the job is scheduled in `postgres` while `cron.database_name` may point elsewhere. Anything reading closed meetings (stats, past-meeting views) will look wrong. Close one by hand in Studio:

```sql
select public.close_expired_meetings();
-- confirm cron is actually running:  select * from cron.job;
```

**Clerk sends real email.** Inbucket (`:54324`) only catches mail *Supabase* sends. Sign-up codes come from Clerk, to a real inbox. Use an address you can check.

**Everyone shares one Clerk instance.** `supabase/config.toml` holds a single literal `domain` and the CLI rejects `env(...)` there, so it's the same for every developer. A key from a different instance signs you in fine but Supabase rejects the token — RLS then denies everything and the app looks *empty*, not broken. `npm run setup` checks for this and fails loudly.

**Edge Functions run detached.** `npm run setup` backgrounds them with no log output. If org creation fails for no visible reason, run them in the foreground:

```bash
npm run dev:functions
```

**Resets wipe local data, not Clerk users.** `db reset` replays migrations and re-seeds (`supabase/seed.sql`: three orgs, sample meetings and attendance). Clerk accounts live in the cloud and survive, so their user IDs won't match the fresh `memberships` rows — expect to re-onboard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run setup` | Full local bootstrap (Docker, Supabase, migrations, env files) |
| `npm run dev` | Next.js dev server |
| `npm run dev:functions` | Edge Functions in the foreground, with logs |
| `npm run supabase:start` / `:stop` | Start/stop the Docker stack |
| `npm run db:backup` | Dump every table to `backups/<timestamp>/` as JSON |
| `npm run db:restore` | Upsert a backup back in (schema must already exist) |
| `npm run env:staging` / `env:prod` | Point `.env.local` at that project |
| `npm run env:which` | Show which project the app and the CLI each target |
| `npm test` | Vitest |
| `npm run lint` | ESLint |

`db:backup` / `db:restore` read whichever project `.env.local` points at — that's how you copy production data into staging:

```bash
npm run env:prod    && npm run db:backup    # dump production
npm run env:staging && npm run db:restore   # load it into staging
```

> That copies **real member emails** into a second project. Consider restoring only `organizations` and `meetings` and leaving attendance empty — fake check-ins are cheap to generate, a leaked roster isn't.

## Ports

| Service | URL |
| --- | --- |
| Next.js | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Supabase API | http://127.0.0.1:54321 |
| Postgres | `localhost:54322` (`postgres` / `postgres`) |
| Edge Functions | http://127.0.0.1:54321/functions/v1 |
| Inbucket | http://127.0.0.1:54324 |

## Troubleshooting

See [ONBOARDING.md § Part 1.10](ONBOARDING.md#10-local-gotchas). The greatest hits:

- **App loads but every list is empty** → Clerk instance mismatch. Run `npm run setup`.
- **Port 5432x in use** → another Supabase project. `npx supabase stop` in its directory.
- **`Supabase did not become ready in time`** → slow first image pull; re-run.
- **Committed a secret** → tell a lead. Don't force-push; the key needs rotating.
