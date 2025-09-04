#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { createPublicClient, http } from 'viem';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import { loadConfig } from '../config/loader.js';
import Table from 'cli-table3';

/**
 * Load Test Monitoring Script
 * 
 * Provides real-time monitoring and analysis of:
 * - Load test results and metrics
 * - System performance during tests
 * - Historical test data analysis
 * - Resource usage tracking
 */

interface LoadTestResult {
  testId: string;
  walletAddress: string;
  success: boolean;
  duration: number;
  error?: string;
  inferenceResult?: string;
}

interface LoadTestSummary {
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  successRate: number;
  averageDuration: number;
  totalDuration: number;
  errors: { [key: string]: number };
}

interface TestReport {
  timestamp: string;
  config: any;
  summary: LoadTestSummary;
  results: LoadTestResult[];
}

class LoadTestMonitor {
  private config: any;
  private publicClient: any;

  constructor(config: any) {
    this.config = config;
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
    });
  }

  async getResultFiles(): Promise<string[]> {
    const resultsDir = path.join(process.cwd(), 'results');
    
    try {
      const files = await fs.readdir(resultsDir);
      return files
        .filter(file => file.endsWith('.json') && file.startsWith('load-test-results-'))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      return [];
    }
  }

  async loadTestReport(filename: string): Promise<TestReport> {
    const resultsPath = path.join(process.cwd(), 'results', filename);
    const data = await fs.readFile(resultsPath, 'utf-8');
    return JSON.parse(data);
  }

  displaySummaryTable(reports: TestReport[]): void {
    console.log(chalk.bold.cyan('📊 Test Results Summary\n'));
    
    const table = new Table({
      head: ['Date', 'Total', 'Success', 'Failed', 'Success Rate', 'Avg Duration'],
      colWidths: [20, 8, 8, 8, 12, 12],
    });
    
    reports.forEach(report => {
      const date = new Date(report.timestamp).toLocaleDateString();
      const summary = report.summary;
      
      table.push([
        date,
        summary.totalTests.toString(),
        chalk.green(summary.successfulTests.toString()),
        summary.failedTests > 0 ? chalk.red(summary.failedTests.toString()) : '0',
        `${summary.successRate.toFixed(1)}%`,
        `${(summary.averageDuration / 1000).toFixed(1)}s`,
      ]);
    });
    
    console.log(table.toString());
  }

  displayDetailedReport(report: TestReport): void {
    console.log(chalk.bold.cyan(`\n📋 Detailed Report - ${new Date(report.timestamp).toLocaleString()}\n`));
    
    // Configuration
    console.log(chalk.yellow('⚙️  Configuration:'));
    console.log(`  Total Users: ${report.config.totalUsers}`);
    console.log(`  Max Concurrent: ${report.config.maxConcurrentUsers}`);
    console.log(`  RPC Endpoint: ${report.config.rpcEndpoint}`);
    console.log(`  Debug Logs: ${report.config.enableDebugLogs ? 'Enabled' : 'Disabled'}`);
    
    // Summary
    const summary = report.summary;
    console.log(chalk.yellow('\n📊 Results Summary:'));
    console.log(`  Total Tests: ${summary.totalTests}`);
    console.log(`  Successful: ${chalk.green(summary.successfulTests)} (${summary.successRate.toFixed(1)}%)`);
    console.log(`  Failed: ${summary.failedTests > 0 ? chalk.red(summary.failedTests) : '0'}`);
    console.log(`  Average Duration: ${(summary.averageDuration / 1000).toFixed(2)}s`);
    console.log(`  Total Test Time: ${(summary.totalDuration / 1000).toFixed(2)}s`);
    
    // Performance Analysis
    console.log(chalk.yellow('\n🎯 Performance Analysis:'));
    
    const durations = report.results.filter(r => r.success).map(r => r.duration);
    if (durations.length > 0) {
      durations.sort((a, b) => a - b);
      const p50 = durations[Math.floor(durations.length * 0.5)];
      const p95 = durations[Math.floor(durations.length * 0.95)];
      const p99 = durations[Math.floor(durations.length * 0.99)];
      
      console.log(`  P50 Response Time: ${(p50 / 1000).toFixed(2)}s`);
      console.log(`  P95 Response Time: ${(p95 / 1000).toFixed(2)}s`);
      console.log(`  P99 Response Time: ${(p99 / 1000).toFixed(2)}s`);
      
      // Performance assessment
      if (p95 < 30000) {
        console.log(chalk.green('  ✅ Excellent performance (P95 < 30s)'));
      } else if (p95 < 60000) {
        console.log(chalk.yellow('  ⚠️  Acceptable performance (P95 < 60s)'));
      } else {
        console.log(chalk.red('  ❌ Poor performance (P95 > 60s)'));
      }
    }
    
    // Error Analysis
    if (Object.keys(summary.errors).length > 0) {
      console.log(chalk.red('\n❌ Error Analysis:'));
      
      const errorTable = new Table({
        head: ['Error Type', 'Count', 'Percentage'],
        colWidths: [50, 8, 12],
      });
      
      Object.entries(summary.errors)
        .sort(([,a], [,b]) => b - a)
        .forEach(([error, count]) => {
          const percentage = ((count / summary.totalTests) * 100).toFixed(1);
          errorTable.push([
            error,
            count.toString(),
            `${percentage}%`,
          ]);
        });
      
      console.log(errorTable.toString());
    }
    
    // Recommendations
    console.log(chalk.cyan('\n💡 Recommendations:'));
    
    if (summary.successRate < 90) {
      console.log(chalk.red('  • Investigate and fix high error rate'));
      console.log('  • Check RPC connectivity and rate limits');
      console.log('  • Verify wallet funding and gas prices');
    }
    
    if (summary.averageDuration > 60000) {
      console.log(chalk.yellow('  • Optimize performance for faster response times'));
      console.log('  • Consider increasing RPC endpoint capacity');
      console.log('  • Review AI processing pipeline efficiency');
    }
    
    if (summary.successRate >= 95 && summary.averageDuration < 30000) {
      console.log(chalk.green('  • Excellent performance! Consider scaling up test load'));
      console.log('  • Ready for production-scale testing');
    }
  }

  displayTrendAnalysis(reports: TestReport[]): void {
    if (reports.length < 2) {
      console.log(chalk.yellow('⚠️  Need at least 2 test reports for trend analysis'));
      return;
    }
    
    console.log(chalk.bold.cyan('\n📈 Trend Analysis\n'));
    
    const trends = {
      successRate: [],
      averageDuration: [],
      totalTests: [],
    } as any;
    
    reports.forEach(report => {
      trends.successRate.push(report.summary.successRate);
      trends.averageDuration.push(report.summary.averageDuration);
      trends.totalTests.push(report.summary.totalTests);
    });
    
    // Calculate trends
    const successRateTrend = this.calculateTrend(trends.successRate);
    const durationTrend = this.calculateTrend(trends.averageDuration);
    
    console.log(chalk.yellow('📊 Performance Trends:'));
    console.log(`  Success Rate: ${this.formatTrend(successRateTrend, '%')}`);
    console.log(`  Response Time: ${this.formatTrend(durationTrend, 'ms', true)}`); // Inverse for duration
    
    // Overall assessment
    if (successRateTrend > 0 && durationTrend < 0) {
      console.log(chalk.green('\n✅ Performance is improving over time'));
    } else if (successRateTrend < 0 || durationTrend > 0) {
      console.log(chalk.red('\n❌ Performance is degrading - investigate recent changes'));
    } else {
      console.log(chalk.yellow('\n➡️  Performance is stable'));
    }
  }

  calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const first = values[values.length - 1]; // Most recent first
    const last = values[0]; // Oldest last
    
    return ((first - last) / last) * 100;
  }

  formatTrend(trend: number, unit: string, inverse: boolean = false): string {
    const adjustedTrend = inverse ? -trend : trend;
    const arrow = adjustedTrend > 0 ? '↗️' : adjustedTrend < 0 ? '↘️' : '➡️';
    const color = adjustedTrend > 0 ? chalk.green : adjustedTrend < 0 ? chalk.red : chalk.yellow;
    
    return color(`${arrow} ${Math.abs(trend).toFixed(1)}${unit}`);
  }

  async checkSystemHealth(): Promise<void> {
    console.log(chalk.bold.cyan('🏥 System Health Check\n'));
    
    try {
      // Check RPC connectivity
      const blockNumber = await this.publicClient.getBlockNumber();
      console.log(chalk.green(`✅ RPC Connection: Block ${blockNumber}`));
      
      // Check API server
      try {
        const response = await fetch('http://localhost:3001/health');
        if (response.ok) {
          const data = await response.json();
          console.log(chalk.green(`✅ API Server: Running (uptime: ${Math.floor(data.timestamp / 1000)}s)`));
        } else {
          console.log(chalk.red('❌ API Server: Not responding'));
        }
      } catch {
        console.log(chalk.yellow('⚠️  API Server: Not running on port 3001'));
      }
      
      // Check wallet files
      const walletFiles = await fs.readdir(path.join(process.cwd(), 'wallets')).catch(() => []);
      if (walletFiles.length > 0) {
        console.log(chalk.green(`✅ Test Wallets: ${walletFiles.length} wallet files found`));
      } else {
        console.log(chalk.yellow('⚠️  Test Wallets: No wallet files found'));
      }
      
      // Check results directory
      const resultFiles = await this.getResultFiles();
      if (resultFiles.length > 0) {
        console.log(chalk.green(`✅ Test Results: ${resultFiles.length} result files found`));
      } else {
        console.log(chalk.yellow('⚠️  Test Results: No result files found'));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ System health check failed:'), error instanceof Error ? error.message : error);
    }
  }
}

