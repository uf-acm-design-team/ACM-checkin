export type JwtClaims = {
  sub?: unknown;
  role?: unknown;
  exp?: unknown;
  [claim: string]: unknown;
};

export function decodeJwtClaims(token: string): JwtClaims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(base64UrlDecode(payload));
    return claims && typeof claims === "object" ? (claims as JwtClaims) : null;
  } catch {
    return null;
  }
}

export function subjectOf(token: string | null | undefined): string | null {
  if (!token) return null;
  const sub = decodeJwtClaims(token)?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const percentEncoded = Array.from(
    atob(padded),
    (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
  ).join("");
  return decodeURIComponent(percentEncoded);
}
