import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  devIndicators: {
    position: 'bottom-right',
  },
  transpilePackages: ["@dodi/ai", "@dodi/crypto", "@dodi/types", "@dodi/vault"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
