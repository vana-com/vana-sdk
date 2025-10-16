import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";

// Set up default environment variables for tests
process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL =
  "https://personal-server.example.com";
process.env.NEXT_PUBLIC_RELAYER_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUBGRAPH_URL =
  "http://localhost:8000/subgraphs/name/vana";

// Global test setup to silence console output during tests
// This keeps test output clean while preserving debugging capabilities

let originalConsole: {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
  debug: typeof console.debug;
  info: typeof console.info;
};

beforeEach(() => {
  // Store original console methods
  originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    info: console.info,
  };

  // Mock console methods to silence output during tests
  // Use vi.fn() so they can still be spied on if needed
  console.log = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
  console.debug = vi.fn();
  console.info = vi.fn();
});

afterEach(() => {
  // Restore original console methods after each test
  // This ensures console works normally between test runs
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
});
