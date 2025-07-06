// v8-bug.js - Standalone V8 coverage bug reproduction
// This demonstrates the same bug affecting our test suite
// Run with: NODE_V8_COVERAGE=./cov node v8-bug-reproduction.js && npx c8 report --reporter=text

(async () => {
  try {
    await Promise.reject("raw string"); // non-Error
  } catch (e) {
    // Line X  ← the only line in file with instanceof check
    e instanceof Error ? e.message : "UNKNOWN";
  }
})();
