/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  // Instructs Next.js to compile the 'vana-sdk' package from source.
  // This resolves module mismatches (ESM/CJS) and handles dependencies correctly.
  transpilePackages: ["vana-sdk"],

  // ESLint configuration
  eslint: {
    // Disable Next.js built-in ESLint since we use root-level config
    ignoreDuringBuilds: true,
  },

  webpack: (config) => {
    // Enable WebAssembly support for high-performance ECIES
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Add rule for WebAssembly modules
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    // Add resolve aliases to match tsconfig.json paths
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };

    // This is needed for certain dependencies that are not fully ESM-compatible.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    return config;
  },
};

module.exports = nextConfig;
