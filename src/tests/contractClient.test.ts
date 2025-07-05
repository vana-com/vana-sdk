import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContractClient } from '../contracts/contractClient'
import { VanaProvider } from '../core/provider'
import { VanaContract } from '../abi'

// Mock the contract controller
vi.mock('../contracts/contractController', () => ({
  getContractController: vi.fn().mockReturnValue({
    read: vi.fn(),
    write: vi.fn(),
    address: '0x1234567890123456789012345678901234567890'
  })
}))

// Create a concrete implementation for testing
class TestContractClient extends ContractClient<'DataRegistry'> {
  constructor(provider: VanaProvider) {
    super('DataRegistry', provider)
  }

  // Add a test method to verify contract access
  public getContractAddress() {
    return this.contract.address
  }

  // Add a test method to verify contract methods
  public async testRead() {
    return this.contract.read
  }
}

describe('ContractClient', () => {
  let provider: VanaProvider
  let client: TestContractClient

  beforeEach(() => {
    // Mock provider
    provider = {
      client: {
        chain: { id: 14800 },
        transport: {},
        readContract: vi.fn(),
        writeContract: vi.fn()
      }
    } as any

    client = new TestContractClient(provider)
  })

  describe('Construction', () => {
    it('should initialize with contract name and provider', () => {
      expect(client).toBeInstanceOf(ContractClient)
      expect(client).toBeInstanceOf(TestContractClient)
    })

    it('should set up contract controller during construction', async () => {
      const { getContractController } = await import('../contracts/contractController')
      expect(getContractController).toHaveBeenCalledWith('DataRegistry', provider.client)
    })
  })

  describe('getRawContract', () => {
    it('should return the contract instance', () => {
      const rawContract = client.getRawContract()
      
      expect(rawContract).toBeDefined()
      expect(rawContract.address).toBe('0x1234567890123456789012345678901234567890')
      expect(rawContract.read).toBeDefined()
      expect(rawContract.write).toBeDefined()
    })

    it('should return the same contract instance on multiple calls', () => {
      const contract1 = client.getRawContract()
      const contract2 = client.getRawContract()
      
      expect(contract1).toBe(contract2)
    })
  })

  describe('Protected contract access', () => {
    it('should allow subclasses to access contract methods', () => {
      const address = client.getContractAddress()
      expect(address).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should allow subclasses to access contract read methods', async () => {
      const readMethod = await client.testRead()
      expect(readMethod).toBeDefined()
    })
  })

  describe('Multiple contract types', () => {
    it('should work with different contract types', async () => {
      class AnotherTestClient extends ContractClient<'RootNetwork'> {
        constructor(provider: VanaProvider) {
          super('RootNetwork', provider)
        }
      }

      const anotherClient = new AnotherTestClient(provider)
      expect(anotherClient).toBeInstanceOf(ContractClient)
      
      const { getContractController } = await import('../contracts/contractController')
      expect(getContractController).toHaveBeenCalledWith('RootNetwork', provider.client)
    })
  })

  describe('Error handling', () => {
    it('should handle provider initialization errors', () => {
      const invalidProvider = null as any
      
      expect(() => {
        new TestContractClient(invalidProvider)
      }).toThrow()
    })
  })
})