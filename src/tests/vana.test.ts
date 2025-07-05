import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { createWalletClient, http, Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mokshaTestnet } from '../config/chains'
import { Vana } from '../vana'
import { InvalidConfigurationError } from '../errors'

// Mock the controllers
vi.mock('../controllers/permissions', () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({
    grant: vi.fn(),
    revoke: vi.fn(),
  }))
}))

vi.mock('../controllers/data', () => ({
  DataController: vi.fn().mockImplementation(() => ({
    getUserFiles: vi.fn(),
  }))
}))

vi.mock('../controllers/protocol', () => ({
  ProtocolController: vi.fn().mockImplementation(() => ({
    getContract: vi.fn(),
    getAvailableContracts: vi.fn(),
    getChainId: vi.fn().mockReturnValue(14800),
    getChainName: vi.fn().mockReturnValue('VANA - Moksha'),
  }))
}))

// Mock StorageManager
vi.mock('../storage', () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    setDefaultProvider: vi.fn(),
    getProvider: vi.fn(),
    getAllProviders: vi.fn().mockReturnValue([])
  }))
}))

// Test account
const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

describe('Vana', () => {
  let validWalletClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    validWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http('https://rpc.moksha.vana.org')
    })
  })

  describe('Constructor', () => {
    it('should initialize successfully with valid config', () => {
      const vana = new Vana({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })

      expect(vana).toBeDefined()
      expect(vana.permissions).toBeDefined()
      expect(vana.data).toBeDefined()
      expect(vana.protocol).toBeDefined()
    })

    it('should work without relayer URL (direct transaction mode)', () => {
      const vana = new Vana({
        walletClient: validWalletClient
      })

      expect(vana.getConfig().relayerUrl).toBeUndefined()
    })

    it('should throw InvalidConfigurationError when config is missing', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Vana(null)
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when walletClient is missing', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Vana({})
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when walletClient is invalid', () => {
      expect(() => {
        new Vana({
          // @ts-expect-error - Testing invalid input
          walletClient: {}
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when relayerUrl is empty', () => {
      expect(() => {
        new Vana({
          walletClient: validWalletClient,
          relayerUrl: ''
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when relayerUrl is invalid', () => {
      expect(() => {
        new Vana({
          walletClient: validWalletClient,
          relayerUrl: 'not-a-url'
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when relayerUrl is not a string', () => {
      expect(() => {
        new Vana({
          walletClient: validWalletClient,
          // @ts-expect-error - Testing invalid input
          relayerUrl: 123
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when chain is not supported', () => {
      const invalidChainClient = createWalletClient({
        account: testAccount,
        chain: {
          id: 99999,
          name: 'Unsupported Chain',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: ['http://localhost:8545'] } }
        },
        transport: http('http://localhost:8545')
      })

      expect(() => {
        new Vana({
          walletClient: invalidChainClient
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when wallet client has no chain', () => {
      const noChainClient = {
        ...validWalletClient,
        chain: undefined
      }

      expect(() => {
        new Vana({
          walletClient: noChainClient
        })
      }).toThrow(InvalidConfigurationError)
    })
  })

  describe('Properties', () => {
    let vana: Vana

    beforeEach(() => {
      vana = new Vana({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })
    })

    it('should expose all controller properties', () => {
      expect(vana.permissions).toBeDefined()
      expect(vana.data).toBeDefined()
      expect(vana.protocol).toBeDefined()
    })

    it('should expose chainId getter', () => {
      expect(vana.chainId).toBe(14800)
    })

    it('should expose chainName getter', () => {
      expect(vana.chainName).toBe('VANA - Moksha')
    })
  })

  describe('Methods', () => {
    let vana: Vana

    beforeEach(() => {
      vana = new Vana({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })
    })

    it('should return configuration summary', () => {
      const config = vana.getConfig()
      
      expect(config).toEqual({
        chainId: 14800,
        chainName: 'VANA - Moksha',
        relayerUrl: 'https://test-relayer.com'
      })
    })

    it('should get user address', async () => {
      // Mock the private method call
      const mockGetUserAddress = vi.fn().mockResolvedValue(testAccount.address)
      ;(vana.permissions as any).getUserAddress = mockGetUserAddress

      const address = await vana.getUserAddress()
      expect(address).toBe(testAccount.address)
    })
  })

  describe('Integration', () => {
    it('should pass shared context to all controllers', () => {
      const vana = new Vana({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })

      // Verify that controllers are initialized with the correct context
      expect(vana.permissions).toBeDefined()
      expect(vana.data).toBeDefined()
      expect(vana.protocol).toBeDefined()
      
      // Test that the controllers have access to the shared context
      // by verifying they can access the configuration
      const config = vana.getConfig()
      expect(config.relayerUrl).toBe('https://test-relayer.com')
      expect(config.chainId).toBe(14800)
      expect(config.chainName).toBe('VANA - Moksha')
    })
  })

  describe('Storage Configuration', () => {
    it('should initialize with storage providers when provided', async () => {
      const mockProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: 'Mock Provider' })
      }

      const vana = new Vana({
        walletClient: validWalletClient,
        storage: {
          providers: {
            'mock': mockProvider
          },
          defaultProvider: 'mock'
        }
      })

      expect(vana).toBeDefined()
      // StorageManager should be created and configured
      const { StorageManager } = await import('../storage')
      expect(StorageManager).toHaveBeenCalled()
    })

    it('should set first provider as default when no default specified', async () => {
      const mockProvider1 = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: 'Mock Provider 1' })
      }
      
      const mockProvider2 = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: 'Mock Provider 2' })
      }

      const vana = new Vana({
        walletClient: validWalletClient,
        storage: {
          providers: {
            'first': mockProvider1,
            'second': mockProvider2
          }
          // No defaultProvider specified
        }
      })

      expect(vana).toBeDefined()
      const { StorageManager } = await import('../storage')
      const storageManagerInstance = StorageManager.mock.results[StorageManager.mock.results.length - 1].value
      expect(storageManagerInstance.setDefaultProvider).toHaveBeenCalledWith('first')
    })

    it('should work without storage configuration', async () => {
      const vana = new Vana({
        walletClient: validWalletClient
      })

      expect(vana).toBeDefined()
      // StorageManager should not be called when no storage config
      const { StorageManager } = await import('../storage')
      const callCount = StorageManager.mock.calls.length
      
      // Create another instance to verify StorageManager isn't called again
      new Vana({
        walletClient: validWalletClient
      })
      
      expect(StorageManager.mock.calls.length).toBe(callCount) // Should be same, no new calls
    })
  })
})