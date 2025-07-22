"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root page component that redirects to the default dashboard page
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default dashboard page
    router.push("/my-data");
  }, [router]);

  // Show a simple loading message while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-lg font-semibold mb-2">Vana SDK Demo</div>
        <div className="text-default-500">Redirecting to dashboard...</div>
      </div>
    </div>
  );
}