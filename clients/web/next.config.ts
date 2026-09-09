import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Self-hosted Docker image (clients/web/Dockerfile): `next build` emits a
  // minimal server plus the traced node_modules under .next/standalone. The
  // tracing root is the monorepo root so the raw-TS workspace packages under
  // core/* are resolved and copied into the image.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  devIndicators: {
    position: 'bottom-right',
  },
  transpilePackages: [
    "@dodi/ai",
    "@dodi/crypto",
    "@dodi/games",
    "@dodi/protocol",
    "@dodi/types",
    "@dodi/vault",
  ],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
