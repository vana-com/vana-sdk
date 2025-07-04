import { NextRequest, NextResponse } from 'next/server'
import { verifyPermissionGrantSignature, validatePermissionGrantTypedData } from '@/lib/signature-verification'
import { submitPermissionGrant } from '@/lib/blockchain'
import type { Hash } from 'viem'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { typedData, signature } = body
    
    if (!typedData || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing typedData or signature' },
        { status: 400 }
      )
    }

    console.log('🔄 Processing transaction relay...')
    console.log('📝 Typed data:', {
      domain: typedData.domain.name,
      primaryType: typedData.primaryType,
      message: {
        from: typedData.message.from,
        to: typedData.message.to,
        operation: typedData.message.operation
      }
    })

    // Step 1: Validate typed data structure
    if (!validatePermissionGrantTypedData(typedData)) {
      return NextResponse.json(
        { success: false, error: 'Invalid typed data structure' },
        { status: 400 }
      )
    }

    // Step 2: Verify the signature
    console.log('🔍 Verifying signature...')
    const isValidSignature = await verifyPermissionGrantSignature(
      typedData,
      signature as Hash,
      typedData.message.from
    )

    if (!isValidSignature) {
      console.error('❌ Invalid signature')
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      )
    }

    console.log('✅ Signature verified successfully')

    // Step 3: Submit to the PermissionRegistry contract
    console.log('⛓️ Submitting to blockchain...')
    const txHash = await submitPermissionGrant(typedData, signature as Hash)

    console.log('✅ Transaction relayed successfully:', txHash)

    return NextResponse.json({
      success: true,
      transactionHash: txHash
    })
    
  } catch (error) {
    console.error('❌ Error relaying transaction:', error)
    
    // Provide more specific error messages
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage
      },
      { status: 500 }
    )
  }
}