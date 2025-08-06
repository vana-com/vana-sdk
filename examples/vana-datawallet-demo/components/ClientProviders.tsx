"use client";

import React, { ReactNode } from "react";
import { ClientOnlyWrapper } from "./ClientOnlyWrapper";
import { Providers } from "../providers";

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ClientOnlyWrapper 
      fallback={
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-8">
                Vana DataWallet Demo
              </h1>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">Loading...</p>
                <p className="text-yellow-600 text-sm mt-1">
                  Initializing wallet providers...
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <Providers>
        {children}
      </Providers>
    </ClientOnlyWrapper>
  );
}