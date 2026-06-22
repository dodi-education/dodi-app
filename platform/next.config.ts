import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@dodi/ai",
    "@dodi/crypto",
    "@dodi/protocol",
    "@dodi/types",
    "@dodi/vault",
  ],
};

export default nextConfig;
