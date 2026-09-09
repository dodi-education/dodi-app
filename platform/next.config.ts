import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted Docker image (platform/Dockerfile): `next build` emits a
  // minimal server plus the traced node_modules under .next/standalone. The
  // tracing root is the monorepo root so the raw-TS workspace packages under
  // core/* are resolved and copied into the image.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  transpilePackages: [
    "@dodi/ai",
    "@dodi/crypto",
    "@dodi/games",
    "@dodi/protocol",
    "@dodi/types",
    "@dodi/vault",
  ],
};

export default nextConfig;
