/**
 * Comprehensive error tracking and classification system for load testing
 */
import chalk from 'chalk';

export interface ErrorDetails {
  errorType: string;
  errorCode?: string;
  message: string;
  stack?: string;
  context: {
    userId: string;
    phase: string;
    timestamp: number;
    duration?: number;
    walletAddress?: string;
    transactionHash?: string;
    step?: string;
  };
  metadata?: Record<string, any>;
}

export interface ErrorSummary {
  errorType: string;
  count: number;
  percentage: number;
  firstOccurrence: number;
  lastOccurrence: number;
  sampleMessages: string[];
  affectedUsers: string[];
  commonContext?: Record<string, any>;
}

export class ErrorTracker {
  private errors: ErrorDetails[] = [];
  private errorCounts = new Map<string, number>();

  /**
   * Track an error with automatic classification
   */
  trackError(error: Error | string, context: ErrorDetails['context'], metadata?: Record<string, any>): void {
    const errorDetails = this.classifyError(error, context, metadata);
    this.errors.push(errorDetails);
    
    const key = errorDetails.errorType;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // Log error in real-time for debugging
    if (process.env.NODE_ENV !== 'test') {
      console.log(chalk.red(`❌ [${context.userId}] ${errorDetails.errorType}: ${errorDetails.message}`));
    }
  }

  /**
   * Classify errors into meaningful categories
   */
  private classifyError(error: Error | string, context: ErrorDetails['context'], metadata?: Record<string, any>): ErrorDetails {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    // Network/Connection Errors
    if (this.isNetworkError(message)) {
      return {
        errorType: 'NETWORK_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'network' }
      };
    }

    // Blockchain/Transaction Errors
    if (this.isBlockchainError(message)) {
      return {
        errorType: 'BLOCKCHAIN_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'blockchain' }
      };
    }

    // Funding/Balance Errors
    if (this.isFundingError(message)) {
      return {
        errorType: 'FUNDING_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'funding' }
      };
    }

    // Personal Server/API Errors
    if (this.isPersonalServerError(message)) {
      return {
        errorType: 'PERSONAL_SERVER_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'api' }
      };
    }

    // Storage/File Errors
    if (this.isStorageError(message)) {
      return {
        errorType: 'STORAGE_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'storage' }
      };
    }

    // AI/Inference Errors
    if (this.isAIError(message)) {
      return {
        errorType: 'AI_INFERENCE_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'ai' }
      };
    }

    // Rate Limiting Errors
    if (this.isRateLimitError(message)) {
      return {
        errorType: 'RATE_LIMIT_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'rate_limit' }
      };
    }

    // Timeout Errors
    if (this.isTimeoutError(message)) {
      return {
        errorType: 'TIMEOUT_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'timeout' }
      };
    }

    // Authentication/Authorization Errors
    if (this.isAuthError(message)) {
      return {
        errorType: 'AUTH_ERROR',
        errorCode: this.extractErrorCode(message),
        message,
        stack,
        context,
        metadata: { ...metadata, category: 'auth' }
      };
    }

    // Unknown/Uncategorized Errors
    return {
      errorType: 'UNKNOWN_ERROR',
      message,
      stack,
      context,
      metadata: { ...metadata, category: 'unknown' }
    };
  }

  /**
   * Error classification helpers
   */
  private isNetworkError(message: string): boolean {
    const networkPatterns = [
      /network error/i,
      /connection refused/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
      /fetch failed/i,
      /network request failed/i
    ];
    return networkPatterns.some(pattern => pattern.test(message));
  }

  private isBlockchainError(message: string): boolean {
    const blockchainPatterns = [
      /insufficient funds/i,
      /gas.*fee/i,
      /nonce.*high/i,
      /replacement transaction underpriced/i,
      /transaction.*reverted/i,
      /execution reverted/i,
      /contract call failed/i,
      /transaction failed/i
    ];
    return blockchainPatterns.some(pattern => pattern.test(message));
  }

  private isFundingError(message: string): boolean {
    const fundingPatterns = [
      /wallet funding failed/i,
      /no funded wallets available/i,
      /funding.*failed/i,
      /balance.*insufficient/i,
      /pre-funding.*failed/i
    ];
    return fundingPatterns.some(pattern => pattern.test(message));
  }

  private isPersonalServerError(message: string): boolean {
    const serverPatterns = [
      /personal server/i,
      /operation.*failed/i,
      /server.*error/i,
      /api.*error/i,
      /status.*[45]\d\d/i,
      /internal server error/i,
      /service unavailable/i
    ];
    return serverPatterns.some(pattern => pattern.test(message));
  }

