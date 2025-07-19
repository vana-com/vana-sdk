"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@heroui/react";
import { Database, Settings, Zap } from "lucide-react";

/**
 * Represents a navigation view in the sidebar
 */
export interface NavigationView {
  /** Unique identifier for the view */
  id: string;
  /** Next.js route path */
  href: string;
  /** Display label for the view */
  label: string;
  /** Icon component for the view */
  icon: React.ComponentType<{ className?: string }>;
  /** Optional description for the view */
  description?: string;
}

/**
 * Props for the SidebarNavigation component
 */
export interface SidebarNavigationProps {
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Navigation views configuration
 */
const navigationViews: NavigationView[] = [
  {
    id: "my-data",
    href: "/my-data",
    label: "My Data",
    icon: Database,
    description: "Your personal data control panel",
  },
  {
    id: "developer-tools",
    href: "/developer-tools",
    label: "Developer Tools",
    icon: Settings,
    description: "Schema and server management",
  },
  {
    id: "demo-experience",
    href: "/demo-experience",
    label: "AI Profile Demo",
    icon: Zap,
    description: "Generate AI insights from your data",
  },
];

/**
 * Fixed sidebar navigation component with three main views
 *
 * @remarks
 * This component provides clean navigation between the three main views of the
 * Vana SDK demo application using Next.js routing. It automatically detects
 * the active route and provides clear visual feedback to the user.
 *
 * @param props - The component props
 * @returns The rendered sidebar navigation
 */
export function SidebarNavigation({
  className = "",
}: SidebarNavigationProps) {
  const pathname = usePathname();

  return (
    <div
      className={`w-64 border-r border-divider bg-content1 overflow-y-auto ${className}`}
    >
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          Vana SDK Demo
        </h2>

        <nav className="space-y-2">
          {navigationViews.map((view) => {
            const Icon = view.icon;
            const isActive = pathname === view.href;

            return (
              <Link key={view.id} href={view.href}>
                <Button
                  variant={isActive ? "solid" : "light"}
                  color={isActive ? "primary" : "default"}
                  className={`w-full justify-start h-auto p-3 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-content2"
                  }`}
                >
                  <div className="flex items-center gap-3 w-full">
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">{view.label}</div>
                      {view.description && (
                        <div className="text-xs opacity-70 mt-1 leading-tight">
                          {view.description}
                        </div>
                      )}
                    </div>
                  </div>
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
