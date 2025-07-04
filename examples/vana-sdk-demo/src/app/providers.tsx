'use client'

import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'
import '@rainbow-me/rainbowkit/styles.css'

// Define Moksha testnet for RainbowKit
const mokshaTestnet = defineChain({
  id: 14800,
  name: 'Vana Moksha Testnet',
  nativeCurrency: {
    name: 'VANA',
    symbol: 'VANA',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.moksha.vana.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Vanascan - Moksha',
      url: 'https://moksha.vanascan.io',
    },
  },
})

// Configure wagmi
const config = getDefaultConfig({
  appName: 'Vana SDK Next.js Demo with shadcn/ui',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'demo-project-id',
  chains: [mokshaTestnet],
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export { mokshaTestnet }