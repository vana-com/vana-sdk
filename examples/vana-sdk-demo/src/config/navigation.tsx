import React from "react";
import {
  Database,
  Shield,
  Lock,
  Upload,
  Brain,
  ExternalLink,
} from "lucide-react";
import type { NavigationConfig } from "@/types/navigation";

export const navigationConfig: NavigationConfig = {
  sections: [
    {
      title: "Data Management",
      items: [
        {
          id: "data",
          label: "Your Data",
          icon: <Database className="h-4 w-4" />,
          targetId: "data",
        },
        {
          id: "permissions",
          label: "Permissions",
          icon: <Shield className="h-4 w-4" />,
          targetId: "permissions",
        },
      ],
    },
    {
      title: "Server Integration",
      items: [
        {
          id: "trusted-servers",
          label: "Trusted Servers",
          icon: <Shield className="h-4 w-4" />,
          targetId: "trusted-servers",
        },
        {
          id: "schemas",
          label: "Schema Management",
          icon: <Database className="h-4 w-4" />,
          targetId: "schemas",
        },
        {
          id: "personal-server",
          label: "Trusted Server Integration",
          icon: <Brain className="h-4 w-4" />,
          targetId: "personal-server",
        },
      ],
    },
    {
      title: "Development Tools",
      items: [
        {
          id: "encryption",
          label: "Encryption Testing",
          icon: <Lock className="h-4 w-4" />,
          targetId: "encryption",
        },
        {
          id: "server-upload",
          label: "Server Upload",
          icon: <Upload className="h-4 w-4" />,
          targetId: "server-upload",
        },
        {
          id: "contracts",
          label: "Contracts",
          icon: <ExternalLink className="h-4 w-4" />,
          targetId: "contracts",
        },
      ],
    },
  ],
};
