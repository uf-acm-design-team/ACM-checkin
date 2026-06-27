import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace/module-resolution root to this project so Next doesn't
  // infer a parent dir (e.g. from a stray lockfile), which breaks resolving
  // 'tailwindcss' and other deps. See enhanced-resolve "Can't resolve" errors.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
