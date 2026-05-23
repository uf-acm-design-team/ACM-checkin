import * as React from "react";

import { Footer } from "@/components/aed/footer";
import { Header } from "@/components/aed/header";
import { cn } from "@/lib/utils";

type MobileShellProps = {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
};

export function MobileShell({ children, className, wide = false }: MobileShellProps) {
  return (
    <div
      className={cn(
        "min-h-dvh mx-auto flex flex-col relative",
        wide ? "max-w-md md:max-w-4xl" : "max-w-md md:max-w-2xl",
        className
      )}
    >
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}
