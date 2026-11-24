import { afterEach, describe, expect, it, vi } from "vitest";

import { callEdgeFunction, type EdgeFunctionDeps } from "./edge-functions";

type TestResponse = { ok: true; value: number } | { ok: false; code: "bad_input"; error: string };

const token = async () => "tok_123";

function deps(fetchImpl: EdgeFunctionDeps["fetchImpl"], extra: EdgeFunctionDeps = {}): EdgeFunctionDeps {
  return { supabaseUrl: "http://sb.test/", anonKey: "anon_key", fetchImpl, ...extra };
}

function jsonReply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe("callEdgeFunction", () => {
  it("POSTs JSON with the anon key and a bearer token", async () => {
    const fetchImpl = jsonReply({ ok: true, value: 1 });
    await callEdgeFunction<TestResponse>("my-fn", { a: 1 }, token, deps(fetchImpl));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://sb.test/functions/v1/my-fn");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "anon_key",
      Authorization: "Bearer tok_123",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
  });

  it("asks for a fresh token on every call", async () => {
    const getToken = vi.fn(token);
    const fetchImpl = jsonReply({ ok: true, value: 1 });
    await callEdgeFunction("my-fn", {}, getToken, deps(fetchImpl));
    await callEdgeFunction("my-fn", {}, getToken, deps(fetchImpl));
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("returns the function's body for a success", async () => {
    const result = await callEdgeFunction<TestResponse>("my-fn", {}, token, deps(jsonReply({ ok: true, value: 7 })));
    expect(result).toEqual({ ok: true, value: 7 });
  });

  it("returns the function's own failure, code and all", async () => {
    const reply = jsonReply({ ok: false, code: "bad_input", error: "Nope." }, 400);
    const result = await callEdgeFunction<TestResponse>("my-fn", {}, token, deps(reply));
    expect(result).toEqual({ ok: false, code: "bad_input", error: "Nope." });
  });

  it("fails as unauthenticated without calling out when there is no token", async () => {
    const fetchImpl = jsonReply({ ok: true, value: 1 });
    const result = await callEdgeFunction("my-fn", {}, async () => null, deps(fetchImpl));
    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a token lookup that throws like no token", async () => {
    const broken = async () => {
      throw new Error("clerk down");
    };
    const result = await callEdgeFunction("my-fn", {}, broken, deps(jsonReply({ ok: true })));
    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("fails as server_error when Supabase settings are missing", async () => {
    const result = await callEdgeFunction("my-fn", {}, token, deps(jsonReply({ ok: true }), { anonKey: "" }));
    expect(result).toMatchObject({ ok: false, code: "server_error" });
  });

  it("fails as server_error when the network is down", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await callEdgeFunction("my-fn", {}, token, deps(offline));
    expect(result).toEqual({
      ok: false,
      code: "server_error",
      error: "Couldn't reach the server. Check your connection and try again.",
    });
  });

  it.each([
    ["an HTML error page", new Response("<html>Bad Gateway</html>", { status: 502 })],
    ["JSON that isn't a function response", new Response('{"message":"not found"}', { status: 404 })],
    ["an empty body", new Response(null, { status: 500 })],
  ])("fails as server_error for %s", async (_, response) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await callEdgeFunction("my-fn", {}, token, deps(vi.fn(async () => response)));
    expect(result).toMatchObject({ ok: false, code: "server_error" });
    expect((result as { error: string }).error).toContain(`error ${response.status}`);
  });

  it("gives up after the timeout", async () => {
    const hangs: EdgeFunctionDeps["fetchImpl"] = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    const result = await callEdgeFunction("my-fn", {}, token, deps(hangs, { timeoutMs: 10 }));
    expect(result).toEqual({
      ok: false,
      code: "server_error",
      error: "The server took too long to respond. Please try again.",
    });
  });
});
