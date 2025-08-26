import { vi, beforeEach, afterEach } from "vitest";

// Mock viem's functions for testing
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAddress: vi.fn((address: string) => {
      // In tests, just return the address as-is
      // This allows tests to use descriptive addresses like "0xOwnerAddress"
      return address;
    }),
    decodeEventLog: vi.fn(),
    parseEventLogs: vi.fn(),
    getContract: vi.fn(() => ({
      read: {
        schemas: vi.fn(),
        schemaCount: vi.fn(),
      },
      write: {},
    })),
  };
});

// Global test setup to silence console output during tests
// This keeps test output clean while preserving debugging capabilities

// Configure tests to use custom ECIES implementation by default
// This ensures the custom implementation is thoroughly tested
process.env.VANA_USE_CUSTOM_ECIES = "true";

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

// Export utilities for tests that need to check console calls
export const consoleMocks = {
  getLogCalls: () =>
    (console.log as unknown as { mock?: { calls: unknown[] } }).mock?.calls ||
    [],
  getWarnCalls: () =>
    (console.warn as unknown as { mock?: { calls: unknown[] } }).mock?.calls ||
    [],
  getErrorCalls: () =>
    (console.error as unknown as { mock?: { calls: unknown[] } }).mock?.calls ||
    [],
  getDebugCalls: () =>
    (console.debug as unknown as { mock?: { calls: unknown[] } }).mock?.calls ||
    [],
  getInfoCalls: () =>
    (console.info as unknown as { mock?: { calls: unknown[] } }).mock?.calls ||
    [],
};
