import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser"),
        path: require.resolve("path-browserify"),
        querystring: require.resolve("querystring-es3"),
        url: require.resolve("url"),
      };

      // Prevent bundling server-only native module in client bundles
      config.resolve.alias = {
        ...config.resolve.alias,
        eccrypto: false,
      };
    }

    // Externalize native module on the server so Next doesn't try to bundle it
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean);
      config.externals = [...externals, "eccrypto"];
    }

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
