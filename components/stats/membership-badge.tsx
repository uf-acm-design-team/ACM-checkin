import { cn } from "@/lib/utils";

export function MembershipBadge({
  isMember,
  orgName,
}: {
  isMember: boolean;
  orgName: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        isMember
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-rose-400/30 bg-rose-400/10 text-rose-200"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full",
          isMember
            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
            : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]"
        )}
      />
      {isMember ? `${orgName} member` : "Potential member"}
    </span>
  );
}
