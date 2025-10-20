"use client";

import dynamic from "next/dynamic";

const Providers = dynamic(
  () => import("./providers").then((mod) => ({ default: mod.Providers })),
  {
    ssr: false,
  },
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
