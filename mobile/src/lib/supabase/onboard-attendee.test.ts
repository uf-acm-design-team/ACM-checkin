import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

import type { MobileSupabase } from "./client";
import {
  callOnboardAttendee,
  ONBOARD_ATTENDEE_FUNCTION,
  OnboardingNetworkError,
} from "./onboard-attendee";

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

const request = { firstName: "Maya", lastName: "Rivera", gradYear: "2027" };

// Reply bodies exactly as supabase/functions/onboard-attendee/index.ts sends them.
const attendee = { id: "a1", email: "maya@ufl.edu", first_name: "Maya", last_name: "Rivera", grad_year: "2027" };
const saved = { ok: true, success: true, claimed: false, attendee };
const unauthenticated = { ok: false, error: "You must be signed in to complete onboarding." };
const emailTaken = {
  ok: false,
  error: "This email is already linked to another account. Contact an officer if that's unexpected.",
};

describe("callOnboardAttendee", () => {
  it("calls onboard-attendee with the request body", async () => {
    const { supabase, invoke } = fakeSupabase({ data: saved, error: null });
    await callOnboardAttendee(supabase, request);

    expect(invoke).toHaveBeenCalledWith(ONBOARD_ATTENDEE_FUNCTION, { body: request });
  });

  it("returns a success reply", async () => {
    const { supabase } = fakeSupabase({ data: saved, error: null, response: new Response(null, { status: 200 }) });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({ status: 200, reply: saved });
  });

  it("returns the already-onboarded reply", async () => {
    const already = { ok: true, success: true, alreadyOnboarded: true, attendee };
    const { supabase } = fakeSupabase({ data: already, error: null });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({ status: 200, reply: already });
  });

  it("returns the 401 reply instead of throwing", async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(401, unauthenticated) });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({
      status: 401,
      reply: unauthenticated,
    });
  });

  it("returns the 409 email-conflict reply", async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(409, emailTaken) });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({ status: 409, reply: emailTaken });
  });

  it("has no reply when something other than the function answered", async () => {
    // e.g. the local gateway's 404 when onboard-attendee isn't being served
    const { supabase } = fakeSupabase({ data: null, error: httpError(404, "Function not found") });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({ status: 404, reply: null });
  });

  it("has no reply for a JSON body that isn't the function's", async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(502, { message: "Bad gateway" }) });
    await expect(callOnboardAttendee(supabase, request)).resolves.toEqual({ status: 502, reply: null });
  });

  it("throws OnboardingNetworkError when the request never got an answer", async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: new FunctionsFetchError(new TypeError("Network request failed")),
    });
    await expect(callOnboardAttendee(supabase, request)).rejects.toBeInstanceOf(OnboardingNetworkError);
  });
});
