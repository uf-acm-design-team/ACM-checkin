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
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json" },
    }),
  );
}

// Reply bodies exactly as supabase/functions/member-check-in/index.ts sends them.
const notImplemented = { ok: false, code: "not_implemented", error: "not implemented" };
const unauthenticated = { ok: false, code: "unauthenticated", error: "You need to be signed in." };

describe("callMemberCheckIn", () => {
  it("calls member-check-in with the request body", async () => {
    const { supabase, invoke } = fakeSupabase({ data: { ok: true, meetingId: "m1", alreadyCheckedIn: false }, error: null });
    await callMemberCheckIn(supabase, { orgSlug: "acm", answers: {} });

    expect(invoke).toHaveBeenCalledWith(MEMBER_CHECK_IN_FUNCTION, {
      body: { orgSlug: "acm", answers: {} },
    });
  });

  it("returns the 501 not_implemented reply instead of throwing", async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(501, notImplemented) });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({
      status: 501,
      reply: notImplemented,
    });
  });

  it("returns the 401 unauthenticated reply", async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(401, unauthenticated) });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({
      status: 401,
      reply: unauthenticated,
    });
  });

  it("returns a 400 invalid_request reply with its fieldErrors", async () => {
    const invalid = {
      ok: false,
      code: "invalid_request",
      error: "Invalid check-in request. See fieldErrors.",
      fieldErrors: { orgSlug: "Expected a string, got a number." },
    };
    const { supabase } = fakeSupabase({ data: null, error: httpError(400, invalid) });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({ status: 400, reply: invalid });
  });

  it("returns a success reply", async () => {
    const success = { ok: true, meetingId: "m1", alreadyCheckedIn: false };
    const { supabase } = fakeSupabase({ data: success, error: null, response: new Response(null, { status: 200 }) });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({ status: 200, reply: success });
  });

  it("has no reply when something other than the function answered", async () => {
    // e.g. the local gateway's 404 when member-check-in isn't being served
    const { supabase } = fakeSupabase({ data: null, error: httpError(404, "Function not found") });
    await expect(callMemberCheckIn(supabase, { orgSlug: "acm" })).resolves.toEqual({ status: 404, reply: null });
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
