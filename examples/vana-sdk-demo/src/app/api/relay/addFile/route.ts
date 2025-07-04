import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, type Hash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getContractAddress, getAbi, chains } from 'vana-sdk'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, userAddress } = body
    
    if (!url || !userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing url or userAddress' },
        { status: 400 }
      )
    }

    console.log('🔄 Processing DataRegistry.addFile...')
    console.log('📝 URL:', url)
    console.log('👤 User address:', userAddress)

    // Step 1: Set up relayer wallet
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY as Hash
    if (!relayerPrivateKey) {
      throw new Error('RELAYER_PRIVATE_KEY not configured')
    }

    const account = privateKeyToAccount(relayerPrivateKey)
    const chainId = parseInt(process.env.CHAIN_ID || '14800')
    const rpcUrl = process.env.CHAIN_RPC_URL || 'https://rpc.moksha.vana.org'
    
    const walletClient = createWalletClient({
      account,
      chain: chains[chainId],
      transport: http(rpcUrl),
    })

    const publicClient = createPublicClient({
      chain: chains[chainId],
      transport: http(rpcUrl),
    })

    // Step 2: Get DataRegistry contract address
    const dataRegistryAddress = getContractAddress(chainId, 'DataRegistry')

    console.log('⛓️ Calling DataRegistry.addFile...')
    console.log('📍 Contract:', dataRegistryAddress)

    // Step 3: Call DataRegistry.addFile function
    const txHash = await walletClient.writeContract({
      address: dataRegistryAddress as Hash,
      abi: getAbi('DataRegistry'),
      functionName: 'addFile',
      args: [url],
    })

    console.log('✅ Transaction submitted:', txHash)

    // Step 4: Wait for transaction to be mined and get file ID
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    
    console.log('✅ Transaction mined:', receipt.transactionHash)

    // Step 5: Extract file ID from logs
    let fileId = null
    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() === dataRegistryAddress.toLowerCase()) {
          // Look for FileAdded event
          if (log.topics[0] && log.topics[1]) {
            // FileAdded event has fileId as first indexed parameter
            fileId = parseInt(log.topics[1], 16)
            break
          }
        }
      } catch (error) {
        // Continue looking through other logs
      }
    }

    console.log('📄 File ID:', fileId)

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
      fileId: fileId,
      url: url
    })
    
  } catch (error) {
    console.error('❌ Error adding file to blockchain:', error)
    
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