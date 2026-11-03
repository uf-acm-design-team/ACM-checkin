import { FunctionsHttpError } from "@supabase/supabase-js";

import type { MobileSupabase } from "./client";
import type { Attendee } from "./queries";

export const ONBOARD_ATTENDEE_FUNCTION = "onboard-attendee";

/**
 * Request and replies of the onboard-attendee edge function, typed from what
 * supabase/functions/onboard-attendee/index.ts sends (it has no shared
 * contract file). The function reads the user and email from the Clerk token,
 * never from the body.
 */
export type OnboardAttendeeRequest = {
  firstName: string;
  lastName: string;
  gradYear: string;
};

export type OnboardAttendeeSuccess = {
  ok: true;
  success: true;
  /** The user already had an attendees row; nothing was written. */
  alreadyOnboarded?: boolean;
  /** An earlier guest row with the same email was linked to this account. */
  claimed?: boolean;
  attendee: Pick<Attendee, "id" | "email" | "first_name" | "last_name" | "grad_year">;
};

/**
 * The function has no stable error `code`, only the HTTP status and an
 * English `error`. Branch on the status; `error` can include raw database
 * messages, so don't show it as is.
 */
export type OnboardAttendeeError = { ok: false; error: string };

export type OnboardAttendeeResponse = OnboardAttendeeSuccess | OnboardAttendeeError;

/**
 * What came back from onboard-attendee. `reply` is the function's own
 * response; it is null when something else answered instead, e.g. the
 * gateway's 404 because the function isn't being served, or a 502 from a proxy.
 */
export type OnboardAttendeeResult = {
  status: number;
  reply: OnboardAttendeeResponse | null;
};

/** The request never reached the function (offline, server down, DNS). */
export class OnboardingNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network request failed");
    this.name = "OnboardingNetworkError";
  }
}

/** True for bodies shaped like the function's replies: `{ ok: true, ... }` or `{ ok: false, error }`. */
function isOnboardReply(body: unknown): body is OnboardAttendeeResponse {
  if (!body || typeof body !== "object") return false;
  const { ok, error } = body as { ok?: unknown; error?: unknown };
  if (ok === true) return true;
  return ok === false && typeof error === "string";
}

/**
 * Calls onboard-attendee through the shared client, which attaches the user's
 * Clerk token. Error replies (401, 400, 409, 500, …) come back as a result the
 * screen can show; only a request that never got an answer throws.
 */
export async function callOnboardAttendee(
  supabase: MobileSupabase,
  request: OnboardAttendeeRequest,
): Promise<OnboardAttendeeResult> {
  const { data, error, response } = await supabase.client.functions.invoke(
    ONBOARD_ATTENDEE_FUNCTION,
    { body: request },
  );

  if (!error) {
    return { status: response?.status ?? 200, reply: isOnboardReply(data) ? data : null };
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    return { status: res.status, reply: isOnboardReply(body) ? body : null };
  }

  throw new OnboardingNetworkError(error);
}
