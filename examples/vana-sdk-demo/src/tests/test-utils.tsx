import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
          {children}
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
