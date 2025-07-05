import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { GoogleDriveStorage, GoogleDriveConfig } from '../providers/google-drive'
import { StorageError } from '../index'

// Mock fetch globally
global.fetch = vi.fn()

describe('GoogleDriveStorage', () => {
  let storage: GoogleDriveStorage
  let mockConfig: GoogleDriveConfig
  let mockFetch: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Ensure fetch mock exists and is properly reset
    if (!global.fetch) {
      global.fetch = vi.fn()
    }
    mockFetch = global.fetch as Mock
    mockFetch.mockReset()

    mockConfig = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      folderId: 'test-folder-id'
    }

    storage = new GoogleDriveStorage(mockConfig)
  })

  describe('Configuration', () => {
    it('should initialize with valid configuration', () => {
      expect(storage).toBeInstanceOf(GoogleDriveStorage)
      expect(storage.getConfig()).toEqual({
        name: 'Google Drive',
        type: 'google-drive',
        requiresAuth: true,
        features: {
          upload: true,
          download: true,
          list: true,
          delete: true
        }
      })
    })

    it('should throw error when access token is missing', () => {
      expect(() => new GoogleDriveStorage({ accessToken: '' })).toThrow(StorageError)
      expect(() => new GoogleDriveStorage({ accessToken: '' })).toThrow('Google Drive access token is required')
    })

    it('should work with minimal configuration (access token only)', () => {
      const minimalConfig = { accessToken: 'test-token' }
      const minimalStorage = new GoogleDriveStorage(minimalConfig)
      
      expect(minimalStorage.getConfig()).toEqual({
        name: 'Google Drive',
        type: 'google-drive',
        requiresAuth: true,
        features: {
          upload: true,
          download: true,
          list: true,
          delete: true
        }
      })
    })
  })

  describe('Upload', () => {
    it('should successfully upload a file to specific folder', async () => {
      const testFile = new Blob(['test content'], { type: 'text/plain' })
      const mockUploadResponse = {
        id: 'test-file-id-123',
        name: 'test.txt',
        mimeType: 'text/plain',
        size: '12'
      }

      // Mock upload request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse)
      })

      // Mock permissions request (makeFilePublic)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'permission-id' })
      })

      const result = await storage.upload(testFile, 'test.txt')

      expect(result).toEqual({
        url: 'https://drive.google.com/file/d/test-file-id-123/view',
        size: 12,
        contentType: 'text/plain',
        metadata: {
          id: 'test-file-id-123',
          name: 'test.txt',
          driveUrl: 'https://drive.google.com/file/d/test-file-id-123/view',
          downloadUrl: 'https://drive.google.com/uc?id=test-file-id-123&export=download'
        }
      })

      // Verify upload request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Content-Type': expect.stringContaining('multipart/related; boundary=')
          },
          body: expect.any(Blob)
        })
      )

      // Verify permissions request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/test-file-id-123/permissions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        })
      )
    })

    it('should upload to root folder when no folderId configured', async () => {
      const configNoFolder = { accessToken: 'test-token' }
      const storageNoFolder = new GoogleDriveStorage(configNoFolder)
      
      const testFile = new Blob(['test content'], { type: 'text/plain' })
      const mockUploadResponse = {
        id: 'test-file-id-123',
        name: 'test.txt'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await storageNoFolder.upload(testFile, 'test.txt')

      // Verify that the upload request body doesn't contain parents field
      const uploadCall = mockFetch.mock.calls[0]
      expect(uploadCall[0]).toContain('uploadType=multipart')
    })

    it('should generate filename when not provided', async () => {
      const testFile = new Blob(['test'], { type: 'application/octet-stream' })
      const mockUploadResponse = {
        id: 'test-file-id-123',
        name: 'vana-file-1234567890.dat'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      const result = await storage.upload(testFile)

      expect(result.metadata?.name).toMatch(/^vana-file-\d+\.dat$/)
      expect(result.contentType).toBe('application/octet-stream')
    })

    it('should handle upload failure', async () => {
      const testFile = new Blob(['test'], { type: 'text/plain' })

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized: Invalid access token'),
        json: () => Promise.reject(new Error('Response is not JSON'))
      })

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError)
      await expect(storage.upload(testFile)).rejects.toThrow('Failed to upload to Google Drive: Unauthorized: Invalid access token')
    })

    it('should handle network errors during upload', async () => {
      const testFile = new Blob(['test'], { type: 'text/plain' })

      mockFetch.mockRejectedValue(new Error('Network connection failed'))

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError)
      await expect(storage.upload(testFile)).rejects.toThrow('Google Drive upload error: Network connection failed')
    })

    it('should continue even if makeFilePublic fails', async () => {
      const testFile = new Blob(['test content'], { type: 'text/plain' })
      const mockUploadResponse = {
        id: 'test-file-id-123',
        name: 'test.txt'
      }

      // Mock successful upload first, then network error for permissions request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse)
        })
        .mockRejectedValueOnce(new Error('Network error during permissions request'))

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await storage.upload(testFile, 'test.txt')

      expect(result.url).toBe('https://drive.google.com/file/d/test-file-id-123/view')
      expect(consoleSpy).toHaveBeenCalledWith('Failed to make Google Drive file public:', expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should create proper multipart request body', async () => {
      const testFile = new Blob(['test content'], { type: 'text/plain' })
      const mockUploadResponse = { id: 'test-id', name: 'test.txt' }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse)
      })

      await storage.upload(testFile, 'important-file.txt')

      const uploadCall = mockFetch.mock.calls[0]
      const requestBody = uploadCall[1].body as Blob
      const bodyText = await requestBody.text()

      // Verify multipart structure
      expect(bodyText).toContain('Content-Type: application/json')
      expect(bodyText).toContain('"name":"important-file.txt"')
      expect(bodyText).toContain('"parents":["test-folder-id"]')
      expect(bodyText).toContain('Content-Type: text/plain')
      expect(bodyText).toContain('test content')
    })
  })

  describe('Download', () => {
    it('should successfully download a file by Drive URL', async () => {
      const expectedBlob = new Blob(['downloaded content'], { type: 'text/plain' })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob)
      })

      const result = await storage.download('https://drive.google.com/file/d/test-file-id-123/view')

      expect(result).toBe(expectedBlob)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/test-file-id-123?alt=media',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      )
    })

    it('should successfully download from download URL format', async () => {
      const expectedBlob = new Blob(['downloaded content'], { type: 'text/plain' })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob)
      })

      const result = await storage.download('https://drive.google.com/uc?id=test-file-id-123&export=download')

      expect(result).toBe(expectedBlob)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/test-file-id-123?alt=media',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      )
    })

    it('should handle file ID only format', async () => {
      const expectedBlob = new Blob(['content'], { type: 'text/plain' })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob)
      })

      await storage.download('test-file-id-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/test-file-id-123?alt=media',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      )
    })

    it('should handle invalid URL format', async () => {
      await expect(storage.download('https://example.com/invalid-url')).rejects.toThrow(StorageError)
      await expect(storage.download('https://example.com/invalid-url')).rejects.toThrow('Invalid Google Drive URL format')
    })

    it('should handle download failures', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('File not found'),
        blob: () => Promise.reject(new Error('Response is not blob'))
      })

      await expect(storage.download('https://drive.google.com/file/d/missing-id/view')).rejects.toThrow(StorageError)
      await expect(storage.download('https://drive.google.com/file/d/missing-id/view')).rejects.toThrow('Failed to download from Google Drive: File not found')
    })

    it('should handle network errors during download', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'))

      await expect(storage.download('https://drive.google.com/file/d/test-id/view')).rejects.toThrow(StorageError)
      await expect(storage.download('https://drive.google.com/file/d/test-id/view')).rejects.toThrow('Google Drive download error: Connection timeout')
    })
  })

  describe('List', () => {
    it('should successfully list files from configured folder', async () => {
      const mockResponse = {
        files: [
          {
            id: 'file-1',
            name: 'document1.txt',
            size: '1024',
            mimeType: 'text/plain',
            createdTime: '2023-01-01T00:00:00Z',
            webViewLink: 'https://drive.google.com/file/d/file-1/view'
          },
          {
            id: 'file-2',
            name: 'document2.pdf',
            size: '2048',
            mimeType: 'application/pdf',
            createdTime: '2023-01-02T00:00:00Z',
            webViewLink: 'https://drive.google.com/file/d/file-2/view'
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const files = await storage.list({ limit: 10 })

      expect(files).toHaveLength(2)
      expect(files[0]).toEqual({
        id: 'file-1',
        name: 'document1.txt',
        url: 'https://drive.google.com/file/d/file-1/view',
        size: 1024,
        contentType: 'text/plain',
        createdAt: new Date('2023-01-01T00:00:00Z'),
        metadata: {
          id: 'file-1',
          driveUrl: 'https://drive.google.com/file/d/file-1/view',
          downloadUrl: 'https://drive.google.com/uc?id=file-1&export=download'
        }
      })

      // Verify query parameters
      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('q=trashed+%3D+false+and+%27test-folder-id%27+in+parents')
      expect(calledUrl).toContain('pageSize=10')
      expect(calledUrl).toContain('fields=files%28id%2Cname%2Csize%2CmimeType%2CcreatedTime%2CwebViewLink%29')
    })

    it('should list files from root when no folder configured', async () => {
      const configNoFolder = { accessToken: 'test-token' }
      const storageNoFolder = new GoogleDriveStorage(configNoFolder)
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      })

      await storageNoFolder.list()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('q=trashed+%3D+false')
      expect(calledUrl).not.toContain('in+parents')
    })

    it('should handle name pattern filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      })

      await storage.list({ namePattern: 'vana', limit: 25 })

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('name+contains+%27vana%27')
      expect(calledUrl).toContain('pageSize=25')
    })

    it('should handle pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      })

      await storage.list({ limit: 50, offset: 'next-page-token' })

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('pageSize=50')
      expect(calledUrl).toContain('pageToken=next-page-token')
    })

    it('should use default limit when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      })

      await storage.list()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('pageSize=100')
    })

    it('should handle list API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        json: () => Promise.reject(new Error('Response is not JSON'))
      })

      await expect(storage.list()).rejects.toThrow(StorageError)
      await expect(storage.list()).rejects.toThrow('Failed to list Google Drive files: Unauthorized')
    })

    it('should handle files without size gracefully', async () => {
      const mockResponse = {
        files: [
          {
            id: 'file-no-size',
            name: 'folder',
            mimeType: 'application/vnd.google-apps.folder',
            createdTime: '2023-01-01T00:00:00Z',
            webViewLink: 'https://drive.google.com/drive/folders/file-no-size'
            // No size field for folders
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const files = await storage.list()

      expect(files).toHaveLength(1)
      expect(files[0].size).toBe(0) // Should default to 0
      expect(files[0].contentType).toBe('application/vnd.google-apps.folder')
    })
  })

  describe('Delete', () => {
    it('should successfully delete a file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      const result = await storage.delete('https://drive.google.com/file/d/test-file-id-123/view')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/test-file-id-123',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      )
    })

    it('should handle 404 errors gracefully (already deleted)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('File not found')
      })

      const result = await storage.delete('https://drive.google.com/file/d/missing-id/view')

      expect(result).toBe(true) // Should still return true for 404
    })

    it('should handle other delete errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden: Insufficient permissions'),
        json: () => Promise.reject(new Error('Response is not JSON'))
      })

      await expect(storage.delete('https://drive.google.com/file/d/test-id/view')).rejects.toThrow(StorageError)
      await expect(storage.delete('https://drive.google.com/file/d/test-id/view')).rejects.toThrow('Failed to delete from Google Drive: Forbidden: Insufficient permissions')
    })

    it('should handle invalid URL format in delete', async () => {
      await expect(storage.delete('https://invalid-url.com')).rejects.toThrow(StorageError)
      await expect(storage.delete('https://invalid-url.com')).rejects.toThrow('Invalid Google Drive URL format')
    })
  })

  describe('File ID Extraction', () => {
    it('should extract file ID from various URL formats', async () => {
      const testCases = [
        { url: 'https://drive.google.com/file/d/test-file-id-123/view', expected: 'test-file-id-123' },
        { url: 'https://drive.google.com/uc?id=test-file-id-456&export=download', expected: 'test-file-id-456' },
        { url: 'test-file-id-789', expected: 'test-file-id-789' }
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test']))
      })

      for (const testCase of testCases) {
        await storage.download(testCase.url)
        
        // Verify the correct file ID was extracted by checking the fetch URL
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
        expect(lastCall[0]).toBe(`https://www.googleapis.com/drive/v3/files/${testCase.expected}?alt=media`)
      }
    })

    it('should handle invalid file ID formats', async () => {
      // Reset mock to ensure clean state
      mockFetch.mockReset()
      
      const invalidUrls = [
        'https://example.com/not-google-drive',
        'https://drive.google.com/invalid-format',
        'https://invalid-domain.com/random/path',
        ''  // Empty string
      ]

      for (const url of invalidUrls) {
        await expect(storage.download(url)).rejects.toThrow('Invalid Google Drive URL format')
      }
    })
  })

  describe('Token Refresh', () => {
    it('should successfully refresh access token', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      })

      const newToken = await storage.refreshAccessToken()

      expect(newToken).toBe('new-access-token')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: expect.any(URLSearchParams)
        })
      )

      // Verify the request body
      const requestBody = mockFetch.mock.calls[0][1].body as URLSearchParams
      expect(requestBody.get('client_id')).toBe('test-client-id')
      expect(requestBody.get('client_secret')).toBe('test-client-secret')
      expect(requestBody.get('refresh_token')).toBe('test-refresh-token')
      expect(requestBody.get('grant_type')).toBe('refresh_token')
    })

    it('should throw error when refresh credentials are missing', async () => {
      const configWithoutRefresh = { accessToken: 'test-token' }
      const storageWithoutRefresh = new GoogleDriveStorage(configWithoutRefresh)

      await expect(storageWithoutRefresh.refreshAccessToken()).rejects.toThrow(StorageError)
      await expect(storageWithoutRefresh.refreshAccessToken()).rejects.toThrow('Refresh token, client ID, and client secret are required for token refresh')
    })

    it('should handle token refresh failures', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid refresh token'),
        json: () => Promise.reject(new Error('Response is not JSON'))
      })

      await expect(storage.refreshAccessToken()).rejects.toThrow(StorageError)
      await expect(storage.refreshAccessToken()).rejects.toThrow('Failed to refresh Google Drive token: Invalid refresh token')
    })

    it('should handle network errors during token refresh', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'))

      await expect(storage.refreshAccessToken()).rejects.toThrow(StorageError)
      await expect(storage.refreshAccessToken()).rejects.toThrow('Google Drive token refresh error: Network timeout')
    })

    it('should update internal access token after successful refresh', async () => {
      const mockTokenResponse = {
        access_token: 'updated-access-token',
        expires_in: 3600
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      })

      await storage.refreshAccessToken()

      // Verify the internal token was updated by making another request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      })

      await storage.list()

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer updated-access-token'
          }
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should preserve StorageError instances', async () => {
      const originalError = new StorageError('Original error', 'TEST_CODE', 'google-drive')
      
      mockFetch.mockImplementation(() => {
        throw originalError
      })

      try {
        await storage.upload(new Blob(['test']))
      } catch (error) {
        expect(error).toBe(originalError) // Should be the exact same instance
      }
    })

    it('should wrap unknown errors in StorageError', async () => {
      mockFetch.mockImplementation(() => {
        throw new TypeError('Something went wrong')
      })

      try {
        await storage.upload(new Blob(['test']))
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect(error.message).toContain('Google Drive upload error: Something went wrong')
        expect(error.code).toBe('UPLOAD_ERROR')
        expect(error.provider).toBe('google-drive')
      }
    })

    it('should use correct error codes for different operations', async () => {
      const errorCases = [
        {
          operation: () => storage.upload(new Blob(['test'])),
          expectedCode: 'UPLOAD_ERROR'
        },
        {
          operation: () => storage.download('https://drive.google.com/file/d/test/view'),
          expectedCode: 'DOWNLOAD_ERROR'
        },
        {
          operation: () => storage.list(),
          expectedCode: 'LIST_ERROR'
        },
        {
          operation: () => storage.delete('https://drive.google.com/file/d/test/view'),
          expectedCode: 'DELETE_ERROR'
        }
      ]

      for (const errorCase of errorCases) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'))
        
        try {
          await errorCase.operation()
        } catch (error) {
          expect(error).toBeInstanceOf(StorageError)
          expect(error.code).toBe(errorCase.expectedCode)
          expect(error.provider).toBe('google-drive')
        }
      }
    })
  })
})