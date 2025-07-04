import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { createWalletClient, http, Hash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mokshaTestnet } from '../config/chains'
import { PermissionsController, ControllerContext } from '../controllers/permissions'
import { 
  RelayerError, 
  UserRejectedRequestError, 
  SerializationError, 
  NonceError 
} from '../errors'

// Mock external dependencies
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn()
    }))
  }
})

vi.mock('../config/addresses', () => ({
  getContractAddress: vi.fn().mockReturnValue('0x1234567890123456789012345678901234567890')
}))

vi.mock('../abi', () => ({
  getAbi: vi.fn().mockReturnValue([])
}))

// Mock fetch globally
global.fetch = vi.fn()

// Test account
const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

describe('PermissionsController', () => {
  let controller: PermissionsController
  let mockContext: ControllerContext
  let mockWalletClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http('https://rpc.moksha.vana.org')
    })

    // Mock wallet client methods
    mockWalletClient.getChainId = vi.fn().mockResolvedValue(14800)
    mockWalletClient.getAddresses = vi.fn().mockResolvedValue([testAccount.address])
    mockWalletClient.signTypedData = vi.fn().mockResolvedValue('0xsignature' as Hash)

    mockContext = {
      walletClient: mockWalletClient,
      relayerUrl: 'https://test-relayer.com'
    }

    controller = new PermissionsController(mockContext)
  })

  describe('grant', () => {
    const mockGrantParams = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      operation: 'llm_inference',
      files: [],
      parameters: {
        prompt: 'Test prompt',
        maxTokens: 100
      }
    }

    it('should successfully grant permission with complete flow', async () => {
      // Mock all the required calls
      const mockFetch = fetch as Mock
      
      // Mock parameter storage response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          grantUrl: 'https://ipfs.io/ipfs/Qm...'
        })
      })

      // Mock nonce retrieval
      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(0))

      // Mock transaction relay response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transactionHash: '0xtxhash'
        })
      })

      const result = await controller.grant(mockGrantParams)

      expect(result).toBe('0xtxhash')
      expect(mockWalletClient.signTypedData).toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledTimes(2) // Parameter storage + transaction relay
    })

    it('should handle user rejection gracefully', async () => {
      // Mock parameter storage and nonce retrieval
      const mockFetch = fetch as Mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          grantUrl: 'https://ipfs.io/ipfs/Qm...'
        })
      })

      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(0))

      // Mock user rejection
      mockWalletClient.signTypedData.mockRejectedValue(new Error('User rejected request'))

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(UserRejectedRequestError)
    })

    it('should handle relayer errors', async () => {
      const mockFetch = fetch as Mock
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(RelayerError)
    })

    it('should handle invalid parameters', async () => {
      const invalidParams = {
        ...mockGrantParams,
        parameters: { circular: {} }
      }
      // Create circular reference
      invalidParams.parameters.circular = invalidParams.parameters

      await expect(controller.grant(invalidParams)).rejects.toThrow()
    })
  })

  describe('revoke', () => {
    const mockRevokeParams = {
      grantId: '0xgrantid123' as Hash
    }

    it('should successfully revoke permission', async () => {
      const mockFetch = fetch as Mock
      
      // Mock nonce retrieval
      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(1))

      // Mock transaction relay response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transactionHash: '0xrevokehash'
        })
      })

      const result = await controller.revoke(mockRevokeParams)

      expect(result).toBe('0xrevokehash')
      expect(mockWalletClient.signTypedData).toHaveBeenCalled()
    })

    it('should handle revoke errors', async () => {
      const mockFetch = fetch as Mock
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Grant not found')
      })

      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(1))

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(RelayerError)
    })
  })

  describe('Parameter serialization', () => {
    it('should serialize parameters in a stable, sorted manner', () => {
      const params1 = { b: 2, a: 1, c: { z: 26, y: 25 } }
      const params2 = { c: { y: 25, z: 26 }, a: 1, b: 2 }

      // Access private method for testing
      const serialize = (controller as any).serializeParameters.bind(controller)
      
      const serialized1 = serialize(params1)
      const serialized2 = serialize(params2)

      expect(serialized1).toBe(serialized2)
      expect(JSON.parse(serialized1)).toEqual({ a: 1, b: 2, c: { y: 25, z: 26 } })
    })

    it('should handle arrays in parameters', () => {
      const params = { 
        files: [3, 1, 2], 
        metadata: { tags: ['b', 'a', 'c'] } 
      }

      const serialize = (controller as any).serializeParameters.bind(controller)
      const serialized = serialize(params)

      expect(JSON.parse(serialized)).toEqual({
        files: [3, 1, 2], // Arrays should maintain order
        metadata: { tags: ['b', 'a', 'c'] }
      })
    })

    it('should handle null and undefined values', () => {
      const params = { 
        nullValue: null, 
        undefinedValue: undefined,
        validValue: 'test'
      }

      const serialize = (controller as any).serializeParameters.bind(controller)
      const serialized = serialize(params)

      const parsed = JSON.parse(serialized)
      expect(parsed.nullValue).toBe(null)
      expect(parsed.undefinedValue).toBe(undefined)
      expect(parsed.validValue).toBe('test')
    })
  })

  describe('EIP-712 message composition', () => {
    it('should compose correct EIP-712 typed data', async () => {
      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(0))

      // Access private method for testing
      const compose = (controller as any).composePermissionGrantMessage.bind(controller)
      
      const params = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        operation: 'test_operation',
        grantUrl: 'https://example.com/grant',
        parametersHash: '0xparamshash' as Hash,
        nonce: BigInt(5)
      }

      const typedData = await compose(params)

      expect(typedData.domain.name).toBe('VanaDataWallet')
      expect(typedData.domain.version).toBe('1')
      expect(typedData.domain.chainId).toBe(14800)
      expect(typedData.primaryType).toBe('Permission')
      expect(typedData.message.application).toBe(params.to)
      expect(typedData.message.operation).toBe(params.operation)
      expect(typedData.message.nonce).toBe(params.nonce)
    })
  })

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockFetch = fetch as Mock
      mockFetch.mockRejectedValue(new Error('Network error'))

      const params = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        operation: 'test',
        files: [],
        parameters: { test: 'value' }
      }

      await expect(controller.grant(params)).rejects.toThrow()
    })

    it('should handle nonce retrieval errors', async () => {
      const { createPublicClient } = await import('viem')
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({})
      } as any)
      ;(mockPublicClient.readContract as Mock).mockRejectedValue(new Error('Contract call failed'))

      const params = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        operation: 'test',
        files: [],
        parameters: { test: 'value' }
      }

      await expect(controller.grant(params)).rejects.toThrow(NonceError)
    })
  })
})