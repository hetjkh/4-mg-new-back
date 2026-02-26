/**
 * Archive old DealerRequest records to archive database
 * 
 * Criteria:
 * - requestedAt or createdAt older than specified years (default: 2 years)
 * - status: 'approved' OR 'cancelled' (only archive completed requests)
 * 
 * Usage:
 *   node scripts/archiveDealerRequests.js [--years=2] [--dry-run] [--batch-size=100] [--limit=1000]
 */

require('dotenv').config();
const { initializeDatabases } = require('../config/database');
const DealerRequest = require('../models/DealerRequest');
const DealerRequestArchive = require('../models/archive/DealerRequestArchive');

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
 * Archive old dealer request records
 * @param {Object} opts - Options object
 * @param {number} opts.years - Years old to archive (default: 2)
 * @param {boolean} opts.dryRun - Dry run mode (default: false)
 * @param {number} opts.batchSize - Batch size (default: 100)
 * @param {number|null} opts.limit - Limit records (default: null)
 */
async function archiveDealerRequests(opts = null) {
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
    // Archive requests that are:
    // 1. Older than cutoff date (based on requestedAt or createdAt)
    // 2. Status is 'approved' OR 'cancelled'
    const query = {
      $and: [
        {
          $or: [
            { requestedAt: { $lt: cutoffDate } },
            { createdAt: { $lt: cutoffDate } }
          ]
        },
        {
          status: { $in: ['approved', 'cancelled'] }
        }
      ]
    };

    // Count total records to archive
    const totalCount = await DealerRequest.countDocuments(query);
    console.log(`📈 Found ${totalCount} dealer request records eligible for archiving`);

    if (totalCount === 0) {
      console.log('✅ No records to archive');
      process.exit(0);
    }

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No records will be archived\n');
      
      // Show sample records
      const sample = await DealerRequest.find(query)
        .select('_id requestedAt createdAt status paymentStatus totalAmount strips')
        .limit(5)
        .lean();
      
      console.log('Sample records that would be archived:');
      sample.forEach((request, index) => {
        const date = request.requestedAt || request.createdAt;
        console.log(`   ${index + 1}. ID: ${request._id}, Date: ${date.toISOString().split('T')[0]}, Status: ${request.status}, Amount: ₹${request.totalAmount || 0}, Strips: ${request.strips}`);
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
      const batch = await DealerRequest.find(query)
        .limit(batchSize)
        .lean();

      if (batch.length === 0) {
        break;
      }

      // Process batch
      for (const request of batch) {
        try {
          // Create archive record
          const archiveData = {
            ...request,
            originalId: request._id,
            archivedAt: new Date(),
          };
          delete archiveData._id; // Remove original _id, MongoDB will create new one

          await DealerRequestArchive.create(archiveData);

          // Delete from main database
          await DealerRequest.deleteOne({ _id: request._id });

          archived++;
          processed++;

          if (archived % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`   ✅ Archived ${archived}/${processLimit} records (${elapsed}s elapsed)`);
          }
        } catch (error) {
          errors++;
          console.error(`   ❌ Error archiving dealer request ${request._id}:`, error.message);
          
          // If it's a duplicate key error, the record might already be archived
          if (error.code === 11000) {
            console.log(`   ⚠️  Dealer request ${request._id} might already be archived, deleting from main DB`);
            try {
              await DealerRequest.deleteOne({ _id: request._id });
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
module.exports = { archiveDealerRequests };

// Run the archiving process if called directly
if (require.main === module) {
  archiveDealerRequests();
}

