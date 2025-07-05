import { vi, beforeEach, afterEach } from 'vitest'

// Global test setup to silence console output during tests
// This keeps test output clean while preserving debugging capabilities

let originalConsole: {
  log: typeof console.log
  warn: typeof console.warn
  error: typeof console.error
  debug: typeof console.debug
}

beforeEach(() => {
  // Store original console methods
  originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  // Mock console methods to silence output during tests
  // Use vi.fn() so they can still be spied on if needed
  console.log = vi.fn()
  console.warn = vi.fn()
  console.error = vi.fn()
  console.debug = vi.fn()
})

afterEach(() => {
  // Restore original console methods after each test
  // This ensures console works normally between test runs
  console.log = originalConsole.log
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  console.debug = originalConsole.debug
})

// Export utilities for tests that need to check console calls
export const consoleMocks = {
  getLogCalls: () => (console.log as any).mock?.calls || [],
  getWarnCalls: () => (console.warn as any).mock?.calls || [],
  getErrorCalls: () => (console.error as any).mock?.calls || [],
  getDebugCalls: () => (console.debug as any).mock?.calls || []
}

// Utility to temporarily enable console output in specific tests
export const withConsole = (fn: () => void | Promise<void>) => {
  return async () => {
    // Restore console for this test
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    console.debug = originalConsole.debug
    
    try {
      await fn()
    } finally {
      // Re-mock console after test
      console.log = vi.fn()
      console.warn = vi.fn()
      console.error = vi.fn()
      console.debug = vi.fn()
    }
  }
}