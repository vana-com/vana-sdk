import React from "react";
import { Button } from "@heroui/react";
import { Shield } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";

interface TrustedServerManagementCardProps {
  // Form state
  serverId: string;
  onServerIdChange: (value: string) => void;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;

  // Actions
  onTrustServer: () => void;
  isTrustingServer: boolean;

  // Server discovery (only to populate form)
  onDiscoverReplicateServer: () => void;
  isDiscoveringServer: boolean;

  // Results and status
  trustServerError: string;
}

export const TrustedServerManagementCard: React.FC<
  TrustedServerManagementCardProps
> = ({
  serverId,
  onServerIdChange,
  serverUrl,
  onServerUrlChange,
  onTrustServer,
  isTrustingServer,
  onDiscoverReplicateServer,
  isDiscoveringServer,
  trustServerError,
}) => {
  return (
    <section id="trusted-servers">
      <SectionHeader
        icon={<Shield className="h-5 w-5" />}
        title="Trusted Server Management"
        description={
          <>
            <em>
              Demonstrates: `trustServer()`, `untrustServer()`,
              `getTrustedServers()`
            </em>
            <br />
            Manage your list of trusted servers for data processing - required
            before uploading to servers.
          </>
        }
      />
      <div className="mt-6">
        <FormBuilder
          title=""
          singleColumn={true}
          fields={[
            {
              name: "serverId",
              label: "Server ID",
              type: "text",
              value: serverId,
              onChange: onServerIdChange,
              placeholder: "0x...",
              required: true,
            },
            {
              name: "serverUrl",
              label: "Server URL",
              type: "text",
              value: serverUrl,
              onChange: onServerUrlChange,
              placeholder: "https://...",
              required: true,
            },
          ]}
          onSubmit={onTrustServer}
          isSubmitting={isTrustingServer}
          submitText="Trust Server"
          submitIcon={<Shield className="h-4 w-4" />}
          status={trustServerError}
          additionalButtons={
            <Button
              onPress={onDiscoverReplicateServer}
              isLoading={isDiscoveringServer}
              variant="bordered"
            >
              Get Hosted Server Details
            </Button>
          }
        />
      </div>
    </section>
  );
};
