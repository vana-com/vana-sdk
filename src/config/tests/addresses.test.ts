import { describe, it, expect } from 'vitest'
import { getContractAddress, getUtilityAddress } from '../addresses'

describe('addresses', () => {
  describe('getContractAddress', () => {
    it('should return contract address for valid chain and contract', () => {
      const address = getContractAddress(14800, 'DataRegistry')
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(typeof address).toBe('string')
    })

    it('should throw error for invalid contract on valid chain', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid contract name
        getContractAddress(14800, 'NonExistentContract')
      }).toThrow('Contract address not found for NonExistentContract on chain 14800')
    })

    it('should throw error for invalid chain', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid chain ID
        getContractAddress(99999, 'DataRegistry')
      }).toThrow()
    })
  })

  describe('getUtilityAddress', () => {
    it('should return utility address for valid chain and utility', () => {
      const address = getUtilityAddress(14800, 'Multicall3')
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(typeof address).toBe('string')
    })

    it('should handle mainnet utility addresses', () => {
      const address = getUtilityAddress(1480, 'Multicall3')
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(typeof address).toBe('string')
    })

    it('should return utility address for Multisend', () => {
      const address = getUtilityAddress(14800, 'Multisend')
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(typeof address).toBe('string')
    })

    it('should return undefined for non-existent utility', () => {
      // @ts-expect-error - Testing non-existent utility
      const address = getUtilityAddress(14800, 'nonExistentUtility')
      expect(address).toBeUndefined()
    })
  })
})