  private isStorageError(message: string): boolean {
    const storagePatterns = [
      /storage.*failed/i,
      /upload.*failed/i,
      /file.*error/i,
      /gcs.*error/i,
      /google cloud storage/i,
      /bucket.*error/i
    ];
    return storagePatterns.some(pattern => pattern.test(message));
  }

  private isAIError(message: string): boolean {
    const aiPatterns = [
      /ai.*inference/i,
      /replicate.*error/i,
      /prediction.*failed/i,
      /model.*error/i,
      /inference.*failed/i
    ];
    return aiPatterns.some(pattern => pattern.test(message));
  }

  private isRateLimitError(message: string): boolean {
    const rateLimitPatterns = [
      /rate.*limit/i,
      /too many requests/i,
      /quota.*exceeded/i,
      /throttled/i,
      /status.*429/i
    ];
    return rateLimitPatterns.some(pattern => pattern.test(message));
  }

  private isTimeoutError(message: string): boolean {
    const timeoutPatterns = [
      /timeout/i,
      /timed out/i,
      /request.*timeout/i,
      /operation.*timeout/i
    ];
    return timeoutPatterns.some(pattern => pattern.test(message));
  }

  private isAuthError(message: string): boolean {
    const authPatterns = [
      /unauthorized/i,
      /authentication.*failed/i,
      /invalid.*signature/i,
      /access.*denied/i,
      /status.*401/i,
      /status.*403/i
    ];
    return authPatterns.some(pattern => pattern.test(message));
  }

  private extractErrorCode(message: string): string | undefined {
    // Extract HTTP status codes
    const httpMatch = message.match(/status.*?(\d{3})/i);
    if (httpMatch) return `HTTP_${httpMatch[1]}`;

    // Extract error codes from various services
    const codeMatch = message.match(/code[:\s]+([A-Z_0-9]+)/i);
    if (codeMatch) return codeMatch[1];

    return undefined;
  }

  /**
   * Generate comprehensive error summary
   */
  generateSummary(totalUsers: number): {
    totalErrors: number;
    errorRate: number;
    errorsByType: ErrorSummary[];
    timeline: Array<{ timestamp: number; errorType: string; count: number }>;
    recommendations: string[];
  } {
    const totalErrors = this.errors.length;
    const errorRate = totalUsers > 0 ? (totalErrors / totalUsers) * 100 : 0;

    // Group errors by type
    const errorsByType = this.groupErrorsByType();

    // Generate timeline (5-minute buckets)
    const timeline = this.generateTimeline();

    // Generate recommendations based on error patterns
    const recommendations = this.generateRecommendations(errorsByType);

    return {
      totalErrors,
      errorRate,
      errorsByType,
      timeline,
      recommendations
    };
  }

  private groupErrorsByType(): ErrorSummary[] {
    const grouped = new Map<string, ErrorDetails[]>();
    
    this.errors.forEach(error => {
      const key = error.errorType;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(error);
    });

    return Array.from(grouped.entries()).map(([errorType, errors]) => {
      const count = errors.length;
      const percentage = (count / this.errors.length) * 100;
      const timestamps = errors.map(e => e.context.timestamp);
      const firstOccurrence = Math.min(...timestamps);
      const lastOccurrence = Math.max(...timestamps);
      
      // Sample messages (up to 3 unique ones)
      const uniqueMessages = [...new Set(errors.map(e => e.message))];
      const sampleMessages = uniqueMessages.slice(0, 3);
      
      // Affected users
      const affectedUsers = [...new Set(errors.map(e => e.context.userId))];

      return {
        errorType,
        count,
        percentage,
        firstOccurrence,
        lastOccurrence,
        sampleMessages,
        affectedUsers
      };
    }).sort((a, b) => b.count - a.count); // Sort by frequency
  }

