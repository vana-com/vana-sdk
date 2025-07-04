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

// Test account
const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

describe('Vana', () => {
  let validWalletClient: any
  let validApplicationWallet: any

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
        relayerUrl: 'https://test-relayer.com',
        applicationWallet: validApplicationWallet
      })

      expect(vana).toBeDefined()
      expect(vana.permissions).toBeDefined()
      expect(vana.data).toBeDefined()
      expect(vana.protocol).toBeDefined()
    })

    it('should use default relayer URL when not provided', () => {
      const vana = new Vana({
        walletClient: validWalletClient,
        applicationWallet: validApplicationWallet
      })

      expect(vana.getConfig().relayerUrl).toBe('https://relayer.vana.org')
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
          relayerUrl: '',
          applicationWallet: validApplicationWallet
        })
      }).toThrow(InvalidConfigurationError)
    })

    it('should throw InvalidConfigurationError when relayerUrl is invalid', () => {
      expect(() => {
        new Vana({
          walletClient: validWalletClient,
          relayerUrl: 'not-a-url',
          applicationWallet: validApplicationWallet
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
          walletClient: invalidChainClient,
          applicationWallet: validApplicationWallet
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
          walletClient: noChainClient,
          applicationWallet: validApplicationWallet
        })
      }).toThrow(InvalidConfigurationError)
    })
  })

  describe('Properties', () => {
    let vana: Vana

    beforeEach(() => {
      vana = new Vana({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com',
        applicationWallet: validApplicationWallet
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
        relayerUrl: 'https://test-relayer.com',
        applicationWallet: validApplicationWallet
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
        relayerUrl: 'https://test-relayer.com',
        applicationWallet: validApplicationWallet
      })

      // Verify that controllers were instantiated with the correct context
      const { PermissionsController } = require('../controllers/permissions')
      const { DataController } = require('../controllers/data')
      const { ProtocolController } = require('../controllers/protocol')

      expect(PermissionsController).toHaveBeenCalledWith({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })

      expect(DataController).toHaveBeenCalledWith({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })

      expect(ProtocolController).toHaveBeenCalledWith({
        walletClient: validWalletClient,
        relayerUrl: 'https://test-relayer.com'
      })
    })
  })
})