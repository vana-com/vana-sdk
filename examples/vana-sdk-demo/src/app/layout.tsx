import type { Metadata } from "next";
// import { Inter } from "next/font/google";
import React from "react";
import "./globals.css";
import { Providers } from "./providers";

// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vana SDK Demo - Data Wallet (shadcn/ui)",
  description:
    "Demonstrate data portability with Vana SDK using shadcn/ui components",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-muted/20">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
