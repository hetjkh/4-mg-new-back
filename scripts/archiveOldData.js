/**
 * Main archiving script - Orchestrates archiving of old data
 * 
 * This script can archive:
 * - Sales records
 * - Payment records
 * - Dealer Request records
 * 
 * Usage:
 *   # Archive all data types
 *   node scripts/archiveOldData.js --all [--years=2] [--dry-run]
 * 
 *   # Archive specific data types
 *   node scripts/archiveOldData.js --sales [--years=2] [--dry-run]
 *   node scripts/archiveOldData.js --payments [--years=2] [--dry-run]
 *   node scripts/archiveOldData.js --requests [--years=2] [--dry-run]
 * 
 *   # Archive multiple types
 *   node scripts/archiveOldData.js --sales --payments [--years=2] [--dry-run]
 * 
 * Options:
 *   --all              Archive all data types
 *   --sales            Archive sales records
 *   --payments         Archive payment records
 *   --requests         Archive dealer request records
 *   --years=N          Archive records older than N years (default: 2)
 *   --dry-run          Preview what would be archived without making changes
 *   --batch-size=N     Process N records at a time (default: 100)
 *   --limit=N          Limit to N records per type (for testing)
 */

require('dotenv').config();
const { initializeDatabases } = require('../config/database');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  all: false,
  sales: false,
  payments: false,
  requests: false,
  years: 2,
  dryRun: false,
  batchSize: 100,
  limit: null,
};

args.forEach(arg => {
  if (arg === '--all') {
    options.all = true;
    options.sales = true;
    options.payments = true;
    options.requests = true;
  } else if (arg === '--sales') {
    options.sales = true;
  } else if (arg === '--payments') {
    options.payments = true;
  } else if (arg === '--requests') {
    options.requests = true;
  } else if (arg.startsWith('--years=')) {
    options.years = parseInt(arg.split('=')[1]) || 2;
  } else if (arg === '--dry-run' || arg === '--dryrun') {
    options.dryRun = true;
  } else if (arg.startsWith('--batch-size=')) {
    options.batchSize = parseInt(arg.split('=')[1]) || 100;
  } else if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1]);
  }
});

// If no specific type is selected, show help
if (!options.all && !options.sales && !options.payments && !options.requests) {
  console.log(`
📦 Data Archiving Script
========================

Usage:
  node scripts/archiveOldData.js [options]

Options:
  --all              Archive all data types (sales, payments, requests)
  --sales            Archive sales records only
  --payments         Archive payment records only
  --requests         Archive dealer request records only
  --years=N          Archive records older than N years (default: 2)
  --dry-run          Preview what would be archived (no changes made)
  --batch-size=N     Process N records at a time (default: 100)
  --limit=N          Limit to N records per type (for testing)

Examples:
  # Preview what would be archived (dry run)
  node scripts/archiveOldData.js --all --dry-run

  # Archive all data older than 3 years
  node scripts/archiveOldData.js --all --years=3

  # Archive only sales records older than 2 years
  node scripts/archiveOldData.js --sales --years=2

  # Test with limited records
  node scripts/archiveOldData.js --all --limit=10 --dry-run

Archive Criteria:
  - Sales: saleDate older than N years, billStatus='approved', paymentStatus='completed'
  - Payments: transactionDate/createdAt older than N years, status='completed' OR reconciled=true
  - Requests: requestedAt/createdAt older than N years, status IN ('approved', 'cancelled')
`);
  process.exit(0);
}

/**
 * Run archiving for a specific data type
 */
async function runArchiving(type) {
  // Import the archiving function
  let archiveFunction;
  if (type === 'Sales') {
    const { archiveSales } = require('./archiveSales');
    archiveFunction = archiveSales;
  } else if (type === 'Payments') {
    const { archivePayments } = require('./archivePayments');
    archiveFunction = archivePayments;
  } else if (type === 'DealerRequests') {
    const { archiveDealerRequests } = require('./archiveDealerRequests');
    archiveFunction = archiveDealerRequests;
  } else {
    throw new Error(`Unknown archiving type: ${type}`);
  }

  // Prepare options to pass to the function
  const archiveOptions = {
    years: options.years,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    limit: options.limit,
  };

  // Call the archiving function with options
  await archiveFunction(archiveOptions);
}

