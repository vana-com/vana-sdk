#!/usr/bin/env node

/**
 * Test script to demonstrate the error tracking system
 * Intentionally generates various types of errors for classification
 */

import { globalErrorTracker } from '../src/utils/error-tracker.js';
import chalk from 'chalk';

function simulateErrors() {
  console.log(chalk.cyan('🧪 Testing Error Tracking System\n'));
  
  // Clear any existing errors
  globalErrorTracker.clear();
  
  // Simulate different types of errors
  const testErrors = [
    // Network errors
    {
      error: new Error('fetch failed: network request failed'),
      context: { userId: 'user-1', phase: 'ramp-up', timestamp: Date.now(), duration: 5000, step: 'api_call' }
    },
    {
      error: new Error('ECONNREFUSED: Connection refused'),
      context: { userId: 'user-2', phase: 'sustain', timestamp: Date.now() + 1000, duration: 3000, step: 'api_call' }
    },
    
    // Blockchain errors
    {
      error: new Error('insufficient funds for transfer'),
      context: { userId: 'user-3', phase: 'sustain', timestamp: Date.now() + 2000, duration: 2000, step: 'blockchain_tx', walletAddress: '0x123...abc' }
    },
    {
      error: new Error('replacement transaction underpriced'),
      context: { userId: 'user-4', phase: 'sustain', timestamp: Date.now() + 3000, duration: 1000, step: 'blockchain_tx', walletAddress: '0x456...def' }
    },
    
    // Personal server errors
    {
      error: new Error('Personal server error: status 500 internal server error'),
      context: { userId: 'user-5', phase: 'ramp-down', timestamp: Date.now() + 4000, duration: 8000, step: 'ai_inference' }
    },
    {
      error: new Error('Operation failed: prediction status 404'),
      context: { userId: 'user-6', phase: 'ramp-down', timestamp: Date.now() + 5000, duration: 12000, step: 'ai_inference' }
    },
    
    // Rate limiting
    {
      error: new Error('Too many requests: status 429'),
      context: { userId: 'user-7', phase: 'sustain', timestamp: Date.now() + 6000, duration: 500, step: 'api_call' }
    },
    {
      error: new Error('Rate limit exceeded: quota exceeded'),
      context: { userId: 'user-8', phase: 'sustain', timestamp: Date.now() + 7000, duration: 600, step: 'api_call' }
    },
    
    // Storage errors
    {
      error: new Error('Storage upload failed: GCS error bucket not found'),
      context: { userId: 'user-9', phase: 'ramp-up', timestamp: Date.now() + 8000, duration: 4000, step: 'file_upload' }
    },
    
    // Timeout errors
    {
      error: new Error('Request timeout: operation timed out after 30s'),
      context: { userId: 'user-10', phase: 'sustain', timestamp: Date.now() + 9000, duration: 30000, step: 'ai_inference' }
    },
    
    // Auth errors
    {
      error: new Error('Unauthorized: invalid signature'),
      context: { userId: 'user-11', phase: 'ramp-up', timestamp: Date.now() + 10000, duration: 1500, step: 'auth_check' }
    },
    
    // Unknown errors
    {
      error: new Error('Something went wrong in the quantum flux capacitor'),
      context: { userId: 'user-12', phase: 'sustain', timestamp: Date.now() + 11000, duration: 2500, step: 'unknown_operation' }
    }
  ];
  
  // Track all errors
  testErrors.forEach(({ error, context }) => {
    globalErrorTracker.trackError(error, context, { testMode: true });
  });
  
  console.log(chalk.green(`✅ Tracked ${testErrors.length} test errors\n`));
  
  // Display the comprehensive error report
  globalErrorTracker.displayReport(12); // 12 total users
  
  // Export to JSON for analysis
  console.log(chalk.blue('\n📁 Exporting error data...\n'));
  const exportData = globalErrorTracker.exportToJson();
  console.log(chalk.gray('Sample export data (first 500 chars):'));
  console.log(chalk.gray(exportData.substring(0, 500) + '...'));
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  simulateErrors();
}
