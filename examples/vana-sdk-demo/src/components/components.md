# Component Extraction Plan for demo-page.tsx

## Overview

This document serves as the comprehensive roadmap for the systematic refactoring of `demo-page.tsx`. The primary goal is to transform the monolithic "God Component" into a clean **Layout Controller** that manages state and composes declarative, reusable UI components. This will dramatically improve code maintainability, readability, and reusability.

## End State

When this plan is complete, the `Home.tsx` component's JSX will consist almost entirely of the high-level page layout and the "Feature Card" components listed below. All state and logic will remain in `Home.tsx`, but all presentational concerns will be encapsulated within these new components.

## Progress Tracker

### ✅ Completed Components

- **NavigationButton** - Standardized sidebar navigation links.
- **SectionHeader** - Standardized headers for all `Card` sections.
- **SectionDivider** - Standardized separators between major content sections.
- **StatusMessage** - Unified display for success, error, and informational messages.
- **ActionButton** - Unified button with loading states, spinners, and icons (5 instances replaced)
- **InfoBox** - Informational content with icon, title, and bullet points (2 instances replaced)

### 📋 Pending Components

The extraction is organized into three main categories, from the smallest atoms to the largest self-contained features.

### Category 1: UI Primitives & Atoms (Highest Priority)

These are small, highly reusable components that form the building blocks of the UI.

1.  **`ActionButton`**: A `Button` wrapper that handles loading states, spinners, and icons consistently.
    - **Props**: `{ isLoading, icon, children, ...buttonProps }`
    - **Impact**: Very High. Standardizes ~20 action buttons.
2.  **`InfoBox`**: A container for displaying informational text, often with an icon and a list of points.
    - **Props**: `{ icon, title, items: React.ReactNode[], variant: 'info' | 'warning' }`
    - **Impact**: High. Replaces ~5 complex info/warning blocks.
3.  **`ExplorerLink`**: Displays a consistently styled and correctly formatted link to a block explorer.
    - **Props**: `{ type: 'address' | 'tx', hash: string, chainId: number, ...linkProps }`
    - **Impact**: High. Cleans up `getAddressUrl`/`getTxUrl` logic from JSX.
4.  **`CodeDisplay`**: A pre-formatted block for showing code, JSON, or other technical output with copy functionality.
    - **Props**: `{ code: string, language?: string, maxHeight?: string, showCopy?: boolean }`
    - **Impact**: Medium. Standardizes ~10 code preview sections.
5.  **`IdChip`**: A `Chip` for consistently displaying on-chain identifiers.
    - **Props**: `{ label: string, id: string | number }`
    - **Impact**: Medium. Unifies the look of file IDs, schema IDs, etc.
6.  **`EmptyState`**: A placeholder for when a list or data set is empty.
    - **Props**: `{ icon, title, description, action?: React.ReactNode }`
    - **Impact**: Medium. Improves UX for all lists.
7.  **`InputModeToggle`**: A button group for switching between "Text" and "File" input modes.
    - **Props**: `{ mode: 'text' | 'file', onModeChange: (mode) => void, disabled?: boolean }`
    - **Impact**: Medium. Replaces 2 instances of this logic.

### Category 2: Specialized List & Item Components (Medium Priority)

These components render a specific type of item within a list, encapsulating the item's unique structure.

8.  **`PermissionListItem`**: Renders a single permission, including its ID, files, parameters, and a "Revoke" button.
    - **Props**: `{ permission: GrantedPermission, onRevoke: (id) => void, isRevoking: boolean }`
9.  **`TrustedServerListItem`**: Renders a single trusted server's address with an "Untrust" button.
    - **Props**: `{ serverId: string, onUntrust: (id) => void, isUntrusting: boolean, chainId: number }`
10. **`SchemaListItem`**: Renders the details of a single schema.
    - **Props**: `{ schema: Schema }`
11. **`RefinerListItem`**: Renders the details of a single refiner.
    - **Props**: `{ refiner: Refiner }`
12. **`ContractListItem`**: Renders a contract's name and address with a link to the explorer.
    - **Props**: `{ contractName: string, contractAddress: string, chainId: number }`

### Category 3: Self-Contained "Feature Card" Components (The Final Goal)

These are large components that encapsulate an entire `Card`, representing a major feature or workflow. They will receive many props but will drastically simplify the `Home.tsx` JSX.

13. **`EncryptionTestCard`**: Encapsulates the entire "Canonical Encryption Testing" workflow.
    - **Impact**: **Massive**. Will remove over 250 lines of JSX.
14. **`SchemaManagementCard`**: Contains the forms for creating schemas/refiners and their respective lists.
    - **Impact**: **Massive**. Will remove over 200 lines of JSX.
15. **`TrustedServerManagementCard`**: Contains the form for trusting a server and the list of trusted servers.
    - **Impact**: **Massive**. Will remove ~150 lines of JSX.
16. **`ServerUploadCard`**: Encapsulates the workflow for uploading a file to a trusted server.
17. **`YourDataCard`**: Contains the list of user files, file lookup, and permission granting UI.
18. **`TrustedServerIntegrationCard`**: Contains the server-side decryption demo and API integration examples.
19. **`ContractsCard`**: Displays the list of canonical contracts.
20. **`SDKConfigurationSidebar`**: The entire right sidebar for configuring the SDK.

### Category 4: Modal Content Components

These components encapsulate the complex content inside modals.

21. **`GrantPreviewModalContent`**: Renders the body of the grant preview modal.
    - **Props**: `{ grantPreview: GrantPreview, onConfirm: () => void, onCancel: () => void }`

## Extraction Guidelines

- **Purity**: Components must be purely presentational (stateless).
- **Typing**: All components must have a strictly typed `Props` interface.
- **State**: All state and event handlers are passed down from `Home.tsx`.

## Metrics

- **Original Lines**: ~3,842
- **Target Lines**: < 1,000 (~75% reduction)
- **Total Components**: 21
- **Completed**: 4 / 21 (19%)
