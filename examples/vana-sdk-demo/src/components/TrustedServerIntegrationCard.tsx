import React from "react";
import { Input, Button } from "@heroui/react";
import { Brain, Key, Lock, RotateCcw, Copy, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SectionHeader } from "./ui/SectionHeader";
import { ActionButton } from "./ui/ActionButton";
import { StatusMessage } from "./ui/StatusMessage";
import { CodeDisplay } from "./ui/CodeDisplay";
import { InfoBox } from "./ui/InfoBox";
import { AddressDisplay } from "./ui/AddressDisplay";

interface TrustedServerIntegrationCardProps {
  // Server decryption demo
  serverFileId: string;
  onServerFileIdChange: (id: string) => void;
  serverPrivateKey: string;
  onServerPrivateKeyChange: (key: string) => void;
  derivedServerAddress: string;
  onServerDecryption: () => void;
  isServerDecrypting: boolean;
  serverDecryptError: string;
  serverDecryptedData: string;

  // Server API integration
  personalPermissionId: string;
  onPersonalPermissionIdChange: (id: string) => void;
  onPersonalServerCall: () => void;
  isPersonalLoading: boolean;
  onPollStatus: () => void;
  isPolling: boolean;
  personalError: string;
  personalResult: unknown;

  // Execution context
  lastUsedPermissionId: string;
  lastUsedPrompt: string;

  // Utility functions
  onCopyToClipboard: (text: string, label: string) => Promise<void>;
}

/**
 * TrustedServerIntegrationCard component - Server-side decryption demo and API integration
 * Demonstrates grantPermission(), trusted server API workflow
 */
export const TrustedServerIntegrationCard: React.FC<
  TrustedServerIntegrationCardProps
> = ({
  serverFileId,
  onServerFileIdChange,
  serverPrivateKey,
  onServerPrivateKeyChange,
  derivedServerAddress,
  onServerDecryption,
  isServerDecrypting,
  serverDecryptError,
  serverDecryptedData,
  personalPermissionId,
  onPersonalPermissionIdChange,
  onPersonalServerCall,
  isPersonalLoading,
  onPollStatus,
  isPolling,
  personalError,
  personalResult,
  lastUsedPermissionId,
  lastUsedPrompt,
  onCopyToClipboard,
}) => {
  return (
    <section id="personal-server">
      <SectionHeader
        icon={<Brain className="h-5 w-5" />}
        title="Trusted Server Integration"
        description={
          <>
            <em>
              Demonstrates: `grantPermission()`, trusted server API workflow
            </em>
            <br />
            Advanced pattern showing server-side logic for processing files with
            granted permissions.
          </>
        }
      />
      <div className="mt-6 space-y-6">
        {/* Server Decryption Demo */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            <span className="font-medium">Server Decryption Demo</span>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="File ID"
                value={serverFileId}
                onChange={(e) => onServerFileIdChange(e.target.value)}
                placeholder="Enter file ID (e.g., 123)"
                type="number"
                description="The ID of the encrypted file to decrypt on the server"
              />
              <Input
                label="Server Private Key"
                value={serverPrivateKey}
                onChange={(e) => onServerPrivateKeyChange(e.target.value)}
                placeholder="Enter server private key (hex)"
                type="password"
                description="Hexadecimal private key for server-side decryption"
              />
            </div>

            {/* Display derived server address when private key is provided */}
            {derivedServerAddress && (
              <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-success-800">
                    Derived Server Address:
                  </p>
                  <AddressDisplay
                    address={derivedServerAddress}
                    showCopy={true}
                    showExternalLink={true}
                    truncate={false}
                  />
                  <p className="text-xs text-success-600">
                    This is the server's address derived from the private key
                    above.
                  </p>
                </div>
              </div>
            )}

            <ActionButton
              onPress={onServerDecryption}
              disabled={!serverFileId.trim() || !serverPrivateKey.trim()}
              loading={isServerDecrypting}
              icon={<Lock className="h-4 w-4" />}
              className="w-full"
            >
              Decrypt File with Server Key
            </ActionButton>

            {serverDecryptError && (
              <StatusMessage
                status={serverDecryptError}
                type="error"
                className="p-4"
              />
            )}

            {serverDecryptedData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Decrypted File Content:</h4>
                  <Button
                    size="sm"
                    variant="bordered"
                    onPress={() =>
                      onCopyToClipboard(
                        serverDecryptedData,
                        "Decrypted content",
                      )
                    }
                  >
                    <Copy className="mr-2 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <CodeDisplay
                  code={serverDecryptedData}
                  language="text"
                  size="sm"
                  maxHeight="max-h-48"
                />
                <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-success-700 dark:text-success text-sm">
                    ✅ Successfully decrypted file using server's private key!
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trusted Server API Integration */}
        <div className="space-y-4 mt-12">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="font-medium">Trusted Server API Integration</span>
          </div>

          <div>
            <Input
              label="Permission ID"
              value={personalPermissionId}
              onChange={(e) => onPersonalPermissionIdChange(e.target.value)}
              placeholder="Enter permission ID (e.g., 123)"
              type="number"
              description="The ID of a permission grant to use for server API access"
            />
          </div>
          <div className="flex gap-2">
            <ActionButton
              onPress={onPersonalServerCall}
              disabled={!personalPermissionId.trim()}
              loading={isPersonalLoading}
              icon={<Brain className="h-4 w-4" />}
            >
              Process with Trusted Server
            </ActionButton>
            {Boolean(
              personalResult &&
                (personalResult as { urls?: { get?: string } })?.urls?.get,
            ) && (
              <ActionButton
                onPress={onPollStatus}
                loading={isPolling}
                icon={<RotateCcw className="h-4 w-4" />}
                variant="bordered"
              >
                Check Status
              </ActionButton>
            )}
          </div>
        </div>

        {personalError && (
          <StatusMessage status={personalError} type="error" className="p-4" />
        )}

        {Boolean(personalResult) && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">Computation Result:</h4>
              {typeof personalResult === "string" ? (
                <div className="p-4 bg-default-50 border border-default-200 rounded-lg prose prose-sm max-w-none">
                  <ReactMarkdown>{personalResult}</ReactMarkdown>
                </div>
              ) : (
                <CodeDisplay
                  code={JSON.stringify(personalResult, null, 2)}
                  language="json"
                  size="sm"
                />
              )}
            </div>

            {/* Execution Context */}
            {lastUsedPermissionId && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <h4 className="font-medium">Execution Context</h4>
                </div>

                <div className="space-y-3 bg-default-50 p-4 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-default-700">
                      Permission ID Used:
                    </span>
                    <p className="text-sm text-default-600 mt-1">
                      {lastUsedPermissionId}
                    </p>
                  </div>

                  {lastUsedPrompt && (
                    <div>
                      <span className="text-sm font-medium text-default-700">
                        Prompt Used:
                      </span>
                      <CodeDisplay
                        code={lastUsedPrompt}
                        language="text"
                        size="xs"
                        maxHeight="max-h-32"
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* How it works explanation */}
        <InfoBox
          title="Server Permission Workflow:"
          icon={<Brain className="h-4 w-4" />}
          variant="info"
          items={[
            "Files are encrypted with user's wallet signature key",
            "User's encryption key is encrypted with server's real public key",
            "Server uses its private key to decrypt the user's encryption key",
            "Server then uses user's key to decrypt the file data",
            "Personal server APIs work with decrypted data for computation",
          ]}
        />
      </div>
    </section>
  );
};
