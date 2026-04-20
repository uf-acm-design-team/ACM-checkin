import * as React from "react";

import { Footer } from "@/components/aed-checkin/footer";
import { Header } from "@/components/aed-checkin/header";
import { cn } from "@/lib/utils";

type MobileShellProps = {
  children: React.ReactNode;
  className?: string;
};

export function MobileShell({ children, className }: MobileShellProps) {
  return (
    <div
      className={cn(
        "min-h-dvh max-w-md mx-auto flex flex-col relative shadow-2xl bg-[var(--brand-background)]",
        className
      )}
    >
      <Header />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      <Footer />
    </div>
  );
}
