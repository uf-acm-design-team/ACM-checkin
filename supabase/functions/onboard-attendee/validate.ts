// Body parsing for onboard-attendee, kept free of Deno APIs so Vitest can run
// it (validate.test.ts).

export const MAX_NAME_LENGTH = 100;

const PROFILE_KEYS = ["firstName", "lastName", "gradYear"] as const;

export type Profile = { firstName: string; lastName: string; gradYear: string };

export type ParsedOnboarding =
  // No profile fields sent: link an existing or guest row, write nothing new.
  | { mode: "link" }
  | { mode: "profile"; profile: Profile };

export type ParseResult =
  | { ok: true; request: ParsedOnboarding }
  // Every failure here is the caller's request, so index.ts sends invalid_request.
  | { ok: false; error: string };

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * `fields` is the JSON body, or a multipart form copied into an object. A key
 * counts as sent unless it is absent or null, so `{ firstName: "" }` is a
 * profile request with a blank name (400), not a link-only request.
 */
export function parseOnboardingFields(fields: Record<string, unknown>): ParseResult {
  const sent = PROFILE_KEYS.filter((key) => fields[key] != null);
  if (sent.length === 0) return { ok: true, request: { mode: "link" } };

  const firstName = sanitizeName(String(fields.firstName ?? ""));
  const lastName = sanitizeName(String(fields.lastName ?? ""));
  const gradYear = String(fields.gradYear ?? "").trim();

  if (!firstName || !lastName || !gradYear) {
    return { ok: false, error: "Missing required fields." };
  }

  return { ok: true, request: { mode: "profile", profile: { firstName, lastName, gradYear } } };
}
