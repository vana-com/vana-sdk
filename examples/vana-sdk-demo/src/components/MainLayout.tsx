import React from "react";
import { SidebarNavigation } from "./SidebarNavigation";
import { UserDashboardView } from "./views/UserDashboardView";
import { DeveloperDashboardView } from "./views/DeveloperDashboardView";
import { DemoExperienceView } from "./views/DemoExperienceView";

/**
 * Props for the MainLayout component
 */
export interface MainLayoutProps {
  /** Currently active view ID */
  activeView: string;
  /** Callback when view changes */
  onViewChange: (viewId: string) => void;
  /** All props needed for UserDashboardView */
  userDashboardProps: React.ComponentProps<typeof UserDashboardView>;
  /** All props needed for DeveloperDashboardView */
  developerDashboardProps: React.ComponentProps<typeof DeveloperDashboardView>;
  /** All props needed for DemoExperienceView */
  demoExperienceProps: React.ComponentProps<typeof DemoExperienceView>;
}

/**
 * Main layout component that orchestrates the sidebar navigation and view content
 *
 * @remarks
 * This component provides the overall layout structure for the Vana SDK demo,
 * including the fixed sidebar navigation and the main content area that displays
 * the selected view. It acts as the coordinator between the navigation and the
 * three main views.
 *
 * @param props - The component props
 * @returns The rendered main layout
 */
export function MainLayout({
  activeView,
  onViewChange,
  userDashboardProps,
  developerDashboardProps,
  demoExperienceProps,
}: MainLayoutProps) {
  /**
   * Renders the appropriate view content based on the active view
   */
  const renderActiveView = () => {
    switch (activeView) {
      case "my-data":
        return <UserDashboardView {...userDashboardProps} />;
      case "developer-tools":
        return <DeveloperDashboardView {...developerDashboardProps} />;
      case "demo-experience":
        return <DemoExperienceView {...demoExperienceProps} />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Unknown View</h2>
              <p className="text-default-500">
                The requested view "{activeView}" could not be found.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Fixed Sidebar Navigation */}
      <SidebarNavigation activeView={activeView} onViewChange={onViewChange} />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">{renderActiveView()}</div>
      </div>
    </div>
  );
}
