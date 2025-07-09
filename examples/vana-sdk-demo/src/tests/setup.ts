import "@testing-library/jest-dom";
import { vi } from "vitest";

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
    const Component = vi.fn().mockImplementation(() => null) as any;
    Component.displayName = "DynamicComponent";
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

// Mock clipboard API
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve("")),
  },
});