  private generateTimeline(): Array<{ timestamp: number; errorType: string; count: number }> {
    const bucketSize = 5 * 60 * 1000; // 5 minutes in milliseconds
    const buckets = new Map<string, Map<string, number>>();

    this.errors.forEach(error => {
      const bucket = Math.floor(error.context.timestamp / bucketSize) * bucketSize;
      const bucketKey = bucket.toString();
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, new Map());
      }
      
      const errorTypeCounts = buckets.get(bucketKey)!;
      errorTypeCounts.set(error.errorType, (errorTypeCounts.get(error.errorType) || 0) + 1);
    });

    const timeline: Array<{ timestamp: number; errorType: string; count: number }> = [];
    
    buckets.forEach((errorTypeCounts, bucketKey) => {
      const timestamp = parseInt(bucketKey);
      errorTypeCounts.forEach((count, errorType) => {
        timeline.push({ timestamp, errorType, count });
      });
    });

    return timeline.sort((a, b) => a.timestamp - b.timestamp);
  }

  private generateRecommendations(errorsByType: ErrorSummary[]): string[] {
    const recommendations: string[] = [];

    errorsByType.forEach(errorSummary => {
      switch (errorSummary.errorType) {
        case 'NETWORK_ERROR':
          if (errorSummary.percentage > 10) {
            recommendations.push('High network error rate detected. Consider implementing retry logic or checking network connectivity.');
          }
          break;
        case 'RATE_LIMIT_ERROR':
          if (errorSummary.percentage > 5) {
            recommendations.push('Rate limiting detected. Consider reducing concurrent users or implementing backoff strategies.');
          }
          break;
        case 'FUNDING_ERROR':
          if (errorSummary.percentage > 2) {
            recommendations.push('Funding issues detected. Check relayer balance and increase funding amounts if needed.');
          }
          break;
        case 'BLOCKCHAIN_ERROR':
          if (errorSummary.percentage > 5) {
            recommendations.push('Blockchain transaction failures. Consider adjusting gas fees or checking network congestion.');
          }
          break;
        case 'TIMEOUT_ERROR':
          if (errorSummary.percentage > 8) {
            recommendations.push('High timeout rate. Consider increasing timeout values or reducing load.');
          }
          break;
        case 'PERSONAL_SERVER_ERROR':
          if (errorSummary.percentage > 3) {
            recommendations.push('Personal server issues detected. Check server capacity and error logs.');
          }
          break;
      }
    });

    return recommendations;
  }

  /**
   * Display formatted error report
   */
  displayReport(totalUsers: number): void {
    const summary = this.generateSummary(totalUsers);
    
    console.log(chalk.red('\n🚨 Error Analysis Report\n'));
    console.log(chalk.gray('═'.repeat(80)));
    
    console.log(`📊 Overall Statistics:`);
    console.log(`   Total Errors: ${chalk.red(summary.totalErrors)}`);
    console.log(`   Error Rate: ${chalk.red(summary.errorRate.toFixed(2))}%`);
    console.log(`   Total Users: ${totalUsers}`);
    
    if (summary.errorsByType.length > 0) {
      console.log(chalk.gray('\n─'.repeat(80)));
      console.log(`🔍 Error Breakdown by Type:\n`);
      
      summary.errorsByType.forEach((error, index) => {
        const icon = this.getErrorIcon(error.errorType);
        console.log(`${index + 1}. ${icon} ${chalk.yellow(error.errorType)}`);
        console.log(`   Count: ${chalk.red(error.count)} (${error.percentage.toFixed(1)}%)`);
        console.log(`   Affected Users: ${error.affectedUsers.length}`);
        console.log(`   First/Last: ${new Date(error.firstOccurrence).toLocaleTimeString()} - ${new Date(error.lastOccurrence).toLocaleTimeString()}`);
        
        if (error.sampleMessages.length > 0) {
          console.log(`   Sample Messages:`);
          error.sampleMessages.forEach(msg => {
            const truncated = msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
            console.log(`     • ${chalk.gray(truncated)}`);
          });
        }
        console.log('');
      });
    }

    if (summary.recommendations.length > 0) {
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`💡 Recommendations:\n`);
      summary.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${chalk.cyan(rec)}`);
      });
      console.log('');
    }

    console.log(chalk.gray('═'.repeat(80)));
  }

  private getErrorIcon(errorType: string): string {
    const icons: Record<string, string> = {
      'NETWORK_ERROR': '🌐',
      'BLOCKCHAIN_ERROR': '⛓️',
      'FUNDING_ERROR': '💰',
      'PERSONAL_SERVER_ERROR': '🖥️',
      'STORAGE_ERROR': '💾',
      'AI_INFERENCE_ERROR': '🤖',
      'RATE_LIMIT_ERROR': '🚦',
      'TIMEOUT_ERROR': '⏰',
      'AUTH_ERROR': '🔐',
      'UNKNOWN_ERROR': '❓'
    };
    return icons[errorType] || '❌';
  }

  /**
   * Export errors to JSON for further analysis
   */
  exportToJson(): string {
    return JSON.stringify({
      errors: this.errors,
      summary: this.generateSummary(this.errors.length),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Clear all tracked errors
   */
  clear(): void {
    this.errors = [];
    this.errorCounts.clear();
  }

  /**
   * Get raw error data for custom analysis
   */
  getRawErrors(): ErrorDetails[] {
    return [...this.errors];
  }
}

// Global error tracker instance
export const globalErrorTracker = new ErrorTracker();
