import { describe, expect, it } from "vitest";

import { corsHeaders, corsPreflight, jsonResponse, responder } from "./http.ts";

type TestResponse =
  | { ok: true; value: number }
  | { ok: false; code: "bad_input"; error: string }
  | { ok: false; code: "broken"; error: string };

const respond = responder<TestResponse>({ bad_input: 400, broken: 500 });

describe("responder", () => {
  it("sends 200 for a success", async () => {
    const res = respond({ ok: true, value: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, value: 1 });
  });

  it.each([
    ["bad_input", 400],
    ["broken", 500],
  ] as const)("sends the status mapped to %s", async (code, status) => {
    const res = respond({ ok: false, code, error: "nope" });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, code, error: "nope" });
  });
});

describe("jsonResponse", () => {
  it("sets JSON and CORS headers", () => {
    const res = jsonResponse({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(corsHeaders["Access-Control-Allow-Origin"]);
  });
});

describe("corsPreflight", () => {
  it("answers OPTIONS", () => {
    const res = corsPreflight(new Request("http://x", { method: "OPTIONS" }));
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("ignores everything else", () => {
    expect(corsPreflight(new Request("http://x", { method: "POST" }))).toBeNull();
  });
});
