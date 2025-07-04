import { describe, it, expect, beforeEach } from 'vitest'
import { DataController } from '../controllers/data'
import { ControllerContext } from '../controllers/permissions'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mokshaTestnet } from '../config/chains'

// Test account
const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

describe('DataController', () => {
  let controller: DataController
  let mockContext: ControllerContext

  beforeEach(() => {
    const mockWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http('https://rpc.moksha.vana.org')
    })

    mockContext = {
      walletClient: mockWalletClient,
      relayerUrl: 'https://test-relayer.com'
    }

    controller = new DataController(mockContext)
  })

  describe('getUserFiles', () => {
    it('should return mock user files as specified in PRD Appendix C', async () => {
      const owner = testAccount.address
      const files = await controller.getUserFiles({ owner })

      expect(files).toHaveLength(3)
      
      // Verify the exact structure from PRD Appendix C
      expect(files[0]).toEqual({
        id: 12,
        url: "ipfs://Qm...",
        ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        addedAtBlock: 123456n,
      })

      expect(files[1]).toEqual({
        id: 15,
        url: "googledrive://file_id/12345",
        ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        addedAtBlock: 123490n,
      })

      expect(files[2]).toEqual({
        id: 28,
        url: "https://user-data.com/gmail_export.json",
        ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        addedAtBlock: 123900n,
      })
    })

    it('should return the same mock data regardless of owner address', async () => {
      // Test with different owner addresses
      const owner1 = '0x1111111111111111111111111111111111111111' as `0x${string}`
      const owner2 = '0x2222222222222222222222222222222222222222' as `0x${string}`

      const files1 = await controller.getUserFiles({ owner: owner1 })
      const files2 = await controller.getUserFiles({ owner: owner2 })

      // Should return the same mock data regardless of owner
      expect(files1).toEqual(files2)
      expect(files1).toHaveLength(3)
    })

    it('should return data immediately without network requests', async () => {
      const startTime = Date.now()
      const files = await controller.getUserFiles({ owner: testAccount.address })
      const endTime = Date.now()

      // Should be very fast since it's mocked data
      expect(endTime - startTime).toBeLessThan(10)
      expect(files).toHaveLength(3)
    })

    it('should maintain consistent data structure', async () => {
      const files = await controller.getUserFiles({ owner: testAccount.address })

      files.forEach(file => {
        expect(file).toHaveProperty('id')
        expect(file).toHaveProperty('url')
        expect(file).toHaveProperty('ownerAddress')
        expect(file).toHaveProperty('addedAtBlock')

        expect(typeof file.id).toBe('number')
        expect(typeof file.url).toBe('string')
        expect(typeof file.ownerAddress).toBe('string')
        expect(typeof file.addedAtBlock).toBe('bigint')

        // Verify address format
        expect(file.ownerAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
        
        // Verify block number is positive
        expect(file.addedAtBlock).toBeGreaterThan(0n)
      })
    })

    it('should return files with unique IDs', async () => {
      const files = await controller.getUserFiles({ owner: testAccount.address })
      const ids = files.map(file => file.id)
      const uniqueIds = [...new Set(ids)]

      expect(ids).toHaveLength(uniqueIds.length)
    })

    it('should return files with chronological block numbers', async () => {
      const files = await controller.getUserFiles({ owner: testAccount.address })
      
      // Verify blocks are in ascending order (assuming chronological addition)
      expect(files[0].addedAtBlock).toBeLessThan(files[1].addedAtBlock)
      expect(files[1].addedAtBlock).toBeLessThan(files[2].addedAtBlock)
    })

    it('should handle different URL formats', async () => {
      const files = await controller.getUserFiles({ owner: testAccount.address })
      
      const urlFormats = files.map(file => {
        if (file.url.startsWith('ipfs://')) return 'ipfs'
        if (file.url.startsWith('googledrive://')) return 'googledrive'
        if (file.url.startsWith('https://')) return 'https'
        return 'unknown'
      })

      expect(urlFormats).toContain('ipfs')
      expect(urlFormats).toContain('googledrive')
      expect(urlFormats).toContain('https')
    })
  })

  describe('Stubbed implementation note', () => {
    it('should return consistent mock data indicating stubbed implementation', () => {
      // This test verifies that the method returns the exact mock data from PRD Appendix C
      // indicating this is a stubbed implementation
      
      expect(controller.getUserFiles({ owner: testAccount.address })).resolves.toEqual([
        {
          id: 12,
          url: "ipfs://Qm...",
          ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          addedAtBlock: 123456n,
        },
        {
          id: 15,
          url: "googledrive://file_id/12345",
          ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          addedAtBlock: 123490n,
        },
        {
          id: 28,
          url: "https://user-data.com/gmail_export.json",
          ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          addedAtBlock: 123900n,
        },
      ])
    })
  })
})