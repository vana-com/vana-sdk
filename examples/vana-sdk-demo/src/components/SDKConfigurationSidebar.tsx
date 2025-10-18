import React from "react";
import {
  Input,
  Select,
  SelectItem,
  Switch,
  Button,
  Tooltip,
} from "@heroui/react";
import { Info } from "lucide-react";
import { useSDKConfig } from "@/providers/SDKConfigProvider";

/**
 * SDKConfigurationSidebar component - Right sidebar for configuring the SDK
 * Network, storage, and other configuration options
 *
 * Now consumes SDKConfigContext directly instead of receiving props.
 */
export const SDKConfigurationSidebar: React.FC = () => {
  const {
    sdkConfig,
    appConfig,
    updateSdkConfig,
    updateAppConfig,
    handleGoogleDriveAuth,
    handleGoogleDriveDisconnect,
    handleDropboxAuth,
    handleDropboxDisconnect,
  } = useSDKConfig();
  return (
    <div className="w-80 border-l border-divider bg-content1 sticky top-0 self-start max-h-screen overflow-y-auto">
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">SDK Configuration</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-6">
            {/* Read-Only Mode Configuration */}
            <div className="space-y-4 pb-4 border-b border-divider">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                  Read-Only Mode
                </h4>
                <Tooltip
                  content={
                    <div className="p-2">
                      <div className="font-medium mb-1 text-xs">In code:</div>
                      <code className="text-xs">
                        {`const vana = Vana({ address: '0x...' })`}
                      </code>
                    </div>
                  }
                  placement="right"
                >
                  <Info className="h-3.5 w-3.5 text-default-400 cursor-help" />
                </Tooltip>
              </div>

              <Input
                label="Address Override"
                placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1"
                value={sdkConfig.readOnlyAddress || ""}
                onValueChange={(value) => {
                  updateSdkConfig({ readOnlyAddress: value });
                }}
                description="Explore any address without connecting a wallet"
                size="sm"
                classNames={{
                  input: "font-mono text-xs",
                }}
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => {
                    if (sdkConfig.readOnlyAddress?.trim()) {
                      updateAppConfig({ enableReadOnlyMode: true });
                    }
                  }}
                  isDisabled={!sdkConfig.readOnlyAddress?.trim()}
                  className="flex-1"
                >
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    updateSdkConfig({ readOnlyAddress: "" });
                    updateAppConfig({ enableReadOnlyMode: false });
                  }}
                  isDisabled={
                    !sdkConfig.readOnlyAddress && !appConfig.enableReadOnlyMode
                  }
                >
                  Clear
                </Button>
              </div>

              {appConfig.enableReadOnlyMode && sdkConfig.readOnlyAddress && (
                <div className="text-xs text-primary bg-primary/10 p-2 rounded">
                  <div className="font-medium mb-1">
                    📖 Read-only mode active
                  </div>
                  <div className="text-default-600">
                    Exploring {sdkConfig.readOnlyAddress.slice(0, 6)}...
                    {sdkConfig.readOnlyAddress.slice(-4)}
                  </div>
                </div>
              )}
            </div>

            {/* Network Configuration */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                Network Configuration
              </h4>

              <Input
                label="Relayer URL"
                placeholder="https://relayer.example.com"
                value={sdkConfig.relayerUrl}
                onValueChange={(value) => {
                  updateSdkConfig({ relayerUrl: value });
                }}
                description="URL for gasless transaction relayer"
                size="sm"
              />

              <Input
                label="Subgraph URL"
                placeholder="https://moksha.vanagraph.io/v7"
                value={sdkConfig.subgraphUrl}
                onValueChange={(value) => {
                  updateSdkConfig({ subgraphUrl: value });
                }}
                description="Custom subgraph endpoint (optional)"
                size="sm"
              />

              <Input
                label="RPC URL"
                placeholder="https://rpc.example.com"
                value={sdkConfig.rpcUrl}
                onValueChange={(value) => {
                  updateSdkConfig({ rpcUrl: value });
                }}
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
                onValueChange={(value) => {
                  updateSdkConfig({ pinataJwt: value });
                }}
                description="JWT for user-managed Pinata IPFS"
                size="sm"
                type="password"
              />

              <Input
                label="Pinata Gateway"
                placeholder="https://gateway.pinata.cloud"
                value={sdkConfig.pinataGateway}
                onValueChange={(value) => {
                  updateSdkConfig({ pinataGateway: value });
                }}
                description="Gateway URL for Pinata IPFS"
                size="sm"
              />

              {/* Google Drive Configuration */}
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  Google Drive Integration
                </div>
                {sdkConfig.googleDriveAccessToken ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-green-600">✅ Connected</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        onPress={handleGoogleDriveDisconnect}
                      >
                        Disconnect
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Token expires:{" "}
                      {sdkConfig.googleDriveExpiresAt
                        ? new Date(
                            sdkConfig.googleDriveExpiresAt,
                          ).toLocaleString()
                        : "Unknown"}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-500">Not connected</div>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={handleGoogleDriveAuth}
                      className="w-full"
                    >
                      Connect Google Drive
                    </Button>
                    <div className="text-xs text-gray-500">
                      Requires OAuth authentication
                    </div>
                  </div>
                )}
              </div>

              {/* Dropbox Configuration */}
              <div className="space-y-3">
                <div className="text-sm font-medium">Dropbox Integration</div>
                {sdkConfig.dropboxAccessToken ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-green-600">✅ Connected</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        onPress={handleDropboxDisconnect}
                      >
                        Disconnect
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Token expires:{" "}
                      {sdkConfig.dropboxExpiresAt
                        ? new Date(sdkConfig.dropboxExpiresAt).toLocaleString()
                        : "Unknown"}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-500">Not connected</div>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={handleDropboxAuth}
                      className="w-full"
                    >
                      Connect Dropbox
                    </Button>
                    <div className="text-xs text-gray-500">
                      Requires OAuth authentication
                    </div>
                  </div>
                )}
              </div>

              <Select
                label="Default Storage Provider"
                selectedKeys={[sdkConfig.defaultStorageProvider]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  updateSdkConfig({ defaultStorageProvider: selected });
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
                  isDisabled={!sdkConfig.googleDriveAccessToken}
                  description={
                    !sdkConfig.googleDriveAccessToken
                      ? "Requires Google Drive authentication"
                      : undefined
                  }
                >
                  Google Drive
                </SelectItem>
                <SelectItem
                  key="dropbox"
                  isDisabled={!sdkConfig.dropboxAccessToken}
                  description={
                    !sdkConfig.dropboxAccessToken
                      ? "Requires Dropbox authentication"
                      : undefined
                  }
                >
                  Dropbox
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
                  onValueChange={(value) => {
                    updateAppConfig({ useGaslessTransactions: value });
                  }}
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
