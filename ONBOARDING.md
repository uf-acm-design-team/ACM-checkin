# ACM Check-in — Developer Onboarding

Welcome to the team! This guide takes you from a fresh clone to shipping code to production.

It's organized around the path your code actually travels:

| Stage | Where it runs | Covered in |
| --- | --- | --- |
| **1. Local** | Docker on your machine | [Part 1](#part-1-local-setup) |
| **2. Pull request** | GitHub Actions | [Part 2](#part-2-the-pull-request) |
| **3. Staging** | Hosted Supabase + Vercel preview | [Part 3](#part-3-staging) |
| **4. Production** | Hosted Supabase + Vercel | [Part 4](#part-4-production) |

Read Part 1 now and get your environment working. Parts 2–4 are reference — come back when you open your first PR.

If you hit a snag, ping your team lead.

## What you're building on

- **Next.js 16** (App Router) — frontend and API routes
- **Clerk** — authentication (sign-in, sign-up, sessions)
- **Supabase** — Postgres database + Edge Functions
- **Tailwind CSS v4** — styling

Auth flows through Clerk; the database is reached with the Supabase JS client. In development both point at a local Docker Supabase stack and the team's shared Clerk dev instance.

The two are connected: the Supabase client forwards your Clerk session token on every request, and Postgres reads your identity from it to enforce row-level security. That's why the Clerk instance has to match what Supabase expects — see [step 3](#3-get-the-shared-clerk-dev-keys).

---

# Part 1 — Local setup

Everything here runs on your machine. **Nothing in Part 1 touches a hosted Supabase project**, so you can't break anything for anyone else. About 20 minutes, mostly waiting on Docker.

## 1. Prerequisites

Install these once. You only need to do this on a new machine.

### Required

| Tool               | Purpose                           | Install                                                                              |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------ |
| **Node.js 20+**    | Runs Next.js and the setup script | [nodejs.org](https://nodejs.org) or `nvm install 20`                                 |
| **Docker Desktop** | Runs the local Supabase stack     | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |
| **Git**            | Source control                    | Likely already installed                                                             |

Verify each:

```bash
node --version    # v20.x or higher
docker --version  # any recent version
git --version
```

Docker must be **running** before you start the setup script. Open Docker Desktop and wait for the whale icon to settle in your menu bar / system tray.

### Recommended

- **VS Code** with the ESLint and Tailwind CSS extensions
- **GitHub CLI** (`gh`) — makes PR work easier (`brew install gh` on Mac)

## 2. Clone the repo

```bash
git clone https://github.com/uf-acm-design-team/ACM-checkin.git acm_checkin
cd acm_checkin
```

## 3. Get the shared Clerk dev keys

**Ask a lead for the team's Clerk development keys.** Everyone uses the same dev instance. You'll paste them in step 5:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_...`)
- `CLERK_SECRET_KEY` (starts with `sk_test_...`)
- `CLERK_FRONTEND_API_DOMAIN` (e.g. `https://good-pony-19.clerk.accounts.dev`)

### Why not your own Clerk app?

Because local Supabase can only trust one Clerk instance at a time.

Supabase verifies Clerk-signed JWTs against a single literal hostname in [`supabase/config.toml`](supabase/config.toml) under `[auth.third_party.clerk]`. The Supabase CLI validates that field as a hostname *before* expanding `env(...)`, so it cannot be an environment variable — it's committed, and it's the same for everyone.

If your keys come from a different instance, the failure is quiet and confusing:

1. Clerk signs you in normally — Clerk has no idea Supabase exists
2. Supabase rejects the token it can't verify
3. `auth.jwt() ->> 'sub'` evaluates to NULL
4. Every user-scoped RLS policy denies

The app renders fine and every list is **empty**. No error, no failed request. People lose hours here.

`npm run setup` compares your publishable key against `config.toml` and reports a mismatch, so you'll catch it at setup rather than at 1am.

### If you really need your own instance

Sometimes you do — testing sign-up config, say. Then:

1. Create the app at [clerk.com](https://clerk.com), enable **Email** under Sign-in options
2. Set `domain` in `supabase/config.toml` to your instance host (no scheme, no trailing slash) — find it at [clerk.com/setup/supabase](https://clerk.com/setup/supabase)
3. `npx supabase stop && npm run setup`
4. **Don't commit that `config.toml` change** — it would break everyone else

## 4. Run the setup script

From the repo root:

```bash
npm run setup
```

This single command:

1. Verifies Docker is running (starts it for you on Mac/Windows if it isn't)
2. Runs `npm install`
3. Boots the local Supabase stack via Docker
4. Writes `.env.local` and `supabase/functions/.env` with the auto-generated local Supabase credentials
5. Applies all database migrations from `supabase/migrations/`
6. Checks your Clerk instance against `config.toml`
7. Starts Supabase Edge Functions in the background
8. Opens Supabase Studio in your browser at `http://127.0.0.1:54323`

The first run takes a few minutes because Docker has to download the Supabase images. Subsequent runs are fast.

`npm run setup` is **idempotent** — re-run it whenever your local stack gets into a weird state. It preserves your Clerk keys.

> **Heads up:** if the script asks you to install Docker and opens the install page, install it, start Docker Desktop, then re-run `npm run setup`.

### Where local data comes from

Your local database is built entirely from files in the repo:

```
supabase/migrations/*.sql   →  every schema change, replayed in order
supabase/seed.sql           →  3 sample orgs, meetings, attendance
```

No hosted project is involved. That's why `npx supabase db reset` is free and safe — it rebuilds from those files in seconds.

## 5. Add your Clerk keys to `.env.local`

The setup script created `.env.local` with the Supabase values. You need to append your Clerk keys.

Open `.env.local` in your editor and add:

```bash
# Clerk (auth) — the shared team dev keys from step 3
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
CLERK_FRONTEND_API_DOMAIN=https://your-instance.clerk.accounts.dev

# Clerk routing — these match the app's pages, don't change them
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding
```

Save the file. `.env.local` is gitignored, so your keys never leave your machine.

Now re-run `npm run setup`. It preserves the keys you just added and verifies your Clerk instance matches `config.toml` — you want to see `[OK] Clerk instance matches config.toml`.

## 6. Start the dev server

In a new terminal (leave the setup terminal alone — it's running Edge Functions in the background):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the landing page.

**Smoke test:** click sign-up, enter an `@ufl.edu` email, complete the flow. If you land on `/onboarding` without errors, everything is wired correctly.

> Clerk in dev mode emails the verification code to a real address. Use one you can check.

## 7. What's running and where

| Service             | URL                                 | What it is                                                |
| ------------------- | ----------------------------------- | --------------------------------------------------------- |
| **Next.js app**     | http://localhost:3000               | Your dev server                                           |
| **Supabase Studio** | http://127.0.0.1:54323              | Web UI to browse the local DB                             |
| **Supabase API**    | http://127.0.0.1:54321              | REST and Auth endpoints                                   |
| **Postgres**        | localhost:54322                     | Direct DB connection (user: `postgres`, pass: `postgres`) |
| **Edge Functions**  | http://127.0.0.1:54321/functions/v1 | Local function runner                                     |
| **Inbucket**        | http://127.0.0.1:54324              | Catches email sent by **Supabase** — not Clerk's OTP codes |
| **Clerk dashboard** | https://dashboard.clerk.com         | Auth provider (shared team dev app)                       |

> Sign-up codes come from **Clerk**, which sends real email to a real inbox. Inbucket won't have them.

## 8. Day-to-day workflow

### Starting work

```bash
# In one terminal
npm run supabase:start   # if Supabase isn't already running
npm run dev              # starts Next.js
```

If you also need Edge Functions (org creation, branding uploads):

```bash
# In another terminal
npm run dev:functions
```

`npm run setup` already started them in the background, but detached and without logs. Run them in the foreground whenever you're debugging a function.

### Stopping work

```bash
npm run supabase:stop    # stops the Docker containers
```

You don't have to stop Supabase between sessions, but doing so frees up memory.

## 9. Writing a migration

**Never edit schema by clicking around in a hosted Supabase dashboard.** Every schema change goes through a migration file checked into git. This keeps all three teams in sync and is what makes staging and production reproducible.

```bash
npx supabase migration new <descriptive_name>
# e.g. npx supabase migration new add_event_table
```

This creates an empty timestamped file in `supabase/migrations/`. Write your SQL in it:

```sql
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Then verify it replays from zero

```bash
npx supabase db reset
```

This wipes your local DB and replays **every** migration from scratch, then re-seeds. If your migration is broken, you find out in seconds.

**This is the check only local can perform.** Staging and production aren't empty, so they can't prove a migration works against a fresh database. Skipping this is how a migration that works on your machine fails on a real project.

> **Anything not in a migration file is lost on reset** — never keep local data you can't recreate.

## 10. Local gotchas

Things that behave differently on Docker than on a hosted project. None are bugs; all have bitten someone.

**Meetings never move to "past" / stats look wrong**
The `pg_cron` auto-close job doesn't reliably fire locally. Close them by hand in Studio:

```sql
select public.close_expired_meetings();
select * from cron.job;   -- is the job even scheduled?
```

This works correctly on hosted projects — verify time-based behavior on staging.

**I'm signed in, but every list is empty — no errors**
Clerk instance mismatch: Supabase can't verify your token, so RLS denies everything. Run `npm run setup` and read the Clerk section of its output. See [step 3](#3-get-the-shared-clerk-dev-keys).

**Creating an org silently fails**
Edge Functions are running detached with no logs. Restart them in the foreground: `npm run dev:functions`

**I never got the sign-up code**
Clerk emails it to your real address — Inbucket only catches Supabase's own mail. Check spam.

**Logo images don't load on my phone**
Local storage URLs are `127.0.0.1`, which means nothing on another device. Expected — test storage on staging.

**`npm run setup` fails at the Docker step**
Docker Desktop isn't running. Open it, wait for the whale icon to be steady (not animating), re-run.

**`Supabase did not become ready in time`**
First-time Docker image pulls can be slow. Re-run `npm run setup` — images are cached after the first download.

**Port 54321 / 54322 / 54323 already in use**
Another Supabase project is running. Run `npx supabase stop` in that directory, or `docker ps` then `docker stop <id>`.

**`db reset` complains about a migration failing**
The most recent migration has a SQL error. Fix the file, re-run. The full chain runs against an empty DB, so order matters.

---

# Part 2 — The pull request

## Branch naming

Match what's already in the history:

```bash
git checkout -b feat/geo-lock        # new capability
git checkout -b fix/stats-page       # bug fix
git checkout -b chore/build-config   # tooling, deps, docs
```

## Before you push

Run what CI runs, so you find out locally instead of on GitHub:

```bash
npm test                # Vitest
npm run lint            # ESLint
npm run build           # catches type errors CI will catch
npx supabase db reset   # only if you touched migrations
```

## What CI checks

Every PR into `main` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | What it does | Fails when |
| --- | --- | --- |
| **test** | `npm test` | A Vitest suite fails |
| **lint** | `npm run lint` | ESLint reports an error |
| **build** | `npm run build` | Type error or build failure |
| **migrations** | Boots Supabase, runs `db reset` | A migration doesn't replay from empty |

The **migrations** job only runs when a PR touches `supabase/`. It's the automated version of step 9 — it catches the person who forgot to run `db reset`.

CI uses dummy Clerk/Supabase values: it type-checks and builds, it doesn't talk to any real project. No secrets are needed for a PR to pass.

## Review and merge

1. Push, open a PR into `main`
2. Wait for CI to go green — don't ask for review on a red PR
3. Get a review from a lead (required for anything touching `supabase/`, auth, or RLS)
4. **Squash merge** into `main`

Teammates pulling your branch should run `npx supabase db reset` to pick up your schema.

---

# Part 3 — Staging

Staging is a **second hosted Supabase project**, separate from production. It exists to catch the things local Docker structurally cannot.

## When you need it

You don't need staging for most work. Reach for it when you're changing:

- **Edge Functions** — local runs Deno with hot reload; deployed is cold-started and region-bound
- **Storage / images** — local URLs are `127.0.0.1` and work nowhere else
- **Anything time-based** — `pg_cron` fires reliably on hosted, not locally
- **Anything you want to test on a phone** or send a teammate
- **Any migration touching real data volume** — a rehearsal before production

If your change is UI, business logic, or a straightforward schema addition, local + CI is enough.

## Pointing at staging

```bash
npm run env:staging     # .env.staging -> .env.local
npm run dev             # restart — Next.js reads env at boot
```

To go back to local Docker, just re-run `npm run setup` — it rewrites `.env.local` with local values and preserves your Clerk keys.

## The two-pointer problem

**Your app credentials and the Supabase CLI link are set independently.** `.env.local` controls what the app talks to; `supabase/.temp/project-ref` (set by `npx supabase link`) controls where `db push` and `db dump` go. Nothing keeps them in sync.

That means you can be running against staging while `db push` is aimed at production.

```bash
npm run env:which
```

```
  app (.env.local)  stagingref123
  cli (db push)     prodref999

  WARNING app and CLI point at different projects.
  A `supabase db push` now targets prodref999, not stagingref123.
```

**Run `npm run env:which` before any `db push`.** It's free, and it's the only thing standing between a routine migration and an unplanned production change.

A local-Docker app with a hosted CLI link is normal and doesn't warn — the app ignores the link entirely. The link only matters for `db push` / `db dump`.

## Deploying to staging

```bash
npm run env:which                              # confirm where you're aimed
npx supabase link --project-ref <staging-ref>
npx supabase db push                           # apply pending migrations
```

If you changed an Edge Function:

```bash
npx supabase functions deploy create-org update-org-branding
```

Function secrets live on the project, not in `.env.local`. Set once per project:

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<staging service_role>
```

`SUPABASE_URL` is injected automatically on hosted projects.

## Vercel previews

Every PR gets a Vercel preview deployment. Preview environment variables point at **staging**, so opening a preview URL exercises the staging database with no local switching.

Configured in Vercel → Settings → Environment Variables, with the Supabase vars set separately for **Preview** (staging) and **Production**.

## First-time staging setup (leads)

Creating the staging project from scratch:

```bash
npx supabase link --project-ref <staging-ref>
npx supabase db push                    # replays all migrations onto an empty project
```

Then, in the staging dashboard:

1. **Authentication → Third-Party Auth → Clerk**, domain `good-pony-19.clerk.accounts.dev`
   Without this, RLS denies everything and staging looks empty — the same trap as [step 3](#3-get-the-shared-clerk-dev-keys), just remote.
2. Deploy Edge Functions and set their secrets (above)
3. Optionally seed data from production:

```bash
npm run env:prod    && npm run db:backup
npm run env:staging && npm run db:restore
```

> That copies **real member emails** into a second project. Consider restoring only `organizations` and `meetings` and leaving attendance empty — fake check-ins are cheap to generate, a leaked roster isn't.

---

# Part 4 — Production

**Leads only.** Coordinate with the other leads before anything in this section.

## What deploys automatically

Merging to `main` triggers a Vercel production deploy of the **application**. That part is automatic.

## What does not

**Database migrations never run automatically.** Nothing in CI or Vercel applies schema changes to production — it's a deliberate manual step, because a bad migration is the one thing that isn't trivially revertable.

## Promoting a migration

Order matters. The schema goes first, because the new app code may depend on it:

```bash
# 1. Verify staging is already running this migration successfully
npm run env:which

# 2. Aim at production — deliberately
npx supabase link --project-ref <production-ref>
npm run env:which                  # confirm before pushing

# 3. Back up first
npm run env:prod && npm run db:backup

# 4. Apply
npx supabase db push

# 5. Merge the PR -> Vercel deploys the app
```

If you changed Edge Functions, deploy them after the migration:

```bash
npx supabase functions deploy create-org update-org-branding
```

## Migration safety

Because production has real data, some changes that pass locally are still dangerous:

- **Adding a `NOT NULL` column without a default** fails on a non-empty table — add nullable, backfill, then constrain
- **Renaming or dropping a column** breaks the currently-deployed app the instant it applies — ship the code that tolerates both first
- **`db push` is not transactional across files** — a chain that fails halfway leaves production partly migrated

Prefer additive migrations. When you can't, split into two deploys.

## If something breaks

**App is broken, database is fine** → roll back the Vercel deployment (Deployments → previous → Promote). Seconds, no data risk.

**Migration broke production** → there is no `db rollback`. Write a new forward migration that undoes it, test locally with `db reset`, then push. This is why step 3 above takes a backup.

**Data was lost or corrupted** → restore from the backup:

```bash
npm run env:prod
npm run db:restore -- backups/<timestamp>
```

`db:restore` upserts on primary key, so it's safe to re-run. It restores **data only** — the schema must already match.

## Environment reference

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Supabase | Docker | hosted | hosted |
| Point at it | `npm run setup` | `npm run env:staging` | `npm run env:prod` |
| Schema changes | `db reset` | `db push` | `db push`, backed up first |
| Safe to break? | Yes | Mostly | No |
| Who | everyone | everyone | leads |

---

# Where to get help

- **Setup not working?** Ping your team lead in the team channel.
- **Schema design questions?** All three leads — coordinate before adding new tables.
- **About to touch production?** Ask first. Always.
- **I committed a secret** → Tell a lead immediately. Don't force-push; the secret is still in history and the key needs rotating.
- **Clerk questions?** [Clerk docs](https://clerk.com/docs)
- **Supabase CLI questions?** [Supabase local dev docs](https://supabase.com/docs/guides/local-development)
