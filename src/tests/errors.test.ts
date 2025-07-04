import { describe, it, expect } from 'vitest'
import {
  VanaError,
  RelayerError,
  UserRejectedRequestError,
  InvalidConfigurationError,
  ContractNotFoundError,
  BlockchainError,
  SerializationError,
  SignatureError,
  NetworkError,
  NonceError
} from '../errors'

describe('Error Classes', () => {
  describe('VanaError (Base Class)', () => {
    it('should create error with message and code', () => {
      const error = new VanaError('Test error', 'TEST_CODE')
      
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.name).toBe('VanaError')
      expect(error instanceof Error).toBe(true)
      expect(error instanceof VanaError).toBe(true)
    })

    it('should create error without code', () => {
      const error = new VanaError('Test error')
      
      expect(error.message).toBe('Test error')
      expect(error.code).toBeUndefined()
    })

    it('should maintain proper prototype chain', () => {
      const error = new VanaError('Test error')
      
      expect(error instanceof Error).toBe(true)
      expect(error instanceof VanaError).toBe(true)
      expect(error.constructor).toBe(VanaError)
    })
  })

  describe('RelayerError', () => {
    it('should create error with status code and response', () => {
      const response = { error: 'Server error', details: 'Internal error' }
      const error = new RelayerError('Relayer failed', 500, response)
      
      expect(error.message).toBe('Relayer failed')
      expect(error.code).toBe('RELAYER_ERROR')
      expect(error.statusCode).toBe(500)
      expect(error.response).toBe(response)
      expect(error instanceof RelayerError).toBe(true)
      expect(error instanceof VanaError).toBe(true)
    })

    it('should create error without status code and response', () => {
      const error = new RelayerError('Relayer failed')
      
      expect(error.message).toBe('Relayer failed')
      expect(error.statusCode).toBeUndefined()
      expect(error.response).toBeUndefined()
    })
  })

  describe('UserRejectedRequestError', () => {
    it('should create error with default message', () => {
      const error = new UserRejectedRequestError()
      
      expect(error.message).toBe('User rejected the signature request')
      expect(error.code).toBe('USER_REJECTED_REQUEST')
      expect(error instanceof UserRejectedRequestError).toBe(true)
    })

    it('should create error with custom message', () => {
      const error = new UserRejectedRequestError('Custom rejection message')
      
      expect(error.message).toBe('Custom rejection message')
      expect(error.code).toBe('USER_REJECTED_REQUEST')
    })
  })

  describe('InvalidConfigurationError', () => {
    it('should create error with configuration message', () => {
      const error = new InvalidConfigurationError('Invalid wallet client')
      
      expect(error.message).toBe('Invalid wallet client')
      expect(error.code).toBe('INVALID_CONFIGURATION')
      expect(error instanceof InvalidConfigurationError).toBe(true)
    })
  })

  describe('ContractNotFoundError', () => {
    it('should create error with contract and chain info', () => {
      const error = new ContractNotFoundError('DataRegistry', 14800)
      
      expect(error.message).toBe('Contract DataRegistry not found on chain 14800')
      expect(error.code).toBe('CONTRACT_NOT_FOUND')
      expect(error instanceof ContractNotFoundError).toBe(true)
    })
  })

  describe('BlockchainError', () => {
    it('should create error with original error', () => {
      const originalError = new Error('Transaction failed')
      const error = new BlockchainError('Blockchain operation failed', originalError)
      
      expect(error.message).toBe('Blockchain operation failed')
      expect(error.code).toBe('BLOCKCHAIN_ERROR')
      expect(error.originalError).toBe(originalError)
      expect(error instanceof BlockchainError).toBe(true)
    })

    it('should create error without original error', () => {
      const error = new BlockchainError('Blockchain operation failed')
      
      expect(error.originalError).toBeUndefined()
    })
  })

  describe('SerializationError', () => {
    it('should create serialization error', () => {
      const error = new SerializationError('Failed to serialize parameters')
      
      expect(error.message).toBe('Failed to serialize parameters')
      expect(error.code).toBe('SERIALIZATION_ERROR')
      expect(error instanceof SerializationError).toBe(true)
    })
  })

  describe('SignatureError', () => {
    it('should create signature error with original error', () => {
      const originalError = new Error('Signature failed')
      const error = new SignatureError('Failed to sign', originalError)
      
      expect(error.message).toBe('Failed to sign')
      expect(error.code).toBe('SIGNATURE_ERROR')
      expect(error.originalError).toBe(originalError)
      expect(error instanceof SignatureError).toBe(true)
    })
  })

  describe('NetworkError', () => {
    it('should create network error with original error', () => {
      const originalError = new Error('Connection timeout')
      const error = new NetworkError('Network request failed', originalError)
      
      expect(error.message).toBe('Network request failed')
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.originalError).toBe(originalError)
      expect(error instanceof NetworkError).toBe(true)
    })
  })

  describe('NonceError', () => {
    it('should create nonce error', () => {
      const error = new NonceError('Failed to retrieve nonce')
      
      expect(error.message).toBe('Failed to retrieve nonce')
      expect(error.code).toBe('NONCE_ERROR')
      expect(error instanceof NonceError).toBe(true)
    })
  })

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for all error types', () => {
      const errors = [
        new RelayerError('test'),
        new UserRejectedRequestError('test'),
        new InvalidConfigurationError('test'),
        new ContractNotFoundError('test', 1),
        new BlockchainError('test'),
        new SerializationError('test'),
        new SignatureError('test'),
        new NetworkError('test'),
        new NonceError('test')
      ]

      errors.forEach(error => {
        expect(error instanceof Error).toBe(true)
        expect(error instanceof VanaError).toBe(true)
        expect(error.name).toBe(error.constructor.name)
        expect(typeof error.code).toBe('string')
        expect(error.code!.length).toBeGreaterThan(0)
      })
    })

    it('should have proper stack traces', () => {
      const error = new VanaError('Test error')
      
      expect(error.stack).toBeDefined()
      expect(typeof error.stack).toBe('string')
      expect(error.stack).toContain('VanaError')
    })
  })

  describe('Error serialization', () => {
    it('should be JSON serializable', () => {
      const error = new RelayerError('Test error', 500, { detail: 'test' })
      
      // Errors don't serialize message by default in JSON.stringify
      // Test that it can be serialized without throwing
      expect(() => JSON.stringify(error)).not.toThrow()
      
      const serialized = JSON.stringify(error)
      expect(serialized).toContain('RELAYER_ERROR')
      expect(serialized).toContain('500')
    })

    it('should maintain message in string conversion', () => {
      const error = new UserRejectedRequestError('Custom message')
      
      expect(error.toString()).toContain('Custom message')
      expect(String(error)).toContain('Custom message')
    })
  })
})