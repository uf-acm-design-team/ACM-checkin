"use client";

import { createContext, useContext } from "react";
import type { Branding } from "@/lib/branding";

export type BrandingContextValue = Branding & {
  name: string;
  slug: string;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({
  value,
  children,
}: {
  value: BrandingContextValue;
  children: React.ReactNode;
}) {
  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return ctx;
}
