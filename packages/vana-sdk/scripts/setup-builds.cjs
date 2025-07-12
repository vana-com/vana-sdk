/**
 * Build setup script to organize the different platform builds
 * This script copies the appropriate files to the expected locations for conditional exports
 */

const fs = require("fs");
const path = require("path");

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function setupBuilds() {
  console.log("Setting up conditional export builds...");

  // Copy Node.js specific builds
  if (fs.existsSync("dist/node/index.node.js")) {
    copyFile("dist/node/index.node.js", "dist/index.node.js");
    copyFile("dist/node/index.node.js", "dist/index.node.cjs");
  }

  // Copy browser specific builds
  if (fs.existsSync("dist/browser/index.browser.js")) {
    copyFile("dist/browser/index.browser.js", "dist/index.browser.js");
    copyFile("dist/browser/index.browser.js", "dist/index.browser.cjs");
  }

  // Copy platform adapters
  if (fs.existsSync("dist/node/platform/node.js")) {
    copyFile("dist/node/platform/node.js", "dist/platform/node.js");
    copyFile("dist/node/platform/node.js", "dist/platform/node.cjs");
    copyFile("dist/node/platform/node.d.ts", "dist/platform/node.d.ts");
  }

  if (fs.existsSync("dist/browser/platform/browser.js")) {
    copyFile("dist/browser/platform/browser.js", "dist/platform/browser.js");
    copyFile("dist/browser/platform/browser.js", "dist/platform/browser.cjs");
    copyFile(
      "dist/browser/platform/browser.d.ts",
      "dist/platform/browser.d.ts",
    );
  }

  console.log("Build setup complete!");
}

setupBuilds();
