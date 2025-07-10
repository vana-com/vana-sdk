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
      title: "Data & Permissions",
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
        {
          id: "encryption",
          label: "Encryption & Upload",
          icon: <Lock className="h-4 w-4" />,
          targetId: "encryption",
        },
      ],
    },
    {
      title: "Server Operations",
      items: [
        {
          id: "trusted-servers",
          label: "Trusted Servers",
          icon: <Shield className="h-4 w-4" />,
          targetId: "trusted-servers",
        },
        {
          id: "personal-server",
          label: "Trusted Server Integration",
          icon: <Brain className="h-4 w-4" />,
          targetId: "personal-server",
        },
        {
          id: "server-upload",
          label: "Server Upload",
          icon: <Upload className="h-4 w-4" />,
          targetId: "server-upload",
        },
      ],
    },
    {
      title: "Schema & Contracts",
      items: [
        {
          id: "schemas",
          label: "Schema Management",
          icon: <Database className="h-4 w-4" />,
          targetId: "schemas",
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
