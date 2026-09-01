import { cn } from "@/lib/utils";

/**
 * The member/non-member marker.
 *
 * Rendered as a solid inverted chip when it sits on the accent membership card,
 * and as a tinted chip otherwise. A role (Officer, Owner) takes precedence over
 * the plain member label -- it is the more specific fact.
 */
export function MembershipBadge({
  isMember,
  orgName,
  role,
  onAccent = false,
}: {
  isMember: boolean;
  orgName: string;
  role?: string | null;
  /** Sitting on the accent card, so it inverts to white-on-accent. */
  onAccent?: boolean;
}) {
  const label =
    role && role !== "member"
      ? role.toUpperCase()
      : isMember
        ? "ACTIVE"
        : "GUEST";

  const title =
    role && role !== "member"
      ? `${role} of ${orgName}`
      : isMember
        ? `Member of ${orgName}`
        : `Not yet a member of ${orgName}`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-1.5 text-[11px] font-bold tracking-[0.04em]",
        onAccent
          ? "bg-white text-accent-deep"
          : isMember
            ? "bg-good-surface text-good-ink"
            : "bg-surface-sunken text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}
