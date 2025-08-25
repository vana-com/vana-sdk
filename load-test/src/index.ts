#!/usr/bin/env node

import { Command } from 'commander';
import { LoadTestApiServer } from './server/api-server.js';
import { loadConfig } from './config/loader.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Main entry point for Vana SDK Load Testing
 * 
 * Provides CLI interface for:
 * - Starting the API server
 * - Running load tests
 * - Managing test wallets
 * - Monitoring results
 */

const program = new Command();

program
  .name('vana-load-test')
  .description('Vana SDK Load Testing Suite')
  .version('1.0.0');

// Start API server command
program
  .command('server')
  .description('Start the load test API server')
  .option('-p, --port <port>', 'Port to run server on', '3001')
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    const spinner = ora('Starting API server...').start();
    
    try {
      const config = await loadConfig();
      config.enableDebugLogs = options.debug;
      
      const server = new LoadTestApiServer(config, parseInt(options.port));
      await server.start();
      
      spinner.succeed(chalk.green(`API server started on port ${options.port}`));
      
      console.log(chalk.cyan('\nAvailable endpoints:'));
      console.log(`  ${chalk.white('GET')}  http://localhost:${options.port}/health`);
      console.log(`  ${chalk.white('POST')} http://localhost:${options.port}/api/relay`);
      console.log(`  ${chalk.white('POST')} http://localhost:${options.port}/api/trusted-server`);
      console.log(`  ${chalk.white('POST')} http://localhost:${options.port}/api/trusted-server/poll`);
      console.log(`  ${chalk.white('POST')} http://localhost:${options.port}/api/cleanup`);
      
      console.log(chalk.yellow('\nPress Ctrl+C to stop the server'));
      
      // Keep process alive
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nShutting down server...'));
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to start API server'));
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show current project status and next steps')
  .action(() => {
    console.log(chalk.bold.cyan('🏁 Vana SDK Load Test Status\n'));
    
    console.log(chalk.green('✅ Completed:'));
    console.log('  - Core infrastructure (VanaLoadTestClient, LoadTestApiServer)');
    console.log('  - Configuration system with environment loading');
    console.log('  - DataPortabilityFlow integration');
    console.log('  - Milestone 1: Core Components (100% pass rate)');
    
    console.log(chalk.yellow('\n🚧 In Progress:'));
    console.log('  - CLI infrastructure and entry points');
    console.log('  - Milestone 2: Single E2E flow testing');
    
    console.log(chalk.red('\n❌ Missing:'));
    console.log('  - CLI scripts (prepare-wallets.ts, run-test.ts, monitor.ts)');
    console.log('  - Artillery configuration files');
    console.log('  - TestWalletManager implementation');
    console.log('  - Synthetic data generator');
    
    console.log(chalk.blue('\n🎯 Next Steps:'));
    console.log('  1. Run: npm run build');
    console.log('  2. Test: npx tsx milestones/ms-01/test-milestone1.ts');
    console.log('  3. Start server: npm run dev');
    console.log('  4. Implement Milestone 2 testing');
    
    console.log(chalk.cyan('\n📊 Progress: ~40% complete'));
    console.log(chalk.cyan('🎯 Focus: CLI implementation and E2E testing'));
  });

// Test command
program
  .command('test')
  .description('Run milestone tests')
  .argument('[milestone]', 'Milestone to test (ms-01, ms-02, etc.)', 'ms-01')
  .action((milestone) => {
    console.log(chalk.cyan(`Running ${milestone} tests...`));
    
    if (milestone === 'ms-01') {
      console.log(chalk.green('✅ Milestone 1: Core Components'));
      console.log('Run: npx tsx milestones/ms-01/test-milestone1.ts');
    } else {
      console.log(chalk.yellow(`⏳ ${milestone} not yet implemented`));
      console.log('Check milestones/README.md for status');
    }
  });

// Config command
program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      console.log(chalk.cyan('📋 Load Test Configuration:\n'));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red('Error loading configuration:'), error instanceof Error ? error.message : error);
    }
  });

// If no command provided, show help
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
