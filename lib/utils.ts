/**
 * Join class names, dropping falsy values. Dependency-free.
 * (Sufficient for additive conditional classes; swap for clsx + tailwind-merge
 * if conflicting-utility de-duplication is ever needed.)
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}
