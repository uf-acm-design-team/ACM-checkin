import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => true,
}));

import proxy from "../proxy";
import {
  CHECKIN_DEVICE_COOKIE,
  issueDeviceCookie,
  verifyDeviceCookie,
} from "./checkin-device";

const runProxy = proxy as unknown as (
  auth: () => Promise<{ userId: null }>,
  request: NextRequest,
) => Promise<NextResponse | undefined>;

function request(method = "GET", cookie?: string, path = "/acm/checkin") {
  return runProxy(async () => ({ userId: null }), new NextRequest(
    "https://checkin.example" + path,
    { method, headers: cookie ? { cookie: CHECKIN_DEVICE_COOKIE + "=" + cookie } : {} },
  ));
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proxy-key");
  vi.stubEnv("NODE_ENV", "production");
});

describe("device cookie provisioning", () => {
  it("issues a signed, persistent, secure HttpOnly cookie on check-in GET", async () => {
    const response = await request();
    const cookie = response?.cookies.get(CHECKIN_DEVICE_COOKIE);
    expect(verifyDeviceCookie(cookie?.value, "proxy-key")).toBeTruthy();
    expect(cookie).toMatchObject({
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 31536000,
    });
  });

  it("keeps the same identity on reloads, org changes and trailing-slash URLs", async () => {
    const value = issueDeviceCookie("proxy-key");
    const response = await request("GET", value, "/other-club/checkin/");
    expect(response?.cookies.get(CHECKIN_DEVICE_COOKIE)?.value).toBe(value);
  });

  it("replaces malformed cookies on page load", async () => {
    const response = await request("GET", "forged");
    expect(verifyDeviceCookie(
      response?.cookies.get(CHECKIN_DEVICE_COOKIE)?.value, "proxy-key",
    )).toBeTruthy();
  });

  it("never provisions identities on action POSTs or unrelated pages", async () => {
    expect(await request("POST")).toBeUndefined();
    expect(await request("GET", undefined, "/acm/checkin/states-preview")).toBeUndefined();
  });
});
