import type { Metadata } from "next";
import React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "../providers";
import { VanaProvider } from "../providers/vana-provider";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { GoogleTokenProvider } from "../contexts/GoogleTokenContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vana Vibes Demo",
  description: "A minimal demo of Vana SDK's data portability features",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleOAuthProvider
          clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
        >
          <GoogleTokenProvider>
            <Providers>
              <VanaProvider>{children}</VanaProvider>
            </Providers>
          </GoogleTokenProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
