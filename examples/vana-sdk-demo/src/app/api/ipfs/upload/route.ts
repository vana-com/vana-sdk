import { NextRequest, NextResponse } from 'next/server'
import { storeParametersOnIPFS, testPinataConnection } from '@/lib/ipfs-storage'

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file from form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    console.log('📤 Processing IPFS upload via app-managed Pinata...')
    console.log('📝 File:', {
      name: file.name,
      size: file.size,
      type: file.type
    })

    // Check if Pinata is configured
    const pinataTest = await testPinataConnection()
    
    if (!pinataTest.success) {
      console.error('❌ Pinata not configured:', pinataTest.error)
      return NextResponse.json(
        { 
          success: false, 
          error: 'IPFS storage not configured. Please set PINATA_JWT in server environment.' 
        },
        { status: 503 }
      )
    }

    // Store binary file directly on IPFS via Pinata (don't convert to text!)
    const { PinataSDK } = await import('pinata')
    const pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT!,
      pinataGateway: process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud'
    })

    // Upload the file directly without text conversion
    const upload = await pinata.upload.public.file(file)
    
    const ipfsResult = {
      ipfsHash: upload.cid,
      grantUrl: `ipfs://${upload.cid}`,
      size: file.size
    }

    console.log('✅ File uploaded to IPFS:', {
      ipfsHash: ipfsResult.ipfsHash,
      url: ipfsResult.grantUrl,
      size: ipfsResult.size
    })

    return NextResponse.json({
      success: true,
      url: ipfsResult.grantUrl,
      ipfsHash: ipfsResult.ipfsHash,
      size: ipfsResult.size,
      storage: 'app-managed-ipfs'
    })
    
  } catch (error) {
    console.error('❌ Error uploading to IPFS:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}