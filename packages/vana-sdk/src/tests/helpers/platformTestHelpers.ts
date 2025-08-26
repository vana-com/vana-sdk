/**
 * Shared platform testing utilities following TypeScript best practices.
 *
 * These utilities eliminate the need for 'as any' assertions in platform detection tests
 * by providing type-safe mock objects and environment setup helpers.
 *
 * @module platformTestHelpers
 */

/// <reference types="node" />
import { vi } from "vitest";

// Minimal interfaces that match detectPlatform's actual checks
export interface NodeEnvironmentGlobals {
  readonly process: {
    readonly versions: {
      readonly node: string;
    };
  };
}

export interface BrowserEnvironmentGlobals {
  readonly window: Record<string, unknown>;
  readonly document: Record<string, unknown>;
}

// Global state management for tests
interface GlobalTestState {
  window?: unknown;
  document?: unknown;
  process?: unknown;
  crypto?: unknown;
  fetch?: unknown;
  ReadableStream?: unknown;
}

/**
 * Type-safe platform environment manager for tests.
 *
 * This class provides methods to set up different platform environments
 * without using 'as any' assertions, following official TypeScript best practices.
 */
export class PlatformTestHelper {
  private readonly originalState: GlobalTestState = {};

  constructor() {
    this.captureOriginalState();
  }

  /**
   * Configure globals for Node.js environment detection
   *
   * @param nodeVersion - Node.js version string to use
   */
  setupNodeEnvironment(nodeVersion = "16.0.0"): void {
    this.clearBrowserGlobals();
    const nodeGlobals: NodeEnvironmentGlobals = {
      process: {
        versions: {
          node: nodeVersion,
        },
      },
    };
    globalThis.process = nodeGlobals.process as typeof process;
  }

  /**
   * Configure globals for browser environment detection
   */
  setupBrowserEnvironment(): void {
    this.clearNodeGlobals();
    const browserGlobals: BrowserEnvironmentGlobals = {
      window: {},
      document: {},
    };
    globalThis.window = browserGlobals.window as unknown as Window &
      typeof globalThis;
    globalThis.document = browserGlobals.document as unknown as Document;
  }

  /**
   * Configure ambiguous environment (should default to Node)
   */
  setupAmbiguousEnvironment(): void {
    this.clearAllGlobals();
  }

  /**
   * Set up browser environment with crypto support
   *
   * @param cryptoOverrides - Optional crypto properties to override
   */
  setupBrowserWithCrypto(cryptoOverrides?: Partial<Crypto>): void {
    this.setupBrowserEnvironment();
    globalThis.crypto = createMockCrypto(cryptoOverrides);
  }

  /**
   * Set up Node environment with specific process properties
   *
   * @param processOverrides - Optional process properties to override
   */
  setupNodeWithProcess(processOverrides?: Partial<typeof process>): void {
    this.clearBrowserGlobals();
    globalThis.process = createMockProcess(processOverrides);
  }

  /**
   * Restore original global state
   */
  restore(): void {
    this.restoreGlobal("window", globalThis);
    this.restoreGlobal("document", globalThis);
    this.restoreGlobal("process", globalThis);
    this.restoreGlobal("crypto", globalThis);
    this.restoreGlobal("fetch", globalThis);
    this.restoreGlobal("ReadableStream", globalThis);
  }

  private captureOriginalState(): void {
    this.originalState.window = globalThis.window;
    this.originalState.document = globalThis.document;
    this.originalState.process = globalThis.process;
    this.originalState.crypto = globalThis.crypto;
    this.originalState.fetch = globalThis.fetch;
    this.originalState.ReadableStream = globalThis.ReadableStream;
  }

  private restoreGlobal<K extends keyof GlobalTestState>(
    key: K,
    target: typeof globalThis,
  ): void {
    const keyString = key as string;

    if (this.originalState[key] !== undefined) {
      // Check if the property is configurable before trying to set it
      const descriptor = Object.getOwnPropertyDescriptor(target, keyString);

      if (descriptor && !descriptor.configurable) {
        // Skip read-only properties like crypto
        return;
      }

      try {
        (target as Record<string, unknown>)[keyString] =
          this.originalState[key];
      } catch {
        // If setting fails, try using defineProperty for edge cases
        try {
          Object.defineProperty(target, keyString, {
            value: this.originalState[key],
            configurable: true,
            writable: true,
          });
        } catch {
          // If all else fails, skip this property
          return;
        }
      }
    } else {
      Reflect.deleteProperty(target, keyString);
    }
  }

