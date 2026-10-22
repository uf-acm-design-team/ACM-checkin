import { FunctionsHttpError } from "@supabase/supabase-js";

import type { MemberCheckInRequest, MemberCheckInResponse } from "../member-check-in";
import type { MobileSupabase } from "./client";

export const MEMBER_CHECK_IN_FUNCTION = "member-check-in";

/**
 * What came back from member-check-in. `reply` is the function's own
 * contract response (branch on `reply.code` when `reply.ok` is false); it is
 * null when something else answered instead, e.g. the gateway's 404 because
 * the function isn't being served, or a 502 from a proxy.
 */
export type MemberCheckInResult = {
  status: number;
  reply: MemberCheckInResponse | null;
};

/** The request never reached the function (offline, server down, DNS). */
export class CheckInNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network request failed");
    this.name = "CheckInNetworkError";
  }
}

/** True for bodies shaped like the contract: `{ ok: true, ... }` or `{ ok: false, code, error }`. */
function isContractReply(body: unknown): body is MemberCheckInResponse {
  if (!body || typeof body !== "object") return false;
  const { ok, code, error } = body as { ok?: unknown; code?: unknown; error?: unknown };
  if (ok === true) return true;
  return ok === false && typeof code === "string" && typeof error === "string";
}

/**
 * Calls member-check-in through the shared client, which attaches the user's
 * Clerk token. The contract and its status codes are in
 * supabase/functions/member-check-in/contract.ts (ADTCIA-38). Error replies
 * (401, 400, 501, …) come back as a result the screen can show; only a
 * request that never got an answer throws.
 */
export async function callMemberCheckIn(
  supabase: MobileSupabase,
  request: MemberCheckInRequest,
): Promise<MemberCheckInResult> {
  const { data, error, response } = await supabase.client.functions.invoke(
    MEMBER_CHECK_IN_FUNCTION,
    { body: request },
  );

  if (!error) {
    return { status: response?.status ?? 200, reply: isContractReply(data) ? data : null };
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    return { status: res.status, reply: isContractReply(body) ? body : null };
  }

  throw new CheckInNetworkError(error);
}
