import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@/tests/test-utils";
import MyDataPage from "../page";
import {
  createMockUseUserFiles,
  createMockUsePermissions,
  createMockUseTrustedServers,
  createMockUseVana,
  createMockUseAccount,
} from "@/tests/mocks";
import * as useUserFilesHook from "@/hooks/useUserFiles";
import * as usePermissionsHook from "@/hooks/usePermissions";
import * as useTrustedServersHook from "@/hooks/useTrustedServers";

// Mock dependencies using factory functions
vi.mock("wagmi", async () => {
  const actual = await vi.importActual("wagmi");
  return {
    ...actual,
    useAccount: () => createMockUseAccount(),
    useWalletClient: () => ({ data: null }),
    useChainId: () => 14800,
  };
});

vi.mock("@/providers/VanaProvider", () => ({
  useVana: () => createMockUseVana(),
  VanaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock components that might have complex dependencies
vi.mock("@/components/FilePreview", () => ({
  FilePreview: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="file-preview">{children}</div>
  ),
}));

vi.mock("@/components/ui/GrantPermissionModal", () => ({
  GrantPermissionModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="grant-permission-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/DataUploadForm", () => ({
  DataUploadForm: ({
    onUploadComplete,
  }: {
    onUploadComplete: (result: {
      fileId: number;
      transactionHash: string;
    }) => void;
  }) => (
    <div data-testid="data-upload-form">
      <button
        onClick={() => {
          onUploadComplete({ fileId: 123, transactionHash: "0xtx123" });
        }}
      >
        Upload File
      </button>
    </div>
  ),
}));

describe("MyDataPage Integration Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useUserFilesHook, "useUserFiles").mockReturnValue(
      createMockUseUserFiles(),
    );
    vi.spyOn(usePermissionsHook, "usePermissions").mockReturnValue(
      createMockUsePermissions(),
    );
    vi.spyOn(useTrustedServersHook, "useTrustedServers").mockReturnValue(
      createMockUseTrustedServers(),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main page without crashing", async () => {
    render(<MyDataPage />);

    // Check that the page renders without throwing
    // The actual hooks will provide the data
    await waitFor(() => {
      expect(screen.getByText("My Data")).toBeInTheDocument();
    });
  });

  it("renders page structure with tabs", async () => {
    render(<MyDataPage />);

    // Check that tabs are present
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /files/i })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /permissions/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /servers/i })).toBeInTheDocument();
    });
  });

  it("displays page content", async () => {
    render(<MyDataPage />);

    // Just verify the page renders some content
    await waitFor(() => {
      expect(screen.getByText("My Data")).toBeInTheDocument();
    });
  });
});
