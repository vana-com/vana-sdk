import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach } from "vitest";

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

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// Mock Next.js dynamic imports
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const Component = vi.fn().mockImplementation(() => null);
    (Component as { displayName?: string }).displayName = "DynamicComponent";
    return Component;
  },
}));

// Mock wagmi hooks
vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1234567890123456789012345678901234567890",
    isConnected: false,
  }),
  useWalletClient: () => ({
    data: null,
  }),
  useChainId: () => 14800,
}));

// Mock RainbowKit
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => null,
  getDefaultConfig: () => ({}),
  darkTheme: () => ({}),
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// Mock Web APIs
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: () => "test-uuid",
    subtle: {},
  },
});

// Mock clipboard API - only if it doesn't already exist
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: vi.fn(() => Promise.resolve()),
      readText: vi.fn(() => Promise.resolve("")),
    },
    writable: true,
  });
}