  private clearNodeGlobals(): void {
    Reflect.deleteProperty(globalThis, "process");
  }

  private clearBrowserGlobals(): void {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  }

  private clearAllGlobals(): void {
    this.clearNodeGlobals();
    this.clearBrowserGlobals();
  }
}

/**
 * Creates a type-safe mock crypto object for testing.
 *
 * @param overrides - Properties to override in the base mock crypto implementation
 * @returns A mock Crypto object with stubbed SubtleCrypto methods
 */
export function createMockCrypto(overrides?: Partial<Crypto>): Crypto {
  const mockSubtle: Partial<SubtleCrypto> = {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    generateKey: vi.fn(),
    importKey: vi.fn(),
    exportKey: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
    digest: vi.fn(),
  };

  const baseCrypto: Partial<Crypto> = {
    subtle: mockSubtle as SubtleCrypto,
    getRandomValues: vi
      .fn()
      .mockImplementation(<T extends ArrayBufferView>(array: T): T => {
        // Provide a basic implementation for tests
        const uint8View = new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        );
        for (let i = 0; i < uint8View.length; i++) {
          uint8View[i] = Math.floor(Math.random() * 256);
        }
        return array;
      }),
  };

  return { ...baseCrypto, ...overrides } as Crypto;
}

/**
 * Creates a type-safe mock Node.js process object for testing.
 *
 * @param overrides - Properties to override in the base process mock
 * @returns A mock process object with platform, version, and environment information
 */
export function createMockProcess(
  overrides?: Partial<typeof process>,
): typeof process {
  const baseProcess: Partial<typeof process> = {
    versions: {
      node: "16.0.0",
      v8: "9.0.0",
      uv: "1.0.0",
      zlib: "1.0.0",
      brotli: "1.0.0",
      ares: "1.0.0",
      modules: "93",
      nghttp2: "1.0.0",
      napi: "8",
      llhttp: "1.0.0",
      http_parser: "2.9.4",
      openssl: "1.0.0",
      cldr: "39.0",
      icu: "69.1",
      tz: "2021a",
      unicode: "13.0",
    },
    env: {},
    platform: "linux",
    arch: "x64",
    pid: 12345,
    ppid: 12344,
  };

  return { ...baseProcess, ...overrides } as typeof process;
}

/**
 * Creates a type-safe mock Window object for browser testing.
 *
 * @param overrides - Properties to override in the base window mock
 * @returns A mock window object with document, location, and navigator properties
 */
export function createMockWindow(
  overrides?: Partial<Window>,
): Window & typeof globalThis {
  const baseWindow: Partial<Window> = {
    document: {} as Document,
    location: {
      href: "https://example.com",
      origin: "https://example.com",
    } as Location,
    navigator: {
      userAgent: "Mozilla/5.0 (Test Browser)",
    } as Navigator,
  };

  return { ...baseWindow, ...overrides } as Window & typeof globalThis;
}

/**
 * Creates a type-safe mock Document object for browser testing.
 *
 * @param overrides - Properties to override in the base document mock
 * @returns A mock document object with DOM manipulation methods
 */
export function createMockDocument(overrides?: Partial<Document>): Document {
  const baseDocument: Partial<Document> = {
    createElement: vi.fn(
      (tagName: string) =>
        ({
          tagName: tagName.toUpperCase(),
        }) as HTMLElement,
    ),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(),
  };

  return { ...baseDocument, ...overrides } as Document;
}

/**
 * Utility for creating properly typed fetch mocks
 */
export function createMockFetch() {
  return vi.fn() as unknown as typeof fetch;
}

/**
 * Utility for stubbing globals with proper typing using Vitest
 */
export class VitestGlobalStubber {
  private stubs = new Map<string, unknown>();

  stubGlobal<T>(name: string, value: T): void {
    this.stubs.set(name, value);
    vi.stubGlobal(name, value);
  }

  restoreAllGlobals(): void {
    // Clear all stubs at once
    vi.unstubAllGlobals();
    this.stubs.clear();
  }
}
