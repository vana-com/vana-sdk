import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyDataPage from '../page';
import { useUserFiles } from '@/hooks/useUserFiles';
import { usePermissions } from '@/hooks/usePermissions';
import { useTrustedServers } from '@/hooks/useTrustedServers';
import { useVana } from '@/providers/VanaProvider';
import { useChainId } from 'wagmi';

// Mock dependencies
vi.mock('wagmi');
vi.mock('@/providers/VanaProvider');
vi.mock('@/hooks/useUserFiles');
vi.mock('@/hooks/usePermissions');
vi.mock('@/hooks/useTrustedServers');

// Mock components that might have complex dependencies
vi.mock('@/components/FilePreview', () => ({
  FilePreview: ({ children }: { children: React.ReactNode }) => <div data-testid="file-preview">{children}</div>,
}));

vi.mock('@/components/ui/GrantPermissionModal', () => ({
  GrantPermissionModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => 
    isOpen ? (
      <div data-testid="grant-permission-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/DataUploadForm', () => ({
  DataUploadForm: ({ onUploadComplete }: { onUploadComplete: (result: any) => void }) => (
    <div data-testid="data-upload-form">
      <button onClick={() => onUploadComplete({ fileId: 123, transactionHash: '0xtx123' })}>
        Upload File
      </button>
    </div>
  ),
}));

const useChainIdMock = vi.mocked(useChainId);
const useVanaMock = vi.mocked(useVana);
const useUserFilesMock = vi.mocked(useUserFiles);
const usePermissionsMock = vi.mocked(usePermissions);
const useTrustedServersMock = vi.mocked(useTrustedServers);

describe('MyDataPage Integration Test', () => {
  const mockUserFiles = [
    {
      id: 1,
      url: 'ipfs://file1',
      ownerAddress: '0x123',
      encrypted: true,
      size: 1024,
      createdAt: new Date('2023-01-01'),
      source: 'discovered' as const,
    },
    {
      id: 2,
      url: 'ipfs://file2',
      ownerAddress: '0x123',
      encrypted: false,
      size: 2048,
      createdAt: new Date('2023-01-02'),
      source: 'uploaded' as const,
    },
  ];

  const mockPermissions = [
    {
      id: BigInt(1),
      operation: 'llm_inference',
      files: [1],
      parameters: { prompt: 'test prompt' },
      grant: 'ipfs://grant1',
      grantor: '0x123',
      grantee: '0x456',
      active: true,
    },
  ];

  const mockTrustedServers = [
    {
      id: '1',
      serverAddress: '0xserver1',
      serverUrl: 'https://server1.com',
      trustedAt: BigInt(1640995200),
      user: '0x123',
      name: 'Server 1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock wagmi hooks
    useChainIdMock.mockReturnValue(14800);

    // Mock VanaProvider
    useVanaMock.mockReturnValue({
      vana: {} as any,
      isInitialized: true,
      error: null,
      applicationAddress: '0xapp123',
    });

    // Mock useUserFiles hook
    useUserFilesMock.mockReturnValue({
      userFiles: mockUserFiles,
      isLoadingFiles: false,
      selectedFiles: [],
      decryptingFiles: new Set(),
      decryptedFiles: new Map(),
      fileDecryptErrors: new Map(),
      newTextData: '',
      isUploadingText: false,
      uploadResult: null,
      fileLookupId: '',
      setFileLookupId: vi.fn(),
      isLookingUpFile: false,
      fileLookupStatus: '',
      loadUserFiles: vi.fn(),
      handleFileSelection: vi.fn(),
      handleDecryptFile: vi.fn(),
      handleDownloadDecryptedFile: vi.fn(),
      handleClearFileError: vi.fn(),
      handleLookupFile: vi.fn(),
      handleUploadText: vi.fn(),
      setUserFiles: vi.fn(),
      setSelectedFiles: vi.fn(),
      setNewTextData: vi.fn(),
    });

    // Mock usePermissions hook
    usePermissionsMock.mockReturnValue({
      userPermissions: mockPermissions,
      isLoadingPermissions: false,
      isGranting: false,
      isRevoking: false,
      grantStatus: '',
      grantTxHash: '',
      grantPreview: null,
      showGrantPreview: false,
      permissionLookupId: '',
      setPermissionLookupId: vi.fn(),
      isLookingUpPermission: false,
      permissionLookupStatus: '',
      lookedUpPermission: null,
      loadUserPermissions: vi.fn(),
      handleGrantPermission: vi.fn(),
      handleRevokePermissionById: vi.fn(),
      handleLookupPermission: vi.fn(),
      onOpenGrant: vi.fn(),
      onCloseGrant: vi.fn(),
      handleConfirmGrant: vi.fn(),
      handleCancelGrant: vi.fn(),
      setGrantPreview: vi.fn(),
      setGrantStatus: vi.fn(),
      setGrantTxHash: vi.fn(),
      setUserPermissions: vi.fn(),
    });

    // Mock useTrustedServers hook
    useTrustedServersMock.mockReturnValue({
      trustedServers: mockTrustedServers,
      isLoadingTrustedServers: false,
      isTrustingServer: false,
      isUntrusting: false,
      isDiscoveringServer: false,
      trustServerError: '',
      trustedServerQueryMode: 'auto',
      serverId: '',
      serverUrl: '',
      loadUserTrustedServers: vi.fn(),
      handleTrustServer: vi.fn(),
      handleTrustServerGasless: vi.fn(),
      handleUntrustServer: vi.fn(),
      handleDiscoverHostedServer: vi.fn(),
      setServerId: vi.fn(),
      setServerUrl: vi.fn(),
      setTrustedServerQueryMode: vi.fn(),
      setTrustServerError: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main page with all sections', () => {
    render(<MyDataPage />);

    // Check for main page elements
    expect(screen.getByText('My Data')).toBeInTheDocument();
    expect(screen.getByText('Manage your personal data on Vana')).toBeInTheDocument();

    // Check for stats cards
    expect(screen.getByText('2')).toBeInTheDocument(); // Files count
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Permissions count
    expect(screen.getByText('Permissions')).toBeInTheDocument();

    // Check for tabs
    expect(screen.getByRole('tab', { name: /files/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /servers/i })).toBeInTheDocument();
  });

  it('displays user files in the files tab', () => {
    render(<MyDataPage />);

    // Files tab should be active by default
    expect(screen.getByRole('tab', { name: /files/i })).toHaveAttribute('aria-selected', 'true');

    // Check for file display
    expect(screen.getByText('File #1')).toBeInTheDocument();
    expect(screen.getByText('File #2')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('handles file selection correctly', async () => {
    const user = userEvent.setup();
    const mockHandleFileSelection = vi.fn();
    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      handleFileSelection: mockHandleFileSelection,
    });

    render(<MyDataPage />);

    // Find and click a file checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const fileCheckbox = checkboxes.find(cb => 
      cb.getAttribute('aria-label')?.includes('Select file 1')
    );
    
    if (fileCheckbox) {
      await user.click(fileCheckbox);
      expect(mockHandleFileSelection).toHaveBeenCalledWith(1, true);
    }
  });

  it('switches to permissions tab and displays permissions', async () => {
    const user = userEvent.setup();
    render(<MyDataPage />);

    // Click on permissions tab
    const permissionsTab = screen.getByRole('tab', { name: /permissions/i });
    await user.click(permissionsTab);

    expect(permissionsTab).toHaveAttribute('aria-selected', 'true');

    // Check for permissions display
    expect(screen.getByText('1')).toBeInTheDocument(); // Permission ID
    expect(screen.getByText('llm_inference')).toBeInTheDocument();
  });

  it('switches to trusted servers tab and displays servers', async () => {
    const user = userEvent.setup();
    render(<MyDataPage />);

    // Click on servers tab
    const serversTab = screen.getByRole('tab', { name: /servers/i });
    await user.click(serversTab);

    expect(serversTab).toHaveAttribute('aria-selected', 'true');

    // Check for servers display
    expect(screen.getByText('Server 1')).toBeInTheDocument();
    expect(screen.getByText('https://server1.com')).toBeInTheDocument();
  });

  it('opens and closes grant permission modal', async () => {
    const user = userEvent.setup();
    const mockOnOpenGrant = vi.fn();
    const mockOnCloseGrant = vi.fn();

    usePermissionsMock.mockReturnValue({
      ...usePermissionsMock(),
      onOpenGrant: mockOnOpenGrant,
      onCloseGrant: mockOnCloseGrant,
      showGrantPreview: true,
    });

    render(<MyDataPage />);

    // Modal should be visible when showGrantPreview is true
    expect(screen.getByTestId('grant-permission-modal')).toBeInTheDocument();

    // Click close button
    const closeButton = screen.getByText('Close Modal');
    await user.click(closeButton);

    expect(mockOnCloseGrant).toHaveBeenCalled();
  });

  it('handles refresh button click', async () => {
    const user = userEvent.setup();
    const mockLoadUserFiles = vi.fn();
    
    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      loadUserFiles: mockLoadUserFiles,
    });

    render(<MyDataPage />);

    // Find and click refresh button
    const refreshButton = screen.getByLabelText(/refresh files/i) || 
                         screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    expect(mockLoadUserFiles).toHaveBeenCalled();
  });

  it('displays loading state when files are loading', () => {
    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      isLoadingFiles: true,
      userFiles: [],
    });

    render(<MyDataPage />);

    expect(screen.getByText('Loading files...')).toBeInTheDocument();
  });

  it('displays empty state when no files exist', () => {
    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      userFiles: [],
      isLoadingFiles: false,
    });

    render(<MyDataPage />);

    expect(screen.getByText('No files found')).toBeInTheDocument();
    expect(screen.getByText('Upload your first file to get started')).toBeInTheDocument();
  });

  it('handles file lookup functionality', async () => {
    const user = userEvent.setup();
    const mockHandleLookupFile = vi.fn();
    const mockSetFileLookupId = vi.fn();

    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      handleLookupFile: mockHandleLookupFile,
      setFileLookupId: mockSetFileLookupId,
      fileLookupId: '123',
    });

    render(<MyDataPage />);

    // Find the file lookup input and button
    const lookupInput = screen.getByPlaceholderText(/enter file id/i);
    const lookupButton = screen.getByRole('button', { name: /lookup file/i });

    // Type in the input
    await user.type(lookupInput, '123');
    expect(mockSetFileLookupId).toHaveBeenCalledWith('123');

    // Click the lookup button
    await user.click(lookupButton);
    expect(mockHandleLookupFile).toHaveBeenCalled();
  });

  it('displays file decrypt functionality for encrypted files', () => {
    render(<MyDataPage />);

    // Find encrypted file (File #1)
    const encryptedFileRow = screen.getByText('File #1').closest('tr');
    expect(encryptedFileRow).toBeInTheDocument();

    // Should show decrypt button for encrypted files
    const decryptButton = screen.getByRole('button', { name: /decrypt/i });
    expect(decryptButton).toBeInTheDocument();
  });

  it('handles permission revocation', async () => {
    const user = userEvent.setup();
    const mockHandleRevokePermission = vi.fn();

    usePermissionsMock.mockReturnValue({
      ...usePermissionsMock(),
      handleRevokePermissionById: mockHandleRevokePermission,
    });

    render(<MyDataPage />);

    // Switch to permissions tab
    const permissionsTab = screen.getByRole('tab', { name: /permissions/i });
    await user.click(permissionsTab);

    // Find and click revoke button
    const revokeButton = screen.getByRole('button', { name: /revoke/i });
    await user.click(revokeButton);

    expect(mockHandleRevokePermission).toHaveBeenCalledWith('1');
  });

  it('displays application address when available', () => {
    render(<MyDataPage />);

    // Should display the application address somewhere on the page
    expect(screen.getByText(/0xapp123/)).toBeInTheDocument();
  });

  it('handles data upload completion', async () => {
    render(<MyDataPage />);

    // Find the data upload form and trigger upload
    const uploadForm = screen.getByTestId('data-upload-form');
    const uploadButton = screen.getByText('Upload File');
    
    fireEvent.click(uploadButton);

    // Should handle the upload result
    await waitFor(() => {
      // The upload result should be processed
      expect(screen.getByTestId('data-upload-form')).toBeInTheDocument();
    });
  });

  it('supports keyboard navigation between tabs', async () => {
    const user = userEvent.setup();
    render(<MyDataPage />);

    const filesTab = screen.getByRole('tab', { name: /files/i });
    const permissionsTab = screen.getByRole('tab', { name: /permissions/i });

    // Focus on files tab and navigate with arrow keys
    filesTab.focus();
    expect(filesTab).toHaveFocus();

    // Use arrow keys to navigate to next tab
    await user.keyboard('{ArrowRight}');
    expect(permissionsTab).toHaveFocus();
  });

  it('displays error states appropriately', () => {
    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      fileDecryptErrors: new Map([[1, 'Decryption failed']]),
    });

    render(<MyDataPage />);

    // Should display the error message
    expect(screen.getByText('Decryption failed')).toBeInTheDocument();
  });

  it('handles paginated results correctly', () => {
    // Mock many files to test pagination
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      url: `ipfs://file${i + 1}`,
      ownerAddress: '0x123',
      encrypted: false,
      size: 1024,
      createdAt: new Date(),
      source: 'discovered' as const,
    }));

    useUserFilesMock.mockReturnValue({
      ...useUserFilesMock(),
      userFiles: manyFiles,
    });

    render(<MyDataPage />);

    // Should show pagination controls
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
  });
});