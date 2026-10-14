# AGENTS.md

Notes for anyone (human or agent) changing this codebase. Setup lives in
[ONBOARDING.md](ONBOARDING.md).

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
