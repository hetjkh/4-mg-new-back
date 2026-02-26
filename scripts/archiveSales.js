/**
 * Archive old Sales records to archive database
 * 
 * Criteria:
 * - saleDate older than specified years (default: 2 years)
 * - billStatus: 'approved' (only archive approved bills)
 * - paymentStatus: 'completed' (only archive completed payments)
 * 
 * Usage:
 *   node scripts/archiveSales.js [--years=2] [--dry-run] [--batch-size=100] [--limit=1000]
 */

require('dotenv').config();
const { initializeDatabases } = require('../config/database');
const Sale = require('../models/Sale');
const SaleArchive = require('../models/archive/SaleArchive');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    years: 2,
    dryRun: false,
    batchSize: 100,
    limit: null,
  };

  args.forEach(arg => {
    if (arg.startsWith('--years=')) {
      options.years = parseInt(arg.split('=')[1]) || 2;
    } else if (arg === '--dry-run' || arg === '--dryrun') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1]) || 100;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1]);
    }
  });

  return options;
}

/**
 * Archive old sales records
 * @param {Object} opts - Options object
 * @param {number} opts.years - Years old to archive (default: 2)
 * @param {boolean} opts.dryRun - Dry run mode (default: false)
 * @param {number} opts.batchSize - Batch size (default: 100)
 * @param {number|null} opts.limit - Limit records (default: null)
 */
async function archiveSales(opts = null) {
  // Use provided options or parse from command line
  const options = opts || parseArgs();
  try {
    console.log('🔄 Initializing databases...');
    await initializeDatabases();
    console.log('✅ Databases initialized\n');

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - options.years);
    
    console.log('📊 Archive Configuration:');
    console.log(`   - Years old: ${options.years}`);
    console.log(`   - Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);
    console.log(`   - Dry run: ${options.dryRun ? 'YES (no changes will be made)' : 'NO (will archive records)'}`);
    console.log(`   - Batch size: ${options.batchSize}`);
    if (options.limit) {
      console.log(`   - Limit: ${options.limit} records`);
    }
    console.log('');

    // Build query for records to archive
    const query = {
      saleDate: { $lt: cutoffDate },
      billStatus: 'approved',
      paymentStatus: 'completed',
    };

    // Count total records to archive
    const totalCount = await Sale.countDocuments(query);
    console.log(`📈 Found ${totalCount} sales records eligible for archiving`);

    if (totalCount === 0) {
      console.log('✅ No records to archive');
      process.exit(0);
    }

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No records will be archived\n');
      
      // Show sample records
      const sample = await Sale.find(query)
        .select('_id saleDate billStatus paymentStatus totalAmount invoiceNo')
        .limit(5)
        .lean();
      
      console.log('Sample records that would be archived:');
      sample.forEach((sale, index) => {
        console.log(`   ${index + 1}. ID: ${sale._id}, Date: ${sale.saleDate.toISOString().split('T')[0]}, Amount: ₹${sale.totalAmount}, Invoice: ${sale.invoiceNo}`);
      });
      
      console.log(`\n✅ Dry run completed. ${totalCount} records would be archived.`);
      process.exit(0);
    }

    // Archive records in batches
    let archived = 0;
    let errors = 0;
    const startTime = Date.now();
    const processLimit = options.limit || totalCount;
    let processed = 0;

    console.log(`\n🚀 Starting archiving process (max ${processLimit} records)...\n`);

    while (processed < processLimit) {
      const batchSize = Math.min(options.batchSize, processLimit - processed);
      
      // Fetch batch of records
      const batch = await Sale.find(query)
        .limit(batchSize)
        .lean();

      if (batch.length === 0) {
        break;
      }

      // Process batch
      for (const sale of batch) {
        try {
          // Create archive record
          const archiveData = {
            ...sale,
            originalId: sale._id,
            archivedAt: new Date(),
          };
          delete archiveData._id; // Remove original _id, MongoDB will create new one

          await SaleArchive.create(archiveData);

          // Delete from main database
          await Sale.deleteOne({ _id: sale._id });

          archived++;
          processed++;

          if (archived % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`   ✅ Archived ${archived}/${processLimit} records (${elapsed}s elapsed)`);
          }
        } catch (error) {
          errors++;
          console.error(`   ❌ Error archiving sale ${sale._id}:`, error.message);
          
          // If it's a duplicate key error, the record might already be archived
          if (error.code === 11000) {
            console.log(`   ⚠️  Sale ${sale._id} might already be archived, deleting from main DB`);
            try {
              await Sale.deleteOne({ _id: sale._id });
            } catch (deleteError) {
              console.error(`   ❌ Error deleting duplicate:`, deleteError.message);
            }
          }
        }
      }

      // If we got fewer records than batch size, we're done
      if (batch.length < batchSize) {
        break;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Archiving Summary:');
    console.log('='.repeat(60));
    console.log(`   Total eligible: ${totalCount}`);
    console.log(`   Archived: ${archived}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Time elapsed: ${elapsed}s`);
    console.log('='.repeat(60));

    if (errors > 0) {
      console.log(`\n⚠️  ${errors} errors occurred during archiving. Check logs above.`);
      process.exit(1);
    } else {
      console.log('\n✅ Archiving completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during archiving:');
    console.error(error);
    process.exit(1);
  }
}

// Export function for use in other scripts
module.exports = { archiveSales };

// Run the archiving process if called directly
if (require.main === module) {
  archiveSales();
}

