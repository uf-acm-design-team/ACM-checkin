import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

import type { MobileSupabase } from "./client";
import {
  callMemberCheckIn,
  CheckInNetworkError,
  MEMBER_CHECK_IN_FUNCTION,
} from "./member-check-in";

type InvokeResult = { data: unknown; error: unknown; response?: Response };

function fakeSupabase(result: InvokeResult) {
  const invoke = jest.fn(async () => result);
  const supabase = { client: { functions: { invoke } } } as unknown as MobileSupabase;
  return { supabase, invoke };
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("callMemberCheckIn", () => {
  it("calls member-check-in with the request body", async () => {
    const { supabase, invoke } = fakeSupabase({ data: { ok: true }, error: null });
    await callMemberCheckIn(supabase, { orgSlug: "acm", answers: {} });

    expect(invoke).toHaveBeenCalledWith(MEMBER_CHECK_IN_FUNCTION, {
      body: { orgSlug: "acm", answers: {} },
    });
  });

  it("returns the stub's 501 'not implemented' reply instead of throwing", async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: httpError(501, { ok: false, error: "not implemented" }),
    });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({
      status: 501,
      ok: false,
      error: "not implemented",
      body: { ok: false, error: "not implemented" },
    });
  });

  it("returns a 401 when the token is missing or rejected", async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: httpError(401, { ok: false, error: "You must be signed in." }),
    });
    const result = await callMemberCheckIn(supabase, { orgSlug: "acm" });
    expect(result.status).toBe(401);
    expect(result.error).toBe("You must be signed in.");
  });

  it("returns a success reply", async () => {
    const { supabase } = fakeSupabase({
      data: { ok: true },
      error: null,
      response: new Response(null, { status: 200 }),
    });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toMatchObject({
      status: 200,
      ok: true,
      error: null,
    });
  });

  it("copes with an error reply that isn't JSON", async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: new FunctionsHttpError(new Response("Bad Gateway", { status: 502 })),
    });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toMatchObject({
      status: 502,
      ok: false,
      error: null,
    });
  });

  it("throws CheckInNetworkError when the request never got an answer", async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: new FunctionsFetchError(new TypeError("Network request failed")),
    });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).rejects.toBeInstanceOf(
      CheckInNetworkError,
    );
  });
});
