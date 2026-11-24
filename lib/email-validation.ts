export const EMAIL_MAX_LENGTH = 254;
export const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";

// Deliberately practical rather than a complete RFC 5322 parser. Guest
// check-in needs a non-empty local part, one @, and a dotted domain without
// whitespace. Whether the mailbox actually exists is outside this validator.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidation =
  | { ok: true; value: string }
  | { ok: false };

/** Normalize an address and validate the format used by guest check-in. */
export function validateEmail(input: unknown): EmailValidation {
  if (typeof input !== "string") return { ok: false };

  const value = input.trim().toLowerCase();
  if (!value || value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value)) {
    return { ok: false };
  }

  return { ok: true, value };
}
