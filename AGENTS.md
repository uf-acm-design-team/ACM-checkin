# AGENTS.md

Notes for anyone (human or agent) changing this codebase. Setup lives in
[ONBOARDING.md](ONBOARDING.md).

## Client vs server

Reads and simple writes use the browser Supabase client. Writes that need
server-side validation or a server-derived identity go through server actions,
such as meeting create, open/close, and delete in
`app/[orgSlug]/admin-dashboard/actions.ts`.

Every exported server action is a public endpoint, callable from any page with
any arguments. In each action:

- Get the user from `auth()`. Never accept a user id argument.
- Treat input as `unknown` and validate it with a pure function in `lib/`
  (meetings use `lib/meeting-validation.ts`).
- Return `{ ok: false, error }` rather than throwing; Next hides thrown
  messages in production.
- Use `createClerkSupabaseClient()`, so RLS decides who may write and the audit
  triggers record the real user. Not the service-role client: it bypasses RLS,
  and the triggers then log deletes as `system:` and skip status changes.
- Add `.select("id")` to updates and deletes. A write RLS blocks returns no
  error, just zero rows.

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

### The meeting editor still writes from the browser

`admin-dashboard/meetings/[meetingId]/page.tsx` saves with the browser client
and its own validation, not `lib/meeting-validation.ts`. RLS still limits it to
officers, but it accepts values the dashboard rejects, such as a latitude of
200 or a radius under 10 m.

### The database doesn't range-check meetings

There are no CHECK constraints on `latitude`, `longitude`, `radius_meters`, or
end time after start time. Only the server action checks them, so the editor,
the SQL editor, or a direct API call can still store bad values.
