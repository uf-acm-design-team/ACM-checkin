import { Linking } from 'react-native';

import { Button } from '@/components/button';
import type { MemberCheckInErrorCode } from '@/lib/member-check-in';
import type { LocationFailure } from '@/lib/location';
import type { MemberCheckInResult } from '@/lib/supabase';

import { Muted, Panel, type Tone } from './panel';

/** Title and tone for each reply. Branches on the contract's stable `code`, never on `error` wording. */
export function describeReply({ reply }: MemberCheckInResult): { title: string; tone: Tone } {
  if (!reply) return { title: 'Check-in service unavailable', tone: 'bad' };
  if (reply.ok) {
    return reply.alreadyCheckedIn
      ? { title: 'You’re already checked in', tone: 'good' }
      : { title: 'Checked in', tone: 'good' };
  }
  // not_implemented was the stub's code before #77 (the real check-in logic)
  // and is gone from its contract; widened so this compiles either side of it.
  const code: MemberCheckInErrorCode | 'not_implemented' = reply.code;
  switch (code) {
    case 'not_implemented':
      return { title: 'Check-in isn’t available yet', tone: 'warn' };
    case 'unauthenticated':
      return { title: 'Please sign in again', tone: 'bad' };
    case 'no_profile':
      return { title: 'Finish your profile first', tone: 'bad' };
    case 'wrong_password':
      return { title: 'Wrong meeting password', tone: 'bad' };
    case 'outside_geofence':
      return { title: 'You’re not at the meeting', tone: 'bad' };
    case 'no_active_meeting':
    case 'meeting_closed':
      return { title: 'No meeting is open right now', tone: 'warn' };
    case 'org_not_found':
      return { title: 'We couldn’t find this club', tone: 'bad' };
    case 'invalid_answers':
      return { title: 'Check your answers', tone: 'bad' };
    default:
      return { title: 'Check-in failed', tone: 'bad' };
  }
}

/**
 * Progress toward membership, which #77 adds to a new check-in's success
 * reply. Read structurally until this branch's contract has the field.
 */
export function membershipProgress(result: MemberCheckInResult): { attended: number; threshold: number } | null {
  const membership = (result.reply as { membership?: unknown } | null)?.membership;
  if (!membership || typeof membership !== 'object') return null;
  const { attended, threshold } = membership as Record<string, unknown>;
  return typeof attended === 'number' && typeof threshold === 'number' ? { attended, threshold } : null;
}

/**
 * What the server said. Failures show its `error` text (safe to show, per the
 * contract) and, for a rejected request, each field's problem. Answer errors
 * are shown on the questions themselves, not here.
 */
export function CheckInReply({
  result,
  meetingTitle,
  onRefreshMeetings,
}: {
  result: MemberCheckInResult;
  meetingTitle: string;
  onRefreshMeetings: () => void;
}) {
  const { title, tone } = describeReply(result);
  const { reply } = result;

  if (!reply) {
    return (
      <Panel tone={tone} title={title}>
        <Muted>Server replied {result.status}. Try again in a moment.</Muted>
        {result.status === 404 && __DEV__ ? (
          <Muted>
            The member-check-in function isn’t running. Start it with `npm run dev:functions` in the repo root.
          </Muted>
        ) : null}
      </Panel>
    );
  }

  if (reply.ok) {
    const membership = reply.alreadyCheckedIn ? null : membershipProgress(result);
    return (
      <Panel tone={tone} title={title}>
        <Muted>
          {reply.alreadyCheckedIn
            ? `Your check-in to ${meetingTitle} was already recorded.`
            : `You’re checked in to ${meetingTitle}.`}
        </Muted>
        {membership ? (
          <Muted>
            {membership.attended >= membership.threshold
              ? `That’s ${membership.attended} meetings. You’re an active member.`
              : `${membership.attended} of ${membership.threshold} meetings toward membership.`}
          </Muted>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel tone={tone} title={title}>
      <Muted>{reply.error}</Muted>
      {reply.code === 'outside_geofence' && reply.geo.kind === 'too_far' ? (
        <Muted>
          Check-in works within {reply.geo.radius} m of the meeting. Move closer and try again.
        </Muted>
      ) : null}
      {reply.code === 'invalid_request'
        ? Object.entries(reply.fieldErrors).map(([field, message]) => (
            <Muted key={field}>
              {field}: {message}
            </Muted>
          ))
        : null}
      {(reply.code as string) === 'not_implemented' ? (
        <Muted>The app reached the check-in service. Checking in arrives next sprint.</Muted>
      ) : null}
      {reply.code === 'no_active_meeting' || reply.code === 'meeting_closed' ? (
        <Button label="Refresh meetings" variant="secondary" onPress={onRefreshMeetings} />
      ) : null}
    </Panel>
  );
}

/** No location to send. Denied is fixed in Settings once the OS stops asking; the rest by retrying. */
export function LocationProblem({ failure, onRetry }: { failure: LocationFailure; onRetry: () => void }) {
  if (failure.kind === 'denied') {
    return (
      <Panel tone="bad" title="Location access is off">
        <Muted>This meeting checks that you’re in the room, so check-in needs your location.</Muted>
        {failure.canAskAgain ? (
          <Button label="Try again" onPress={onRetry} />
        ) : (
          <>
            <Muted>Turn on location for ACM Check-In in Settings, then come back and try again.</Muted>
            <Button label="Open Settings" onPress={() => Linking.openSettings()} />
            <Button label="Try again" variant="secondary" onPress={onRetry} />
          </>
        )}
      </Panel>
    );
  }

  return (
    <Panel tone="bad" title={failure.kind === 'timeout' ? 'Couldn’t find your location in time' : 'Couldn’t get your location'}>
      <Muted>
        {failure.kind === 'timeout'
          ? 'Your phone took too long to get a location fix. Step near a window or outside and try again.'
          : failure.message}
      </Muted>
      <Button label="Try again" onPress={onRetry} />
    </Panel>
  );
}
