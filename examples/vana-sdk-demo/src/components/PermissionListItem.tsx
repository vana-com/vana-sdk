import React from "react";
import { GrantedPermission, convertIpfsUrl } from "vana-sdk";
import { ActionButton } from "./ui/ActionButton";
import { PermissionDisplay } from "./ui/PermissionDisplay";

interface PermissionListItemProps {
  /**
   * The permission object to display
   */
  permission: GrantedPermission;
  /**
   * Callback when revoke button is clicked
   */
  onRevoke: (permissionId: string) => void;
  /**
   * Whether the revoke operation is in progress
   * @default false
   */
  isRevoking?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * PermissionListItem component for displaying a single permission
 * with its details and revoke functionality
 */
export const PermissionListItem: React.FC<PermissionListItemProps> = ({
  permission,
  onRevoke,
  isRevoking = false,
  className = "",
}) => {
  const handleRevoke = () => {
    onRevoke(permission.id.toString());
  };

  return (
    <div className={`p-4 border rounded-lg ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium">
              Permission ID:{" "}
              <PermissionDisplay
                permissionId={permission.id}
                className="inline-flex"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Grant File:</strong>
              <a
                href={convertIpfsUrl(permission.grant)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-blue-600 hover:text-blue-800 underline"
              >
                View Grant File
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Operation:</strong> {permission.operation}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              <strong>Files:</strong> {permission.files.length} file
              {permission.files.length !== 1 ? "s" : ""}
              {permission.files.length > 0 && (
                <span className="ml-1">({permission.files.join(", ")})</span>
              )}
            </p>
            {permission.parameters !== null && (
              <div className="text-sm text-muted-foreground">
                <details className="group">
                  <summary className="cursor-pointer hover:text-foreground">
                    <strong>Parameters:</strong> Click to expand
                  </summary>
                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {typeof permission.parameters === "string"
                      ? permission.parameters
                      : JSON.stringify(permission.parameters, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
        <ActionButton
          size="sm"
          color="danger"
          onPress={handleRevoke}
          loading={isRevoking}
          className="ml-4"
        >
          Revoke
        </ActionButton>
      </div>
    </div>
  );
};
