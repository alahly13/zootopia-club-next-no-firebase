import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@zootopia/shared-config",
    "@zootopia/shared-types",
    "@zootopia/shared-utils",
  ],
};

export default nextConfig;