/**
 * Main archiving function
 */
async function archiveOldData() {
  try {
    console.log('🔄 Initializing databases...');
    await initializeDatabases();
    console.log('✅ Databases initialized\n');

    console.log('📊 Archiving Configuration:');
    console.log(`   - Years old: ${options.years}`);
    console.log(`   - Dry run: ${options.dryRun ? 'YES (no changes will be made)' : 'NO (will archive records)'}`);
    console.log(`   - Batch size: ${options.batchSize}`);
    if (options.limit) {
      console.log(`   - Limit: ${options.limit} records per type`);
    }
    console.log(`   - Data types to archive:`);
    if (options.sales) console.log(`     ✓ Sales`);
    if (options.payments) console.log(`     ✓ Payments`);
    if (options.requests) console.log(`     ✓ Dealer Requests`);
    console.log('');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No records will be archived\n');
    }

    const startTime = Date.now();
    const results = {
      sales: { success: false, error: null },
      payments: { success: false, error: null },
      requests: { success: false, error: null },
    };

    // Archive Sales
    if (options.sales) {
      console.log('='.repeat(60));
      console.log('📦 Archiving Sales Records');
      console.log('='.repeat(60));
      try {
        await runArchiving('Sales');
        results.sales.success = true;
        console.log('✅ Sales archiving completed\n');
      } catch (error) {
        results.sales.error = error.message;
        console.error('❌ Sales archiving failed:', error.message, '\n');
      }
    }

    // Archive Payments
    if (options.payments) {
      console.log('='.repeat(60));
      console.log('💰 Archiving Payment Records');
      console.log('='.repeat(60));
      try {
        await runArchiving('Payments');
        results.payments.success = true;
        console.log('✅ Payments archiving completed\n');
      } catch (error) {
        results.payments.error = error.message;
        console.error('❌ Payments archiving failed:', error.message, '\n');
      }
    }

    // Archive Dealer Requests
    if (options.requests) {
      console.log('='.repeat(60));
      console.log('📋 Archiving Dealer Request Records');
      console.log('='.repeat(60));
      try {
        await runArchiving('DealerRequests');
        results.requests.success = true;
        console.log('✅ Dealer Requests archiving completed\n');
      } catch (error) {
        results.requests.error = error.message;
        console.error('❌ Dealer Requests archiving failed:', error.message, '\n');
      }
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('='.repeat(60));
    console.log('📊 Overall Archiving Summary');
    console.log('='.repeat(60));
    
    if (options.sales) {
      console.log(`   Sales: ${results.sales.success ? '✅ Success' : '❌ Failed'}`);
      if (results.sales.error) {
        console.log(`      Error: ${results.sales.error}`);
      }
    }
    
    if (options.payments) {
      console.log(`   Payments: ${results.payments.success ? '✅ Success' : '❌ Failed'}`);
      if (results.payments.error) {
        console.log(`      Error: ${results.payments.error}`);
      }
    }
    
    if (options.requests) {
      console.log(`   Requests: ${results.requests.success ? '✅ Success' : '❌ Failed'}`);
      if (results.requests.error) {
        console.log(`      Error: ${results.requests.error}`);
      }
    }
    
    console.log(`   Total time: ${elapsed}s`);
    console.log('='.repeat(60));

    // Check if all succeeded
    const allSucceeded = Object.values(results)
      .filter(r => r.success !== undefined)
      .every(r => r.success);

    if (allSucceeded) {
      console.log('\n✅ All archiving operations completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some archiving operations failed. Check errors above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during archiving:');
    console.error(error);
    process.exit(1);
  }
}

// Run the archiving process
archiveOldData();

