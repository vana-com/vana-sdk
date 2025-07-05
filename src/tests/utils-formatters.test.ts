import { describe, it, expect } from 'vitest'
import { 
  formatNumber,
  formatEth,
  formatToken,
  shortenAddress
} from '../utils/formatters'

describe('Formatter Utils', () => {
  describe('formatNumber', () => {
    it('should format bigint to number', () => {
      expect(formatNumber(BigInt(12345))).toBe(12345)
      expect(formatNumber(BigInt(0))).toBe(0)
      expect(formatNumber(BigInt(999999999999999))).toBe(999999999999999)
    })

    it('should format string to number', () => {
      expect(formatNumber('12345')).toBe(12345)
      expect(formatNumber('0')).toBe(0)
      expect(formatNumber('999.99')).toBe(999.99)
    })

    it('should format number to number (passthrough)', () => {
      expect(formatNumber(12345)).toBe(12345)
      expect(formatNumber(0)).toBe(0)
      expect(formatNumber(999.99)).toBe(999.99)
    })

    it('should handle negative numbers', () => {
      expect(formatNumber(BigInt(-100))).toBe(-100)
      expect(formatNumber('-123.45')).toBe(-123.45)
      expect(formatNumber(-999)).toBe(-999)
    })

    it('should handle decimal strings', () => {
      expect(formatNumber('123.456789')).toBe(123.456789)
      expect(formatNumber('0.001')).toBe(0.001)
    })

    it('should handle scientific notation strings', () => {
      expect(formatNumber('1e5')).toBe(100000)
      expect(formatNumber('1.23e-4')).toBe(0.000123)
    })
  })

  describe('formatEth', () => {
    it('should format wei to ETH with default decimals', () => {
      // formatEth slices to show up to 4 decimal places
      expect(formatEth(BigInt('1000000000000000000'))).toBe('1')
      expect(formatEth(BigInt('500000000000000000'))).toBe('0.5')
      expect(formatEth(BigInt('1234567890123456789'))).toBe('1.2345')
    })

    it('should format wei to ETH with custom decimals', () => {
      expect(formatEth(BigInt('1000000000000000000'), 2)).toBe('1')
      expect(formatEth(BigInt('1234567890123456789'), 6)).toBe('1.234567')
      expect(formatEth(BigInt('1000000000000000000'), 0)).toBe('1')
    })

    it('should handle string wei values', () => {
      expect(formatEth('1000000000000000000')).toBe('1')
      expect(formatEth('0')).toBe('0')
    })

    it('should handle number wei values', () => {
      expect(formatEth(1000000000000000000)).toBe('1')
      expect(formatEth(0)).toBe('0')
    })

    it('should handle small wei amounts', () => {
      expect(formatEth(BigInt('1000000000000000'))).toBe('0.001') // 0.001 ETH
      expect(formatEth(BigInt('1000000000000'))).toBe('0.0000') // 0.000001 ETH (truncated)
    })

    it('should handle large wei amounts', () => {
      expect(formatEth(BigInt('1000000000000000000000'))).toBe('1000') // 1000 ETH
    })

    it('should handle negative amounts', () => {
      expect(formatEth(BigInt('-1000000000000000000'))).toBe('-1')
    })
  })

  describe('formatToken', () => {
    it('should format token amounts with decimals', () => {
      expect(formatToken(BigInt('1000000000000000000'), 18)).toBe('1')
      expect(formatToken(BigInt('500000000000000000'), 18)).toBe('0.5')
    })

    it('should handle different decimal places', () => {
      // USDC has 6 decimals
      expect(formatToken(BigInt('1000000'), 6)).toBe('1')
      expect(formatToken(BigInt('1500000'), 6)).toBe('1.5')
    })

    it('should handle tokens with no decimals', () => {
      expect(formatToken(BigInt('100'), 0)).toBe('100')
    })

    it('should handle string amounts', () => {
      expect(formatToken('1000000000000000000', 18)).toBe('1')
    })

    it('should handle number amounts', () => {
      expect(formatToken(1000000, 6)).toBe('1')
    })

    it('should handle zero amounts', () => {
      expect(formatToken(BigInt('0'), 18)).toBe('0')
    })

    it('should handle fractional tokens', () => {
      expect(formatToken(BigInt('1234567890123456789'), 18)).toBe('1.2345')
    })

    it('should handle very small amounts', () => {
      expect(formatToken(BigInt('1'), 18)).toBe('0.0000')
    })

    it('should handle large amounts', () => {
      expect(formatToken(BigInt('1000000000000000000000000'), 18)).toBe('1000000')
    })

    it('should handle custom display decimals', () => {
      expect(formatToken(BigInt('1234567890123456789'), 18, 2)).toBe('1.23')
      expect(formatToken(BigInt('1234567890123456789'), 18, 6)).toBe('1.234567')
    })
  })

  describe('shortenAddress', () => {
    const fullAddress = '0x1234567890123456789012345678901234567890'

    it('should shorten long addresses with default format', () => {
      const shortened = shortenAddress(fullAddress)
      expect(shortened).toBe('0x1234...7890')
      expect(shortened.length).toBe(13) // 0x + 4 + ... + 4
    })

    it('should handle addresses without 0x prefix', () => {
      const noPrefixAddress = '1234567890123456789012345678901234567890'
      const shortened = shortenAddress(noPrefixAddress)
      expect(shortened).toBe('123456...7890')
    })

    it('should return short addresses unchanged', () => {
      const shortAddress = '0x1234'
      expect(shortenAddress(shortAddress)).toBe('0x1234')
    })

    it('should handle empty string', () => {
      expect(shortenAddress('')).toBe('')
    })

    it('should handle very short strings', () => {
      expect(shortenAddress('0x')).toBe('0x')
      expect(shortenAddress('123')).toBe('123')
    })

    it('should handle medium length addresses', () => {
      const mediumAddress = '0x123456789012'
      const shortened = shortenAddress(mediumAddress)
      expect(shortened).toBe('0x1234...9012')
    })

    it('should handle exact boundary case', () => {
      // Address that's exactly 10 chars - should be shortened since >= 10
      const boundaryAddress = '0x12345678'
      expect(shortenAddress(boundaryAddress)).toBe('0x1234...5678')
    })

    it('should preserve case in shortened addresses', () => {
      const mixedCaseAddress = '0xAbCdEf1234567890123456789012345678901234'
      const shortened = shortenAddress(mixedCaseAddress)
      expect(shortened).toBe('0xAbCd...1234')
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle invalid number strings in formatNumber', () => {
      // Note: Number() in JavaScript doesn't throw, it returns NaN
      expect(formatNumber('not-a-number')).toBeNaN()
      expect(formatNumber('123abc')).toBeNaN()
    })

    it('should handle extremely large numbers', () => {
      const veryLarge = BigInt('999999999999999999999999999999999999999')
      expect(formatNumber(veryLarge)).toBe(Number(veryLarge))
    })

    it('should handle zero values consistently', () => {
      expect(formatNumber(0)).toBe(0)
      expect(formatEth(0)).toBe('0')
      expect(formatToken(0, 18)).toBe('0')
      expect(shortenAddress('0x0000000000000000000000000000000000000000'))
        .toBe('0x0000...0000')
    })
  })
})