/** @type {import('next').NextConfig} */
const nextConfig = {
  // Instructs Next.js to compile the 'vana-sdk' package from source.
  // This resolves module mismatches (ESM/CJS) and handles dependencies correctly.
  transpilePackages: ["vana-sdk"],

  webpack: (config, { isServer }) => {
    // These fallbacks are still needed for dependencies that use Node.js APIs
    // in a way that can be polyfilled for the browser.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        stream: require.resolve("stream-browserify"),
        crypto: require.resolve("crypto-browserify"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser"),
      };

      config.plugins.push(
        new (require("webpack").ProvidePlugin)({
          process: "process/browser",
          Buffer: ["buffer", "Buffer"],
        }),
      );
    }

    // This is needed for certain dependencies that are not fully ESM-compatible.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    return config;
  },
};

module.exports = nextConfig;
