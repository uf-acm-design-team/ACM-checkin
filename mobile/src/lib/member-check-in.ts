/**
 * Request/response contract for the member-check-in edge function (ADTCIA-38).
 *
 * The source of truth is supabase/functions/member-check-in/contract.ts; this
 * re-exports it so screens import from '@/lib/member-check-in'. Type-only, so
 * nothing outside mobile/ ends up in the bundle.
 */
export type {
  AnswerMap,
  AnswerValue,
  GeofenceFailure,
  MemberCheckInError,
  MemberCheckInErrorCode,
  MemberCheckInRequest,
  MemberCheckInResponse,
  MemberCheckInSuccess,
} from '../../../supabase/functions/member-check-in/contract';
