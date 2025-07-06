"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Dynamically import the main demo page with SSR turned off.
// This prevents any of its code (including dependencies like wagmi)
// from running on the server.
const DemoPage = dynamic(() => import("./demo-page"), {
  ssr: false,
});

// A simple loading component to show while the main page is loading.
function LoadingSpinner() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <p>Loading Demo...</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <DemoPage />
    </Suspense>
  );
}
