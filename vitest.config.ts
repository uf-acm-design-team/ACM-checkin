import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the "@/*": ["./*"] path alias in tsconfig.json. Next.js resolves it
  // natively; Vitest does not, so without this any test whose import chain
  // reaches an "@/..." import fails to collect (e.g. lib/org-members.ts ->
  // @/lib/membership).
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
