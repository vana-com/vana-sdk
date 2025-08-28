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

  /**
   * @param {import('webpack').Configuration} config
   * @returns {import('webpack').Configuration}
   */
  webpack: (config) => {
    // Add resolve aliases to match tsconfig.json paths
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };

    // This is needed for certain dependencies that are not fully ESM-compatible.
    config.externals ??= [];
    if (Array.isArray(config.externals)) {
      config.externals.push("pino-pretty", "lokijs", "encoding");
    }

    return config;
  },
};

module.exports = nextConfig;
