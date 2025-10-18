import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { vi } from "vitest";

// Mock wagmi hooks
vi.mock("wagmi", () => ({
  useAccount: vi.fn(() => ({
    address: "0x123" as `0x${string}`,
    isConnected: true,
    chain: { id: 14800 },
  })),
  useWalletClient: vi.fn(() => ({
    data: undefined,
  })),
  useConfig: vi.fn(() => ({})),
  useChainId: vi.fn(() => 14800),
}));

// Mock VanaProvider to provide test values
vi.mock("@/providers/VanaProvider", () => ({
  useVana: vi.fn(() => ({
    vana: null,
    isInitialized: false,
    error: null,
    applicationAddress: "",
  })),
  VanaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { SDKConfigProvider } from "@/providers/SDKConfigProvider";

// Re-export commonly used testing-library utilities
export {
  screen,
  waitFor,
  within,
  fireEvent,
  act,
} from "@testing-library/react";
export { render } from "@testing-library/react";

// Create a test-specific QueryClient with shorter retry times
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface AllTheProvidersProps {
  children: React.ReactNode;
}

// Component that wraps children with all necessary providers
const AllTheProviders = ({ children }: AllTheProvidersProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="test-theme"
      >
        <HeroUIProvider>
          <ToastProvider placement="bottom-right" />
          <SDKConfigProvider>{children}</SDKConfigProvider>
        </HeroUIProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
};

// Custom render function that wraps components with providers
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) => {
  return render(ui, { wrapper: AllTheProviders, ...options });
};
