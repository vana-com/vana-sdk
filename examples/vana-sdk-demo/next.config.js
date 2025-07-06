/** @type {import('next').NextConfig} */
const path = require("path");
const fs = require("fs");

const nextConfig = {
  // Instructs Next.js to compile the 'vana-sdk' package from source.
  // This resolves module mismatches (ESM/CJS) and handles dependencies correctly.
  transpilePackages: ["vana-sdk"],

  webpack: (config, { isServer }) => {
    // DEBUG: Log environment information
    const srcPath = path.resolve(__dirname, "src");
    const libPath = path.resolve(__dirname, "src", "lib");

    console.log("=== VERCEL DEBUG INFO ===");
    console.log("__dirname:", __dirname);
    console.log("srcPath:", srcPath);
    console.log("libPath:", libPath);
    console.log("src exists:", fs.existsSync(srcPath));
    console.log("lib exists:", fs.existsSync(libPath));

    if (fs.existsSync(libPath)) {
      try {
        const libFiles = fs.readdirSync(libPath);
        console.log("lib files:", libFiles);
      } catch (e) {
        console.log("Error reading lib directory:", e.message);
      }
    }

    console.log("isServer:", isServer);
    console.log("=== END DEBUG INFO ===");

    // Add resolve aliases to match tsconfig.json paths
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": srcPath,
    };

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
