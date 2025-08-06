"use client";

import { useParaAuth } from "../hooks/useParaAuth";

/**
 * ParaAuthHandler component manages the Para authentication flow automatically.
 * It should be included in the provider hierarchy to run authentication logic.
 * This component doesn't render any UI - it just handles the auth side effects.
 */
export function ParaAuthHandler() {
  // The useParaAuth hook handles all the authentication logic automatically
  // when wallet connection state changes
  useParaAuth();

  // This component doesn't render anything - it just manages auth side effects
  return null;
}