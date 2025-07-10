import React from "react";
import { Input, Select, SelectItem, Switch } from "@heroui/react";

interface SDKConfig {
  relayerUrl: string;
  subgraphUrl: string;
  rpcUrl: string;
  pinataJwt: string;
  pinataGateway: string;
  defaultStorageProvider: string;
}

export interface AppConfig {
  useGaslessTransactions: boolean;
}

interface SDKConfigurationSidebarProps {
  sdkConfig: SDKConfig;
  onConfigChange: (config: Partial<SDKConfig>) => void;
  appConfig: AppConfig;
  onAppConfigChange: (config: Partial<AppConfig>) => void;
}

/**
 * SDKConfigurationSidebar component - Right sidebar for configuring the SDK
 * Network, storage, and other configuration options
 */
export const SDKConfigurationSidebar: React.FC<
  SDKConfigurationSidebarProps
> = ({ sdkConfig, onConfigChange, appConfig, onAppConfigChange }) => {
  return (
    <div className="w-80 border-l border-divider bg-content1 sticky top-0 self-start max-h-screen overflow-y-auto">
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">SDK Configuration</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-6">
            {/* Network Configuration */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                Network Configuration
              </h4>

              <Input
                label="Relayer URL"
                placeholder="https://relayer.example.com"
                value={sdkConfig.relayerUrl}
                onValueChange={(value) => onConfigChange({ relayerUrl: value })}
                description="URL for gasless transaction relayer"
                size="sm"
              />

              <Input
                label="Subgraph URL"
                placeholder="https://api.goldsky.com/..."
                value={sdkConfig.subgraphUrl}
                onValueChange={(value) =>
                  onConfigChange({ subgraphUrl: value })
                }
                description="Custom subgraph endpoint (optional)"
                size="sm"
              />

              <Input
                label="RPC URL"
                placeholder="https://rpc.example.com"
                value={sdkConfig.rpcUrl}
                onValueChange={(value) => onConfigChange({ rpcUrl: value })}
                description="Custom RPC endpoint (optional)"
                size="sm"
              />
            </div>

            {/* Storage Configuration */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                Storage Configuration
              </h4>

              <Input
                label="Pinata JWT"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={sdkConfig.pinataJwt}
                onValueChange={(value) => onConfigChange({ pinataJwt: value })}
                description="JWT for user-managed Pinata IPFS"
                size="sm"
                type="password"
              />

              <Input
                label="Pinata Gateway"
                placeholder="https://gateway.pinata.cloud"
                value={sdkConfig.pinataGateway}
                onValueChange={(value) =>
                  onConfigChange({ pinataGateway: value })
                }
                description="Gateway URL for Pinata IPFS"
                size="sm"
              />

              <Select
                label="Default Storage Provider"
                selectedKeys={[sdkConfig.defaultStorageProvider]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  onConfigChange({ defaultStorageProvider: selected });
                }}
                size="sm"
              >
                <SelectItem key="app-ipfs">App-managed IPFS</SelectItem>
                <SelectItem
                  key="user-ipfs"
                  isDisabled={!sdkConfig.pinataJwt}
                  description={
                    !sdkConfig.pinataJwt
                      ? "Requires Pinata JWT configuration"
                      : undefined
                  }
                >
                  User-managed Pinata
                </SelectItem>
                <SelectItem
                  key="google-drive"
                  isDisabled={true}
                  description="Coming soon - Google Drive integration"
                >
                  Google Drive (Soon)
                </SelectItem>
              </Select>
            </div>

            {/* App Configuration */}
            <div className="space-y-4 pt-4 border-t border-divider">
              <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                App Configuration
              </h4>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium">
                    Gasless Transactions
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Use signature-based transactions instead of gas
                  </p>
                </div>
                <Switch
                  isSelected={appConfig.useGaslessTransactions}
                  onValueChange={(value) =>
                    onAppConfigChange({ useGaslessTransactions: value })
                  }
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
