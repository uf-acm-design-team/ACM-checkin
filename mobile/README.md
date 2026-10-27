# ACM Check-In — Mobile App

This folder is the phone app for ACM Check-In. It's built with **Expo** (React Native + TypeScript) and uses the **same Clerk login and the same Supabase database** as the website.

Follow the steps in order. Each step tells you what you should see when it worked. Setting up the first time takes about 20 minutes.

**Contents**
- [Part A: First-time setup](#part-a-first-time-setup) (do once)
- [Part B: Open the app on your phone](#part-b-open-the-app-on-your-phone) (every time)
- [Part C: Before you push code](#part-c-before-you-push-code)
- [Part D: How the code is organized](#part-d-how-the-code-is-organized)
- [Something went wrong?](#something-went-wrong)

---

## Part A: First-time setup

### Step 1: Set up the website first

The phone app reuses the website's keys and database, so the website setup has to be done first.

Follow **Part 1 of [ONBOARDING.md](../ONBOARDING.md)** (in the main folder).

✅ **It worked if** the website opens at http://localhost:3000 and you can sign in.

### Step 2: Install Expo Go on your phone

Expo Go is a free app that runs our app on your phone while you develop.

- iPhone: [Expo Go on the App Store](https://apps.apple.com/app/expo-go/id982107779)
- Android: [Expo Go on Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

> Prefer a simulator instead of a phone? Android: [Android Studio emulator](https://docs.expo.dev/workflow/android-studio-emulator/) (Windows or Mac). iPhone: [Xcode simulator](https://docs.expo.dev/workflow/ios-simulator/) (Mac only).

### Step 3: Make an Expo account

1. Sign up for free at [expo.dev/signup](https://expo.dev/signup). Use your **own** account, not a shared one.
2. Open **Expo Go** on your phone and sign in with that account.

On an iPhone, Expo Go only opens apps when it's signed in (see the iPhone rule below).

> **iPhone rule:** Expo Go on an iPhone only opens an app from a computer signed in to the **same** Expo account. So iPhone users run the server on their **own** laptop and scan their **own** QR code. A teammate's QR code won't open ("these accounts need to match"). Android phones don't have this rule.

### Step 4: Open a terminal in the `mobile` folder

- **Windows:** press the Windows key, type **cmd**, open **Command Prompt**.
- **Mac:** open **Terminal**.

Then go to the `mobile` folder inside the project (change the path to wherever you cloned it):

```bash
cd path/to/acm_checkin/mobile
```

> **Windows + PowerShell users:** if you get *"running scripts is disabled on this system"*, either use Command Prompt instead, or type `npx.cmd` / `npm.cmd` wherever this guide says `npx` / `npm`.

### Step 5: Install the app's packages

```bash
npm install
```

✅ **It worked if** it ends with something like `added 1159 packages`. (Warnings are fine. Only `ERR!` lines mean it failed.)

### Step 6: Log in to Expo on your computer

```bash
npx expo login
```

Use the same Expo account as on your phone.

✅ **It worked if** it says `Logged in as <your-username>`.

### Step 7: Create your settings file

The app reads its keys from a file called `.env.local` in the `mobile` folder. Make it by copying the example:

- Windows: `copy .env.example .env.local`
- Mac: `cp .env.example .env.local`

Open `mobile/.env.local` in your editor (VS Code, Notepad…) and fill in the values below. You copy them from the **other** `.env.local`, the one in the main project folder that the website setup created.

| In `mobile/.env.local`, set… | …to the value of this line in the main `.env.local` |
| --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `EXPO_PUBLIC_SUPABASE_URL` | **Leave it as `http://127.0.0.1:54321`** |

Save the file.

> **Why leave it as 127.0.0.1?** On a phone, `127.0.0.1` would mean the phone itself. But while developing, the app automatically swaps in your laptop's address (the same one Expo Go loaded the app from), so it reaches your laptop's database, even when your Wi-Fi address changes.

> 🔒 Only the three values above go in this file. **Never** put `CLERK_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` here, because everything in this file is built into the app where anyone could read it. The file itself is never uploaded to GitHub.

🎉 First-time setup is done. Go to Part B.

---

## Part B: Open the app on your phone

Do this every time you want to work on the app.

### Step 1: Start Docker and the database

Open **Docker Desktop** and wait until it says **Engine running**. Then, in a terminal in the **main project folder** (not `mobile`):

```bash
npx supabase start
```

To also run the edge functions (onboarding saves through one), open another terminal in the main folder and run `npm run dev:functions`. Leave it open.

### Step 2: Start the app server

Your phone and laptop must be on the **same Wi-Fi** (eduroam works). In a terminal in the **`mobile` folder**:

```bash
npx expo start
```

✅ **It worked if** you see a big QR code. **Leave this terminal open** while you use the app.

> **Windows:** the first time, Windows asks whether to let **Node.js** through the firewall. Click **Allow** (tick both Private and Public networks), or your phone can't connect.

**If your phone can't connect**, try these in order:

1. **Fresh start.** Fully close Expo Go, delete the old entries under **Recently opened**, and scan the QR code that's in your terminal *now*. Old entries often point at a server that no longer exists.
2. **Your phone's hotspot.** Connect the laptop to your phone's Personal Hotspot and run `npx expo start` again. Nothing to install, and the database works too.
3. **Tunnels** (below). These work on any network, including ones that block devices from talking to each other (some guest, apartment and hotel Wi-Fi).

> **Windows PowerShell:** if `npx` or `npm` says *"running scripts is disabled on this system"*, use `npx.cmd` / `npm.cmd`, or run the commands in Command Prompt.

#### Tunnel mode: app *and* database over the internet

`npx expo start --tunnel` only tunnels the **app server** (port 8081), not the **database** (port 54321). On its own, the app loads but every database call fails with *"Network request failed"* (e.g. *"Couldn't load your orgs"*), because `127.0.0.1` on a phone means the phone itself. Give the database its own tunnel with Cloudflare's free `cloudflared`. Edge functions (onboarding, check-in) go through the same tunnel.

**One-time setup** (Windows, then open a **new** terminal):

```bash
winget install --id Cloudflare.cloudflared
```

On a Mac: `brew install cloudflared`.

**Each time** (four terminals, keep them open):

1. **Database** (main folder): `npx supabase start`
2. **Database tunnel** (main folder):

   ```bash
   cloudflared tunnel --url http://localhost:54321
   ```

   It prints an address like `https://random-words-1234.trycloudflare.com` inside a box of log lines. Can't spot it? Open http://127.0.0.1:20241/quicktunnel on the laptop: it shows `{"hostname": "…"}`.
3. **Point the app at it.** In `mobile/.env.local`, set:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://random-words-1234.trycloudflare.com
   ```

4. **Edge functions** (main folder, for onboarding and check-in): `npm run dev:functions`
5. **App** (`mobile` folder). `--clear` is required so the app picks up the new address:

   ```bash
   npx expo start --tunnel --clear
   ```

**Good to know:**

- **The address changes every time** you start `cloudflared`. Update `.env.local` and restart with `--clear` each time.
- **While it runs, your local database API is reachable from the internet** by anyone with that address. Logins and RLS still apply, and it's only local test data, but stop `cloudflared` when you're done.
- **When you're done, set `mobile/.env.local` back** to `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, or the next normal `npx expo start` will try a tunnel that no longer exists.
- Free quick tunnels can be slow or drop. If requests start failing, restart `cloudflared` and repeat steps 3 and 5.

### Step 3: Open it on your phone

- **iPhone:** open the **Camera** app, point it at the QR code, and tap **Open in Expo Go**.
- **Android:** open **Expo Go** and tap **Scan QR code**.

The first time takes up to a minute while the app loads.

✅ **It worked if** you see the **Sign in** screen with **Continue with Google**, email and password fields, and **Forgot password?** / **Email me a code instead** links.

Sign in with the **same account you use on the website**. You land on **Home**, which greets you by name. A brand-new account first sees **Finish your profile** (name and grad year). **Profile → Sign out** takes you back to Sign in. Closing and reopening the app keeps you signed in.

> Use the **QR code** from your terminal, not old entries in Expo Go's "Recently opened" list. Those can point at an address or server that no longer exists.

### Step 4: Make changes

Edit any file in `mobile/src/` and save. The app on your phone updates by itself within a second or two.

To stop the server, click the terminal and press **Ctrl + C**.

---

## Part C: Before you push code

GitHub automatically checks every pull request that changes the mobile app. Run the same three checks yourself first, in the `mobile` folder:

```bash
npm run lint
npm run typecheck
npm test
```

✅ All three should finish **without errors**. If one fails, read the message: it names the file and line to fix.

---

## Part D: How the code is organized

```
mobile/
  src/
    app/              Screens. Every file here is a screen (Expo Router).
      _layout.tsx       Decides what you see: signed out → (auth), no profile → onboarding, otherwise → (tabs)
      (auth)/           Sign in, Create account and Forgot password (email + password, Google, or an email code)
      onboarding.tsx    Finish your profile (first name, last name, grad year)
      (tabs)/           The tab bar for signed-in users: Home, Check in, Profile
    lib/              Non-screen logic: the onboarding check, onboarding submit, Clerk error messages
    components/       Reusable pieces (Screen, PlaceholderScreen, Button)
    theme/            All colours, corner sizes and spacing
```

### Colours: always use the theme

All colours are copied from the website's design (`app/globals.css`) into `src/theme/tokens.ts`. **Never type a colour code like `#7c3aed` in a screen.** Use the theme instead:

```tsx
import { colors, radii, space } from '@/theme';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: space[4],
  },
});
```

Two automatic checks keep this honest:
- `npm run lint` fails if a screen contains a raw colour code.
- `npm test` fails if a colour no longer matches the website. If the web team changes a colour, update `tokens.ts` to match.

Design rules (same as the website): purple (`colors.accent`) is **only** for the main button, the selected tab, and logos/avatars. Green/amber/red are for success/warning/error only. Light mode only.

---

## How auth reaches Supabase

The app has no API server. It reads the same Supabase tables as the web app, under the same RLS policies.

1. Clerk signs the user in and owns the session.
2. Every Supabase request calls `getClerkInstance().session.getToken()` through the supabase-js `accessToken` option. Clerk returns its cached session JWT and refreshes it before it expires, so the app never stores a token.
3. Supabase accepts that JWT because Clerk is registered as a third-party auth provider (`[auth.third_party.clerk]` in `supabase/config.toml`).
4. RLS policies read the caller from `auth.jwt() ->> 'sub'` through `current_clerk_id()`. That Clerk id is the only identity Postgres trusts.

When the user is signed out, `useSupabase()` returns `null` and every query function returns `null` or `[]` without a network call. If a request goes out with no session anyway, supabase-js sends the anon key and RLS returns no personal data.

The app bundle only holds the anon key. `createSupabase` throws if it receives a service-role key (`sb_secret_...` or a JWT with `role: service_role`).

The query functions filter by the Clerk id decoded from the same token Supabase verifies. That filter narrows results for officers and admins, whose policies can read other people's rows. RLS does the security check, so screens never pass in a user id.

## Using it in a screen

```tsx
import { getMyMemberships, useSupabase, type MyMembership } from "../lib/supabase";

const supabase = useSupabase();
const [memberships, setMemberships] = useState<MyMembership[]>([]);
const [error, setError] = useState<unknown>(null);

useEffect(() => {
  getMyMemberships(supabase).then(setMemberships).catch(setError);
}, [supabase]);
```

Add new reads to `src/lib/supabase/queries.ts` instead of writing queries inline. Query functions throw a `DataError` when Supabase returns an error. `error.authRejected` is true when Supabase rejected the Clerk token, which usually means the Clerk third-party provider is missing or points at a different Clerk instance than your keys.

## Database types

`src/lib/supabase/database.types.ts` is generated from the migrations. Regenerate it after any migration with `npm run gen:types` while local Supabase is running.

## Tests

`npm test` runs the unit tests. `npm run test:rls` runs the RLS tests against your local Supabase on Mac, Windows or Linux. It mints session tokens with the local JWT secret, creates two throwaway attendees named `user_rlstest_...`, and checks that each user only sees their own rows and that signed out reads return nothing. Those rows stay in your local database until you run `npx supabase db reset`.

---

## Something went wrong?

Find the message you're seeing:

| What you see | What to do |
| --- | --- |
| **"running scripts is disabled on this system"** (Windows PowerShell) | Use **Command Prompt**, or type `npx.cmd` / `npm.cmd` instead of `npx` / `npm`. |
| **"Missing Clerk key"** screen on the phone | `mobile/.env.local` is missing or the Clerk line is empty (Part A, Step 7). Fix it, stop the server (Ctrl + C), and start it again with `npx expo start -c`. The `-c` makes it reload the settings. |
| Expo Go asks you to **sign in to Expo CLI** / run `npx expo login` | Do Part A, Steps 3 and 6. Use the same account on phone and computer. |
| **"Could not connect to development server"**, stuck at some % | The download dropped partway (more common in tunnel mode). Fully close Expo Go (swipe it away), open it, and scan again. The second try is fast. Still failing? Turn off Wi-Fi on your phone and use cellular data. |
| **"Could not connect"** right away, no % | The server isn't running (Part B, Step 2), or you tapped the "Development servers" list instead of scanning the QR code. |
| **"Could not connect"** keeps happening even though the server is running | The tunnel has gone stale (common after it's been running for hours). Stop the server (Ctrl + C), start it again, delete the old entries under **Recently opened** in Expo Go, and scan the **new** QR code. The address may change (e.g. `-8081` → `-8082`). |
| iPhone: **"You're signed in to Expo CLI as … and to Expo Go as …"** | The phone and the computer running the server use different Expo accounts. Run the server on your own laptop with your own account (see the iPhone rule in Part A, Step 3). |
| **Onboarding:** "Couldn't reach the server" when tapping Continue | The phone can't reach your laptop's database. Use `npx expo start` on the same Wi-Fi (or your hotspot), or in tunnel mode give the database its own tunnel (Part B, Step 2, *Tunnel mode*). Make sure `npx supabase start` and `npm run dev:functions` are running. |
| Expo Go says the project is **incompatible** / wrong SDK | Update Expo Go from the App Store or Google Play. This app needs SDK 57. |
| **"Network request failed"** / **"Couldn't load your orgs"** | The app can't reach the database. Most often: you started with `--tunnel`, which doesn't carry the database. Use `npx expo start` on the same Wi-Fi, or set up the database tunnel (Part B, Step 2, *Tunnel mode*). Also check `npx supabase start` is running. |
| `npx supabase start` fails on Windows with an error about **vector** or **analytics** | Run `npx supabase start -x vector,logflare` instead. It skips the logging services, which don't work on Windows. |
| Tunnel mode stopped working after a while, or after restarting `cloudflared` | The database tunnel's address changed. Copy the new one into `EXPO_PUBLIC_SUPABASE_URL` in `mobile/.env.local` and restart with `npx expo start --tunnel --clear`. |
| You changed `.env.local` but nothing changed | Restart with `npx expo start -c`. Settings are only read at startup. |

Still stuck? Ask in the team channel and include a screenshot of the error.
