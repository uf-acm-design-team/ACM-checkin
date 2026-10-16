export function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

export const anonKey = fakeJwt({ role: "anon", iss: "supabase-demo" });

export type RecordedRequest = { url: string; authorization: string | null };

export function recordingFetch(respond: (url: string) => Response = () => jsonResponse([])) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("Authorization") });
    return respond(url);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
