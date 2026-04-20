import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BrandButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "h-12 w-full rounded-2xl bg-brand-action text-base font-semibold text-white shadow-[0_10px_25px_rgba(225,59,53,0.25)] hover:bg-brand-action/95",
        className
      )}
      {...props}
    />
  );
}
