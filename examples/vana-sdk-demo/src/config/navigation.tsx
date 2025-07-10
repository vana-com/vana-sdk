import React from "react";
import {
  Database,
  Shield,
  Lock,
  Upload,
  Brain,
  ExternalLink,
  Settings,
} from "lucide-react";
import type { NavigationConfig } from "@/types/navigation";

export const navigationConfig: NavigationConfig = {
  sections: [
    {
      title: "Core Concepts",
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
      title: "Applied Workflows",
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
    {
      title: "Configuration",
      items: [
        {
          id: "configuration",
          label: "SDK Configuration",
          icon: <Settings className="h-4 w-4" />,
          targetId: "configuration",
        },
      ],
    },
  ],
};
