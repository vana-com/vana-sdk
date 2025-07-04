import { NextRequest, NextResponse } from 'next/server'
import { testPinataConnection, listRecentPins } from '@/lib/ipfs-storage'
import { relayerStorage } from '@/lib/relayer'

export async function GET() {
  try {
    // Test Pinata connection
    const pinataTest = await testPinataConnection()
    
    let ipfsInfo = null
    if (pinataTest.success) {
      try {
        // Get recent pins
        const recentPins = await listRecentPins(10)
        ipfsInfo = {
          connected: true,
          accountInfo: pinataTest.accountInfo,
          recentPins: recentPins.map(pin => ({
            hash: pin.ipfsHash,
            name: pin.name,
            size: pin.size,
            date: pin.timestamp,
            metadata: pin.keyvalues
          }))
        }
      } catch (error) {
        ipfsInfo = {
          connected: true,
          accountInfo: pinataTest.accountInfo,
          error: `Failed to list pins: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    } else {
      ipfsInfo = {
        connected: false,
        error: pinataTest.error
      }
    }
    
    // Get in-memory storage info
    const memoryStorage = relayerStorage.getAll()
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      storage: {
        ipfs: ipfsInfo,
        memory: {
          enabled: true,
          entries: memoryStorage.length,
          data: memoryStorage
        }
      },
      environment: {
        pinataConfigured: !!process.env.PINATA_JWT,
        gatewayUrl: process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud'
      }
    })
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST endpoint to test IPFS storage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { testData = 'test-data-' + Date.now() } = body
    
    const testPinata = await testPinataConnection()
    if (!testPinata.success) {
      return NextResponse.json({
        success: false,
        error: 'Pinata not configured or connection failed',
        details: testPinata.error
      }, { status: 400 })
    }
    
    // Import the storage function dynamically to test it
    const { storeParametersOnIPFS } = await import('@/lib/ipfs-storage')
    
    const testParameters = JSON.stringify({
      test: true,
      data: testData,
      timestamp: new Date().toISOString(),
      purpose: 'debug-test'
    })
    
    const result = await storeParametersOnIPFS(testParameters, {
      name: `debug-test-${Date.now()}.json`,
      keyvalues: {
        type: 'debug-test',
        timestamp: new Date().toISOString()
      }
    })
    
    return NextResponse.json({
      success: true,
      message: 'Test storage successful',
      result: {
        ipfsHash: result.ipfsHash,
        grantUrl: result.grantUrl,
        size: result.size
      },
      testData: JSON.parse(testParameters)
    })
    
  } catch (error) {
    console.error('❌ IPFS test error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}