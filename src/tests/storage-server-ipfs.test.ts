import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { ServerIPFSStorage, StorageError } from '../storage'

// Mock fetch globally
global.fetch = vi.fn()

describe('ServerIPFSStorage', () => {
  let storage: ServerIPFSStorage
  const mockConfig = {
    uploadEndpoint: '/api/upload',
    baseUrl: 'https://example.com'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    storage = new ServerIPFSStorage(mockConfig)
  })

  describe('Constructor', () => {
    it('should initialize with upload endpoint', () => {
      expect(storage).toBeInstanceOf(ServerIPFSStorage)
    })

    it('should throw error if no upload endpoint provided', () => {
      expect(() => {
        new ServerIPFSStorage({ uploadEndpoint: '' })
      }).toThrow(StorageError)
    })

    it('should use baseUrl if provided', () => {
      const configWithBase = {
        uploadEndpoint: '/api/upload',
        baseUrl: 'https://api.example.com'
      }
      const storageWithBase = new ServerIPFSStorage(configWithBase)
      expect(storageWithBase).toBeInstanceOf(ServerIPFSStorage)
    })

    it('should work without baseUrl', () => {
      const configWithoutBase = {
        uploadEndpoint: '/api/upload'
      }
      const storageWithoutBase = new ServerIPFSStorage(configWithoutBase)
      expect(storageWithoutBase).toBeInstanceOf(ServerIPFSStorage)
    })
  })

  describe('upload', () => {
    it('should upload file successfully', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'], { type: 'text/plain' })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          url: 'https://ipfs.io/ipfs/QmTestHash',
          size: 12,
          contentType: 'text/plain'
        })
      })

      const result = await storage.upload(testFile, 'test.txt')

      expect(result).toEqual({
        url: 'https://ipfs.io/ipfs/QmTestHash',
        size: 12,
        contentType: 'text/plain',
        metadata: expect.objectContaining({
          fileName: 'test.txt',
          storage: 'app-managed-ipfs'
        })
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      )
    })

    it('should use auto-generated filename if none provided', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'])
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          url: 'https://ipfs.io/ipfs/QmTestHash',
          size: 12,
          contentType: 'application/octet-stream'
        })
      })

      await storage.upload(testFile)

      expect(mockFetch).toHaveBeenCalled()
      const callArgs = mockFetch.mock.calls[0]
      const formData = callArgs[1].body as FormData
      const fileName = formData.get('file')?.valueOf() as File
      expect(fileName.name).toMatch(/^vana-file-\d+\.dat$/)
    })

    it('should handle upload failure with error response', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'])
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error occurred')
      })

      await expect(storage.upload(testFile)).rejects.toThrow(
        'Server upload failed: 500 Internal Server Error - Server error occurred'
      )
    })

    it('should handle upload failure without success in response', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'])
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'Upload failed on server'
        })
      })

      await expect(storage.upload(testFile)).rejects.toThrow(
        'Server upload failed: Upload failed on server'
      )
    })

    it('should handle network errors', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'])
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(storage.upload(testFile)).rejects.toThrow(
        'Failed to upload to server: Network error'
      )
    })

    it('should handle JSON parsing errors', async () => {
      const mockFetch = fetch as Mock
      const testFile = new Blob(['test content'])
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      await expect(storage.upload(testFile)).rejects.toThrow(
        'Failed to upload to server: Invalid JSON'
      )
    })
  })

  describe('download', () => {
    it('should download file successfully', async () => {
      const mockFetch = fetch as Mock
      const testBlob = new Blob(['downloaded content'], { type: 'text/plain' })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(testBlob)
      })

      const result = await storage.download('https://ipfs.io/ipfs/QmTestHash')

      expect(result).toBe(testBlob)
      expect(mockFetch).toHaveBeenCalledWith('https://ipfs.io/ipfs/QmTestHash')
    })

    it('should handle download failure', async () => {
      const mockFetch = fetch as Mock
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(storage.download('https://ipfs.io/ipfs/QmMissing')).rejects.toThrow(
        'Failed to download file: 404 Not Found'
      )
    })

    it('should handle network errors during download', async () => {
      const mockFetch = fetch as Mock
      
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'))

      await expect(storage.download('https://ipfs.io/ipfs/QmTimeout')).rejects.toThrow(
        'Failed to download from server: Connection timeout'
      )
    })
  })

  describe('list', () => {
    it('should return empty array (not implemented)', async () => {
      const result = await storage.list()
      expect(result).toEqual([])
    })

    it('should return empty array with options', async () => {
      const result = await storage.list({ limit: 10 })
      expect(result).toEqual([])
    })
  })

  describe('delete', () => {
    it('should return false (not implemented)', async () => {
      const result = await storage.delete('https://ipfs.io/ipfs/QmTestHash')
      expect(result).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('should return provider configuration', () => {
      const config = storage.getConfig()
      
      expect(config).toEqual({
        name: 'Server-managed IPFS',
        type: 'server-ipfs',
        requiresAuth: false,
        features: {
          upload: true,
          download: true,
          list: false,
          delete: false
        }
      })
    })
  })
})