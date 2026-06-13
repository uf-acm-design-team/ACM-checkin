# ACM Check-in — Developer Onboarding

Welcome to the team! This guide walks you from a fresh clone to a fully working local dev environment in about 20 minutes. If you hit a snag, ping your team lead.

## What you're building on

- **Next.js 16** (App Router) — frontend and API routes
- **Clerk** — authentication (sign-in, sign-up, sessions)
- **Supabase** — Postgres database + Edge Functions
- **Tailwind CSS v4** — styling

Auth flows through Clerk. The database is reached with the Supabase JS client using local credentials in development.

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
git clone <repo-url> acm_checkin
cd acm_checkin
```

## 3. Create your personal Clerk dev app

Each developer runs their **own** Clerk development application. This means:

- No shared secrets to leak
- You can test sign-up flows freely without affecting teammates
- Your local Clerk users are isolated from everyone else

**Steps:**

1. Sign up at [clerk.com](https://clerk.com) using your `@ufl.edu` email (free tier is plenty).
2. From the Clerk dashboard, click **Create application**.
3. Name it something like `acm-checkin-dev-<your-name>`.
4. Under **Sign-in options**, enable **Email** (this matches our production config).
5. Click **Create application**.
6. On the next page, copy these two values — you'll paste them in step 5:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_...`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_...`)

Leave the Clerk dashboard tab open — you may need to come back to it.

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
6. Starts Supabase Edge Functions in the background
7. Opens Supabase Studio in your browser at `http://127.0.0.1:54323`

The first run takes a few minutes because Docker has to download the Supabase images. Subsequent runs are fast.

> **Heads up:** if the script asks you to install Docker and opens the install page, install it, start Docker Desktop, then re-run `npm run setup`.

## 5. Add your Clerk keys to `.env.local`

The setup script created `.env.local` with the Supabase values. You need to append your Clerk keys.

Open `.env.local` in your editor and add:

```bash
# Clerk (auth) — your personal dev keys from step 3
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here

# Clerk routing — these match the app's pages, don't change them
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

Save the file. `.env.local` is gitignored, so your keys never leave your machine.

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
| **Inbucket**        | http://127.0.0.1:54324              | Catches all email sent by Supabase locally                |
| **Clerk dashboard** | https://dashboard.clerk.com         | Auth provider (your dev app)                              |

## 8. Day-to-day workflow

### Starting work

```bash
# In one terminal
npm run supabase:start   # if Supabase isn't already running
npm run dev              # starts Next.js
```

If you also need Edge Functions:

```bash
# In another terminal
npm run dev:functions
```

### Stopping work

```bash
npm run supabase:stop    # stops the Docker containers
```

You don't have to stop Supabase between sessions, but doing so frees up memory.

## 9. Database changes — migrations

**Never edit schema by clicking around in the cloud Supabase dashboard.** Every schema change goes through a migration file checked into git. This keeps all three teams in sync.

### Creating a new migration

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

### Testing it locally

```bash
npx supabase db reset
```

This wipes your local DB and replays **every** migration from scratch. If your new migration is broken, you'll find out immediately. **Anything not in a migration file will be lost** — never store data in local Supabase you can't recreate.

### Sharing it with the team

1. Commit the migration file: `git add supabase/migrations/ && git commit -m "Add events table"`
2. Push and open a PR.
3. When teammates pull your branch, they run `npx supabase db reset` to get your schema.

### Applying to the cloud (lead developers only)

After merge to `main`, a lead runs:

```bash
npx supabase db push
```

This applies pending migrations to the real Supabase project. Coordinate with the other leads before doing this.

## 10. Common issues

**`npm run setup` fails at the Docker step**
Docker Desktop isn't running. Open it, wait for the whale icon to be steady (not animating), re-run.

**`Supabase did not become ready in time`**
First-time Docker image pulls can be slow on a weak connection. Re-run `npm run setup` — the images are cached after the first download.

**Sign-up works but the app errors out after**
Your Clerk keys in `.env.local` are missing or wrong. Re-check steps 3 and 5. Restart `npm run dev` after editing `.env.local`.

**Port 54321 / 54322 / 54323 already in use**
Another Supabase project is running. Run `npx supabase stop` in that other project's directory, or stop all Supabase containers: `docker ps` then `docker stop <id>`.

**`db reset` complains about a migration failing**
The most recent migration has a SQL error. Open the file, fix the SQL, re-run `db reset`. Migrations must be idempotent within their own file but the full chain runs against an empty DB, so order matters.

**I committed a secret by accident**
Tell a lead immediately. Don't try to "fix" it with `git push --force` — the secret is still in history. The lead will rotate the key and rewrite history.

## 11. Where to get help

- **Setup not working?** Ping your team lead in the team channel.
- **Schema design questions?** All three leads — coordinate before adding new tables.
- **Clerk-specific questions?** [Clerk docs](https://clerk.com/docs) are excellent.
- **Supabase CLI questions?** [Supabase local dev docs](https://supabase.com/docs/guides/local-development).
