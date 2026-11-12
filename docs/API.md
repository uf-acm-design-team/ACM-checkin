# Edge Functions API

What each Supabase Edge Function in `supabase/functions/` accepts and returns.
For the TypeScript types, see the `contract.ts` next to a function when it has
one.

| Function | What it does | Called by |
| --- | --- | --- |
| [`onboard-attendee`](#onboard-attendee) | Creates or links the caller's attendee profile | Mobile onboarding |
| [`member-check-in`](#member-check-in) | Checks a signed-in member into an open meeting | Not called yet (in progress) |
| [`create-org`](#create-org) | Creates an organization and assigns its owner | `app/developer/page.tsx` |
| [`update-org-branding`](#update-org-branding) | Edits an organization's colors and logos | `app/[orgSlug]/admin-dashboard/branding-tab.tsx` |

## Calling a function

```
POST {SUPABASE_URL}/functions/v1/<name>
apikey: <Supabase anon key>
Authorization: Bearer <Clerk session token>
```

- **Locally**, `SUPABASE_URL` is `http://127.0.0.1:54321`. Run
  `npm run dev:functions` first.
- **Auth.** Every function has `verify_jwt = false` in `supabase/config.toml`,
  because the Supabase gateway can't verify Clerk tokens. Each function checks
  the token itself instead, by calling the `current_clerk_id()` RPC as the
  caller. An invalid or expired token gets a `401`.
- **Identity** always comes from the token. No function accepts a user id in
  the body.
- **Methods.** Only `POST`, plus `OPTIONS` for CORS preflight. Anything else is
  a `405`.
- **Errors** always include an `error` string that's safe to show the user. Its
  wording may change, so don't branch on it. `onboard-attendee` and
  `member-check-in` also send a stable `code`, so branch on that. `create-org` and
  `update-org-branding` don't have codes yet, so branch on the status there.
- **Shared code.** `supabase/functions/_shared/http.ts` holds the CORS headers,
  `jsonResponse()`, and `responder()`, which picks each error's status from its
  `code` using one table per function. `onboard-attendee` uses it. The other
  three still have their own copies for now.
- **Deploying.** Functions don't deploy on merge. A lead runs
  `npx supabase functions deploy <name>` against production. A change that
  makes web or mobile depend on a new function, or on new behavior, can merge
  only after that deploy.
- **Shared files deploy with each function.** Every function bundles its own
  copy of what it imports from `_shared/`, so a change there reaches a function
  only when that function is redeployed. Redeploy every function that imports
  the changed file.

---

## onboard-attendee

Gives the caller an `attendees` row. It reuses a row they already have, links
a guest row (one with `user_id` NULL) that has the same email, or creates a new
one. It then sets `publicMetadata.onboardingComplete` in Clerk.

The email always comes from Clerk's record of the user, never from the request.

Needs the `CLERK_SECRET_KEY` secret. Locally it lives in
`supabase/functions/.env` (`npm run setup:env` fills it in). In production a
lead sets it with `npx supabase secrets set CLERK_SECRET_KEY=...`.

Types: [`supabase/functions/onboard-attendee/contract.ts`](../supabase/functions/onboard-attendee/contract.ts)

### Request

JSON (`application/json`) or form data (`multipart/form-data`). The function
runs in one of two modes, depending on which fields are sent.

**Profile mode**: send all three fields.

| Field | Type | Notes |
| --- | --- | --- |
| `firstName` | string | Whitespace is collapsed and the value is capped at 100 characters |
| `lastName` | string | Same |
| `gradYear` | string | Trimmed. The function doesn't check the format; clients do |

**Link-only mode**: send none of them. An empty body or `{}` works. The function
links a row the user already has, or a guest row with their email, and writes
nothing new. Use it to skip the form for someone who already checked in as a
guest.

Sending some of the three fields but not all of them returns `400`.

### What happens, in order

1. **The caller already has a row.** Nothing is written to it, even in profile
   mode. Returns `alreadyOnboarded: true`.
2. **A guest row has the caller's email** (case-insensitive, exact match). It's
   linked to the caller and returns `claimed: true`. In profile mode the form's
   name and grad year replace the guest row's. In link-only mode the row keeps
   what the guest typed at check-in.
3. **Neither, in link-only mode.** Returns `needsProfile: true` and writes
   nothing.
4. **Neither, in profile mode.** A new row is inserted. If another request
   creates a row with the same email at the same moment, the function tries
   the link from step 2 once more before giving up with a `409`.

After any of steps 1, 2 or 4, the function sets `onboardingComplete` in Clerk,
along with the first and last name when a profile was sent. A failure there is
logged but doesn't fail the request: `proxy.ts` decides who still needs to
onboard by looking for an `attendees` row, not this flag.

### Response

`200`, the caller now has a row:

```json
{
  "ok": true,
  "success": true,
  "needsProfile": false,
  "alreadyOnboarded": false,
  "claimed": true,
  "attendee": {
    "id": "6f1c2a9e-…",
    "email": "ada@ufl.edu",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "grad_year": "2027"
  }
}
```

`200`, link-only mode with nothing to link:

```json
{
  "ok": true,
  "success": true,
  "needsProfile": true,
  "alreadyOnboarded": false,
  "claimed": false,
  "attendee": null
}
```

`success` is always the same as `ok`. It's kept for older callers.

Errors are `{ "ok": false, "code": "…", "error": "…" }`. Branch on `code`.

| Status | `code` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Body isn't a JSON object or form data, or some profile fields are missing or blank |
| `400` | `no_email` | The Clerk account has no email, so there's nothing to link or save |
| `401` | `unauthenticated` | No token, or an invalid one |
| `405` | `method_not_allowed` | Not `POST` |
| `409` | `email_taken` | Another account already owns this email |
| `500` | `server_error` | Missing server config (including `CLERK_SECRET_KEY`), Clerk couldn't be reached to look up the user, or a database error |

---

## member-check-in

Checks the signed-in caller into one of their org's open meetings. It enforces
the meeting window, password, geolock and form answers on the server.

**Status:** in progress. On `main` the function checks the request and the
token, then answers `501 not_implemented` to every valid request. The check-in
logic lands with PR #77. Nothing calls this function yet.

Types: [`supabase/functions/member-check-in/contract.ts`](../supabase/functions/member-check-in/contract.ts)

### Request

JSON only. Sending `user_id`, `userId`, `attendee_id` or `attendeeId` returns a
`400`, because the caller is identified only from the token.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `orgSlug` | string | yes | 1-40 characters |
| `meetingId` | uuid | no | Which open meeting to check into, when several are open at once |
| `password` | string | no | Needed when the meeting has a check-in password. Compared exactly, not trimmed |
| `answers` | object | no | Keyed by question id. Checked against the meeting's form (`lib/form-schema.ts`) |
| `latitude`, `longitude` | number | no | Send both or neither. Required when the meeting is geo-locked |

Leaving out an optional field and sending it as `null` mean the same thing.

### Response

`200`:

```json
{ "ok": true, "meetingId": "6f1c2a9e-…", "alreadyCheckedIn": false }
```

`alreadyCheckedIn: true` means the caller was already checked in to this
meeting. Nothing new was written, but it still counts as a success.

Errors are `{ "ok": false, "code": "…", "error": "…" }`, plus the extra
field shown for some codes. Branch on `code`.

| Status | `code` | Extra field | When |
| --- | --- | --- | --- |
| `400` | `invalid_request` | `fieldErrors` | Body doesn't match the table above. Every bad field is listed at once |
| `401` | `unauthenticated` | | No token, or an invalid one |
| `403` | `no_profile` | | The caller has no `attendees` row. Onboard first |
| `403` | `wrong_password` | | |
| `403` | `outside_geofence` | `geo` | Too far from the meeting, or no location sent to a geo-locked meeting |
| `404` | `org_not_found` | | |
| `405` | `method_not_allowed` | | |
| `409` | `no_active_meeting` | | No open meeting whose time window includes now |
| `409` | `meeting_closed` | | `meetingId` names a meeting that isn't open, while several others are |
| `422` | `invalid_answers` | `answerErrors` | Required questions unanswered, or answers that don't fit the form |
| `500` | `server_error` | | |
| `501` | `not_implemented` | | Every valid request, until PR #77 lands |

---

## create-org

Creates an organization with its branding and makes an existing user its
owner. Global admins only (`attendees.admin = true`).

### Request

`multipart/form-data` only.

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | 2-100 characters, whitespace collapsed |
| `slug` | yes | Lowercased, and runs of other characters become `-`. Must end up 2-40 characters of `a-z`, `0-9` and `-` |
| `owner_email` | yes | Must match an existing attendee who has an account |
| `color_primary`, `color_background`, `color_background_secondary`, `color_accent`, `color_text`, `particle_color` | no | Hex (`#abc` or `#aabbcc`). Missing or invalid values fall back to the defaults, which are kept in sync with `DEFAULT_BRANDING` in `lib/branding.ts` |
| `crest`, `wordmark` | no | Logo files: PNG, JPEG, WEBP or SVG, up to 2 MB. Leave them out for no logo |

### Response

`200`: `{ "success": true, "organization": { "id", "name", "slug", "branding" } }`

Errors are `{ "error": "…" }`. This function doesn't send `ok`.

| Status | When |
| --- | --- |
| `400` | Not form data, an invalid name or slug, an invalid owner email, a bad logo file, or another insert error |
| `401` | No token, or an invalid one |
| `403` | The caller isn't a global admin |
| `404` | No registered user has `owner_email` |
| `405` | Not `POST` |
| `409` | The slug is taken |
| `500` | Missing server config, a logo upload failure, or a database error |

**Watch out:** the organization is inserted *before* the owner is looked up.
A `404` for the owner, or a `500` while assigning them, leaves the org created
with no owner. Retrying with the same slug then fails with `409`. Check that the
owner email belongs to a registered user before calling.

---

## update-org-branding

Edits an existing organization's colors and logos. Only that org's owners and
co-owners (and global admins, through `has_org_role()`) can call it.

### Request

`multipart/form-data` only.

| Field | Required | Notes |
| --- | --- | --- |
| `org_id` | yes | The organization's uuid |
| `color_primary`, `color_background`, `color_background_secondary`, `color_accent`, `color_text`, `particle_color` | no | Hex. **Leaving one out, or sending an invalid value, keeps the current color.** If the stored color is invalid too, the default is used |
| `crest`, `wordmark` | no | Same file rules as `create-org`. A new file replaces the old one, and the old file is deleted from storage |

### Response

`200`: `{ "success": true, "organization": { "id", "name", "slug", "branding" } }`

Errors are `{ "error": "…" }`, with no `ok` field.

| Status | When |
| --- | --- |
| `400` | Not form data, `org_id` missing, a bad logo file, or the update failed |
| `401` | No token, or an invalid one |
| `403` | The caller isn't an owner or co-owner of this org |
| `404` | Organization not found |
| `405` | Not `POST` |
| `500` | Missing server config, the role check failed, or a logo upload failed |

The change is written to the audit log as `org.branding_updated`. `create-org`
logs `org.created` the same way.
