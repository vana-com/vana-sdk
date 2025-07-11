import React from "react";
import { Button } from "@heroui/react";
import { IpfsAddressDisplay } from "./ui/IpfsAddressDisplay";
import { CodeDisplay } from "./ui/CodeDisplay";

interface GrantPreview {
  grantFile: {
    grantee: string;
    operation: string;
    files: number[];
    parameters: unknown;
    expires?: number;
  };
  grantUrl: string;
  params: unknown;
}

interface GrantPreviewModalContentProps {
  grantPreview: GrantPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * GrantPreviewModalContent component - Modal content for grant preview
 * Displays grant details before confirmation
 */
export const GrantPreviewModalContent: React.FC<
  GrantPreviewModalContentProps
> = ({ grantPreview, onConfirm, onCancel }) => {
  if (!grantPreview) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <IpfsAddressDisplay
          ipfsUrl={grantPreview.grantUrl}
          label="Grant File Location"
          truncate={false}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Please review the grant details below. You can verify that the message
          you sign matches this content by visiting the IPFS URL above.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium">Operation:</span>
          <p className="text-muted-foreground">
            {grantPreview.grantFile.operation}
          </p>
        </div>
        <div>
          <span className="font-medium">Files:</span>
          <p className="text-muted-foreground">
            [{grantPreview.grantFile.files.join(", ")}]
          </p>
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Parameters:</span>
        <CodeDisplay
          code={JSON.stringify(grantPreview.grantFile.parameters, null, 2)}
          language="json"
          size="xs"
          maxHeight="max-h-28"
          className="mt-2"
        />
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <Button variant="bordered" onPress={onCancel}>
          Cancel
        </Button>
        <Button onPress={onConfirm}>Sign Transaction</Button>
      </div>
    </div>
  );
};
