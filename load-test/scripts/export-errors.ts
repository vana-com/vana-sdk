#!/usr/bin/env node

/**
 * Export error data from load tests for external analysis
 */

import { globalErrorTracker } from '../src/utils/error-tracker.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

function exportErrors() {
  const errors = globalErrorTracker.getRawErrors();
  
  if (errors.length === 0) {
    console.log(chalk.yellow('📊 No errors to export. Run a load test first.'));
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-errors-${timestamp}.json`;
  const filepath = join(process.cwd(), filename);
  
  const exportData = globalErrorTracker.exportToJson();
  
  try {
    writeFileSync(filepath, exportData, 'utf8');
    console.log(chalk.green(`✅ Exported ${errors.length} errors to: ${filename}`));
    
    // Display quick summary
    const summary = globalErrorTracker.generateSummary(errors.length);
    console.log(chalk.cyan('\n📈 Quick Summary:'));
    console.log(`   Total Errors: ${summary.totalErrors}`);
    console.log(`   Error Types: ${summary.errorsByType.length}`);
    console.log(`   Top Error: ${summary.errorsByType[0]?.errorType || 'None'} (${summary.errorsByType[0]?.count || 0})`);
    
  } catch (error) {
    console.error(chalk.red(`❌ Failed to export errors: ${error}`));
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  exportErrors();
}

export { exportErrors };
