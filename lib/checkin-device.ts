import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const CHECKIN_DEVICE_COOKIE = "acm_checkin_device";
export const CHECKIN_DEVICE_MAX_AGE = 365 * 24 * 60 * 60;
export const DEVICE_REQUIRED_MESSAGE =
  "Enable cookies and reload this page before checking in.";
export const DEVICE_ALREADY_CHECKED_IN_MESSAGE =
  "This device has already checked in for this meeting.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function signature(id: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`acm-checkin-device:v1:${id}`)
    .digest("base64url");
}

/** A signed, opaque browser identity. It contains no attendee information. */
export function issueDeviceCookie(secret: string): string {
  if (!secret) throw new Error("Device signing key is not configured");
  const id = randomUUID();
  return `${id}.${signature(id, secret)}`;
}

export function verifyDeviceCookie(value: unknown, secret: string): string | null {
  if (!secret || typeof value !== "string") return null;
  const [id, mac, extra] = value.split(".");
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(mac ?? "") || extra !== undefined) {
    return null;
  }
  const expected = signature(id, secret);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? id : null;
}
