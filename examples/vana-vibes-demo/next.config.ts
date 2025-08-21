import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Prevent bundling unsupported optional dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/miniapp-sdk": false,
      "@farcaster/miniapp-wagmi-connector": false,
      "@farcaster/mini-app-solana": false,
      "@getpara/cosmos-wallet-connectors": false,
    };
    return config;
  },
};

export default nextConfig;
