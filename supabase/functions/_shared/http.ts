// HTTP plumbing shared by the edge functions: CORS, JSON responses, and a
// typed responder that picks the status from an error code.
//
// No Deno APIs, so Vitest can run it (http.test.ts). Each function bundles its
// own copy at deploy time. Note that a change here only reaches a function once that
// function is redeployed.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The reply to a CORS preflight, or null when `req` isn't one. */
export function corsPreflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

/** The response shape the responder accepts: a success, or a failure with a code. */
type CodedResponse = { ok: true } | { ok: false; code: string };

/** The `code` values a response type can fail with. */
export type ErrorCodeOf<R extends CodedResponse> = Extract<R, { ok: false }>["code"];

/**
 * Returns a `respond(body)` that sends 200 for a success and looks the status
 * up from `body.code` for a failure. One table per function means a call site
 * can't pair an error with the wrong status, and typing `R` as the function's
 * contract checks every response against it.
 *
 *   const respond = responder<MyResponse>({ invalid_request: 400, ... });
 *   return respond({ ok: false, code: "invalid_request", error: "..." });
 */
export function responder<R extends CodedResponse>(
  statusByCode: Record<ErrorCodeOf<R>, number>,
): (body: R) => Response {
  return (body) =>
    jsonResponse(body, body.ok ? 200 : statusByCode[body.code as ErrorCodeOf<R>]);
}
