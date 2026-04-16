import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full rounded-xl border border-white/60 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/60 outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-white focus-visible:ring-2 focus-visible:ring-white/20",
        className
      )}
      {...props}
    />
  );
}

export { Input };
