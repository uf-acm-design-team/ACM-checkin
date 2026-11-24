/**
 * Calls a Supabase Edge Function from the browser, as the signed-in user.
 *
 * Functions are called directly rather than through a server action: each one
 * verifies the Clerk token and validates its own input, so a server hop would
 * add latency without adding protection. The browser only ever sends the
 * public anon key and the user's own short-lived token. See docs/API.md.
 *
 * Never throws. Every failure comes back with a code, in the same shape the
 * functions use, so callers branch on `code` only. The codes say where it went
 * wrong, because callers show those cases differently:
 *
 * - `network_error`: no answer from the function. The request failed (offline,
 *   DNS, connection reset), hit the timeout, or something else answered
 *   instead (a gateway error page, a 404 for an undeployed function). Worth a
 *   retry. No function sends this code; only this helper does.
 * - `server_error`: the function answered and reported a failure of its own,
 *   or this app is missing its Supabase settings.
 * - `unauthenticated`: there was no Clerk token to send.
 */

export type EdgeFunctionFailure = {
  ok: false;
  code: "unauthenticated" | "network_error" | "server_error";
  error: string;
};

export type EdgeFunctionDeps = {
  supabaseUrl?: string;
  anonKey?: string;
  fetchImpl?: typeof fetch;
  /** Abort and fail after this long. */
  timeoutMs?: number;
};

export const EDGE_FUNCTION_TIMEOUT_MS = 15_000;

function failure(code: EdgeFunctionFailure["code"], error: string): EdgeFunctionFailure {
  return { ok: false, code, error };
}

function isResponseBody(value: unknown): value is { ok: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

/**
 * POSTs `body` as JSON to `/functions/v1/<name>`. `R` is the function's
 * response type from its contract.ts.
 *
 * `getToken` is called on every request and never cached, so Clerk can hand
 * back a refreshed token.
 */
export async function callEdgeFunction<R extends { ok: boolean }>(
  name: string,
  body: unknown,
  getToken: () => Promise<string | null>,
  {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    fetchImpl = fetch,
    timeoutMs = EDGE_FUNCTION_TIMEOUT_MS,
  }: EdgeFunctionDeps = {},
): Promise<R | EdgeFunctionFailure> {
  if (!supabaseUrl || !anonKey) {
    return failure("server_error", "The app is missing its Supabase settings.");
  }

  const token = await getToken().catch(() => null);
  if (!token) {
    return failure("unauthenticated", "Your session has expired. Please sign in again.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return controller.signal.aborted
      ? failure("network_error", "The server took too long to respond. Please try again.")
      : failure("network_error", "Couldn't reach the server. Check your connection and try again.");
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  } finally {
    clearTimeout(timer);
  }

  if (!isResponseBody(parsed)) {
    console.error(`${name}: unexpected response`, res.status, res.statusText);
    return failure(
      "network_error",
      `Couldn't get an answer from the server (error ${res.status}). Please try again.`,
    );
  }
  return parsed as R;
}
