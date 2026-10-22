import { FunctionsHttpError } from "@supabase/supabase-js";
import type { MobileSupabase } from "./client";

export const MEMBER_CHECK_IN_FUNCTION = "member-check-in";

/**
 * What the app sends to the member-check-in edge function (ADTCIA-38's
 * contract). Identity comes from the Clerk token only -- never put a user or
 * attendee id in here.
 *
 * TODO(ADTCIA-38): import the request/response types Luis exports with the
 * contract and delete these local copies.
 */
export type MemberCheckInRequest = {
  orgSlug: string;
  meetingId?: string;
  password?: string;
  answers?: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
};

/**
 * The function's reply, whatever the status code. While the endpoint is a
 * stub (ADTCIA-35) a signed-in call answers 501 { ok: false, error: "not implemented" }.
 */
export type MemberCheckInResponse = {
  status: number;
  ok: boolean;
  error: string | null;
  body: unknown;
};

/** The request never reached the function (offline, server down, DNS). */
export class CheckInNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network request failed");
    this.name = "CheckInNetworkError";
  }
}

function readBody(body: unknown): { ok: boolean; error: string | null } {
  if (!body || typeof body !== "object") return { ok: false, error: null };
  const { ok, error } = body as { ok?: unknown; error?: unknown };
  return { ok: ok === true, error: typeof error === "string" ? error : null };
}

/**
 * Calls member-check-in through the shared client, which attaches the user's
 * Clerk token. HTTP errors (401, 400, 501, …) come back as a response so the
 * screen can show them; only a request that never got an answer throws.
 */
export async function callMemberCheckIn(
  supabase: MobileSupabase,
  request: MemberCheckInRequest,
): Promise<MemberCheckInResponse> {
  const { data, error, response } = await supabase.client.functions.invoke(
    MEMBER_CHECK_IN_FUNCTION,
    { body: request },
  );

  if (!error) {
    return { status: response?.status ?? 200, ...readBody(data), body: data };
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    return { status: res.status, ...readBody(body), body };
  }

  throw new CheckInNetworkError(error);
}
