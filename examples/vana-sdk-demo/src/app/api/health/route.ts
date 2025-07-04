import { NextResponse } from 'next/server'
import { relayerConfig } from '@/lib/relayer'
import { testPinataConnection } from '@/lib/ipfs-storage'

export async function GET() {
  // Test Pinata connection
  const pinataTest = await testPinataConnection()
  
  return NextResponse.json({
    status: 'ok',
    relayer: relayerConfig.account.address,
    chain: relayerConfig.chainId,
    chainRpcUrl: relayerConfig.chainRpcUrl,
    timestamp: new Date().toISOString(),
    service: 'Vana SDK Demo Relayer (Next.js + shadcn/ui)',
    storage: {
      ipfs: {
        enabled: pinataTest.success,
        error: pinataTest.error || null
      },
      memory: {
        enabled: true,
        fallback: true
      }
    },
    features: {
      signatureVerification: true,
      blockchainSubmission: true,
      ipfsStorage: pinataTest.success,
      gaslessTransactions: true
    }
  })
}