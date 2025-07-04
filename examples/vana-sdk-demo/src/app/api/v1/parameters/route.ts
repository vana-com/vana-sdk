import { NextRequest, NextResponse } from 'next/server'
import { storeParametersOnIPFS, testPinataConnection } from '@/lib/ipfs-storage'
import { relayerStorage, generateContentId } from '@/lib/relayer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { parameters } = body
    
    if (!parameters) {
      return NextResponse.json(
        { success: false, error: 'Missing parameters' },
        { status: 400 }
      )
    }

    // Check if Pinata is configured
    const pinataTest = await testPinataConnection()
    
    if (pinataTest.success) {
      // Use real IPFS storage via Pinata
      console.log('📤 Using Pinata IPFS storage')
      
      const ipfsResult = await storeParametersOnIPFS(parameters, {
        name: `vana-permission-${Date.now()}.json`,
        keyvalues: {
          source: 'vana-sdk-relayer',
          type: 'permission-parameters'
        }
      })
      
      console.log('📦 Stored parameters on IPFS:', {
        ipfsHash: ipfsResult.ipfsHash,
        grantUrl: ipfsResult.grantUrl,
        size: ipfsResult.size
      })

      return NextResponse.json({
        success: true,
        grantUrl: ipfsResult.grantUrl,
        ipfsHash: ipfsResult.ipfsHash,
        storage: 'ipfs'
      })
      
    } else {
      // Fallback to in-memory storage
      console.log('⚠️ Pinata not configured, falling back to in-memory storage')
      console.log('💡 Configure PINATA_JWT in .env.local for real IPFS storage')
      
      const contentId = generateContentId(parameters)
      relayerStorage.store(contentId, parameters)
      const grantUrl = `ipfs://${contentId}`
      
      console.log('📦 Stored parameters (in-memory):', {
        contentId,
        grantUrl,
        size: parameters.length
      })

      return NextResponse.json({
        success: true,
        grantUrl,
        storage: 'memory',
        warning: 'Using in-memory storage. Configure PINATA_JWT for real IPFS storage.'
      })
    }
    
  } catch (error) {
    console.error('❌ Error storing parameters:', error)
    
    // If IPFS fails, try fallback to in-memory storage
    try {
      console.log('🔄 IPFS failed, trying in-memory fallback...')
      const body = await request.json()
      const { parameters } = body
      
      const contentId = generateContentId(parameters)
      relayerStorage.store(contentId, parameters)
      const grantUrl = `ipfs://${contentId}`
      
      return NextResponse.json({
        success: true,
        grantUrl,
        storage: 'memory',
        warning: 'IPFS storage failed, used in-memory fallback.'
      })
      
    } catch (fallbackError) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  }
}