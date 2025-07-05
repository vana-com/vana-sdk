import { describe, it, expect } from 'vitest'

// Test that all main exports are available
describe('SDK Entry Point', () => {
  describe('Core exports', () => {
    it('should export Vana main class', async () => {
      const { Vana } = await import('../index')
      expect(Vana).toBeDefined()
      expect(typeof Vana).toBe('function')
    })

    it('should export VanaProvider', async () => {
      const { VanaProvider } = await import('../index')
      expect(VanaProvider).toBeDefined()
      expect(typeof VanaProvider).toBe('function')
    })
  })

  describe('Controller exports', () => {
    it('should export PermissionsController', async () => {
      const { PermissionsController } = await import('../index')
      expect(PermissionsController).toBeDefined()
      expect(typeof PermissionsController).toBe('function')
    })

    it('should export DataController', async () => {
      const { DataController } = await import('../index')
      expect(DataController).toBeDefined()
      expect(typeof DataController).toBe('function')
    })

    it('should export ProtocolController', async () => {
      const { ProtocolController } = await import('../index')
      expect(ProtocolController).toBeDefined()
      expect(typeof ProtocolController).toBe('function')
    })
  })

  describe('Contract exports', () => {
    it('should export ContractClient', async () => {
      const { ContractClient } = await import('../index')
      expect(ContractClient).toBeDefined()
      expect(typeof ContractClient).toBe('function')
    })

    it('should export getContractController', async () => {
      const { getContractController } = await import('../index')
      expect(getContractController).toBeDefined()
      expect(typeof getContractController).toBe('function')
    })
  })

  describe('Utility exports', () => {
    it('should export encryption utilities', async () => {
      const { 
        generateEncryptionKey, 
        encryptUserData, 
        decryptUserData, 
        DEFAULT_ENCRYPTION_SEED 
      } = await import('../index')
      
      expect(generateEncryptionKey).toBeDefined()
      expect(encryptUserData).toBeDefined()
      expect(decryptUserData).toBeDefined()
      expect(DEFAULT_ENCRYPTION_SEED).toBeDefined()
    })

    it('should export formatter utilities', async () => {
      const { 
        formatNumber, 
        formatEth, 
        formatToken, 
        shortenAddress 
      } = await import('../index')
      
      expect(formatNumber).toBeDefined()
      expect(formatEth).toBeDefined()
      expect(formatToken).toBeDefined()
      expect(shortenAddress).toBeDefined()
    })

    it('should export grant file utilities', async () => {
      const { 
        createGrantFile, 
        storeGrantFile, 
        retrieveGrantFile, 
        getGrantFileHash 
      } = await import('../index')
      
      expect(createGrantFile).toBeDefined()
      expect(storeGrantFile).toBeDefined()
      expect(retrieveGrantFile).toBeDefined()
      expect(getGrantFileHash).toBeDefined()
    })
  })

  describe('Storage exports', () => {
    it('should export storage types and classes', async () => {
      const { 
        StorageManager,
        StorageError,
        IPFSStorage,
        PinataStorage,
        GoogleDriveStorage,
        ServerIPFSStorage
      } = await import('../index')
      
      expect(StorageManager).toBeDefined()
      expect(StorageError).toBeDefined()
      expect(IPFSStorage).toBeDefined()
      expect(PinataStorage).toBeDefined()
      expect(GoogleDriveStorage).toBeDefined()
      expect(ServerIPFSStorage).toBeDefined()
    })
  })

  describe('Config exports', () => {
    it('should export configuration utilities', async () => {
      const { getContractAddress, chains } = await import('../index')
      
      expect(getContractAddress).toBeDefined()
      expect(chains).toBeDefined()
      expect(typeof getContractAddress).toBe('function')
      expect(typeof chains).toBe('object')
    })

    it('should export ABI utilities', async () => {
      const { getAbi } = await import('../index')
      
      expect(getAbi).toBeDefined()
      expect(typeof getAbi).toBe('function')
    })
  })

  describe('Error exports', () => {
    it('should export all error classes', async () => {
      const { 
        NetworkError,
        BlockchainError,
        SignatureError,
        UserRejectedRequestError,
        RelayerError,
        SerializationError,
        NonceError,
        StorageError
      } = await import('../index')
      
      expect(NetworkError).toBeDefined()
      expect(BlockchainError).toBeDefined()
      expect(SignatureError).toBeDefined()
      expect(UserRejectedRequestError).toBeDefined()
      expect(RelayerError).toBeDefined()
      expect(SerializationError).toBeDefined()
      expect(NonceError).toBeDefined()
      expect(StorageError).toBeDefined()
    })
  })

  describe('Type exports', () => {
    it('should be able to import types', async () => {
      // Just verify the import doesn't throw - types don't exist at runtime
      const module = await import('../index')
      expect(module).toBeDefined()
    })
  })
})