// CLI Program
const program = new Command();

program
  .name('monitor')
  .description('Monitor and analyze Vana SDK load test results')
  .option('--latest', 'Show latest test results only', false)
  .option('--detailed', 'Show detailed analysis of latest test', false)
  .option('--trends', 'Show trend analysis across all tests', false)
  .option('--health', 'Check system health', false)
  .option('--file <filename>', 'Analyze specific result file')
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const monitor = new LoadTestMonitor(config);
      
      console.log(chalk.bold.cyan('🔍 Vana SDK Load Test Monitor\n'));
      
      if (options.health) {
        await monitor.checkSystemHealth();
        return;
      }
      
      const resultFiles = await monitor.getResultFiles();
      
      if (resultFiles.length === 0) {
        console.log(chalk.yellow('⚠️  No test results found. Run some load tests first.'));
        console.log(chalk.cyan('Example: npm run load-test:conservative'));
        return;
      }
      
      if (options.file) {
        // Analyze specific file
        const report = await monitor.loadTestReport(options.file);
        monitor.displayDetailedReport(report);
      } else if (options.detailed) {
        // Show detailed analysis of latest test
        const latestReport = await monitor.loadTestReport(resultFiles[0]);
        monitor.displayDetailedReport(latestReport);
      } else if (options.trends) {
        // Show trend analysis
        const reports = await Promise.all(
          resultFiles.slice(0, 10).map(file => monitor.loadTestReport(file))
        );
        monitor.displayTrendAnalysis(reports);
      } else {
        // Default: show summary of all tests
        const reports = await Promise.all(
          resultFiles.slice(0, 10).map(file => monitor.loadTestReport(file))
        );
        monitor.displaySummaryTable(reports);
        
        if (options.latest && reports.length > 0) {
          console.log('\n' + '─'.repeat(80));
          monitor.displayDetailedReport(reports[0]);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Monitoring failed:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { LoadTestMonitor };
