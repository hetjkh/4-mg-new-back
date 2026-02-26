/**
 * Test script for unified queries
 * 
 * Tests that unified queries correctly route to primary and archive databases
 * 
 * Usage: node scripts/testUnifiedQueries.js
 */

require('dotenv').config();
const { initializeDatabases } = require('../config/database');
const { queryUnifiedSales } = require('../utils/unifiedQuery');
const { shouldQueryArchive, shouldQueryPrimary, getArchiveThresholdDate } = require('../utils/archiveQuery');

async function testUnifiedQueries() {
  try {
    console.log('🔄 Initializing databases...');
    await initializeDatabases();
    console.log('✅ Databases initialized\n');

    const threshold = getArchiveThresholdDate();
    console.log(`📅 Archive threshold date: ${threshold.toISOString().split('T')[0]}\n`);

    // Test 1: Query recent data (should only query primary)
    console.log('='.repeat(60));
    console.log('Test 1: Query recent data (last 30 days)');
    console.log('='.repeat(60));
    const recentStart = new Date();
    recentStart.setDate(recentStart.getDate() - 30);
    const recentEnd = new Date();
    
    const recentQuery = {
      billStatus: 'approved',
      saleDate: { $gte: recentStart, $lte: recentEnd }
    };
    
    console.log(`Query date range: ${recentStart.toISOString().split('T')[0]} to ${recentEnd.toISOString().split('T')[0]}`);
    console.log(`Should query archive: ${shouldQueryArchive(recentStart, recentEnd)}`);
    console.log(`Should query primary: ${shouldQueryPrimary(recentStart, recentEnd)}`);
    
    const recentResult = await queryUnifiedSales(recentQuery, {
      populate: [
        { path: 'product', select: 'title' },
        { path: 'dealer', select: 'name email' },
      ],
      sort: { saleDate: -1 },
      skip: 0,
      limit: 10,
      lean: true,
    });
    
    console.log(`Results: ${recentResult.data.length} sales`);
    console.log(`  - From primary: ${recentResult.fromPrimary}`);
    console.log(`  - From archive: ${recentResult.fromArchive}`);
    console.log(`  - Total count: ${recentResult.total}`);
    console.log('✅ Test 1 completed\n');

    // Test 2: Query old data (should only query archive)
    console.log('='.repeat(60));
    console.log('Test 2: Query old data (3 years ago)');
    console.log('='.repeat(60));
    const oldStart = new Date();
    oldStart.setFullYear(oldStart.getFullYear() - 3);
    oldStart.setMonth(0);
    oldStart.setDate(1);
    const oldEnd = new Date(oldStart);
    oldEnd.setMonth(11);
    oldEnd.setDate(31);
    
    const oldQuery = {
      billStatus: 'approved',
      saleDate: { $gte: oldStart, $lte: oldEnd }
    };
    
    console.log(`Query date range: ${oldStart.toISOString().split('T')[0]} to ${oldEnd.toISOString().split('T')[0]}`);
    console.log(`Should query archive: ${shouldQueryArchive(oldStart, oldEnd)}`);
    console.log(`Should query primary: ${shouldQueryPrimary(oldStart, oldEnd)}`);
    
    const oldResult = await queryUnifiedSales(oldQuery, {
      populate: [
        { path: 'product', select: 'title' },
        { path: 'dealer', select: 'name email' },
      ],
      sort: { saleDate: -1 },
      skip: 0,
      limit: 10,
      lean: true,
    });
    
    console.log(`Results: ${oldResult.data.length} sales`);
    console.log(`  - From primary: ${oldResult.fromPrimary}`);
    console.log(`  - From archive: ${oldResult.fromArchive}`);
    console.log(`  - Total count: ${oldResult.total}`);
    console.log('✅ Test 2 completed\n');

    // Test 3: Query spanning both (should query both)
    console.log('='.repeat(60));
    console.log('Test 3: Query spanning both databases (1 year ago to now)');
    console.log('='.repeat(60));
    const spanStart = new Date();
    spanStart.setFullYear(spanStart.getFullYear() - 1);
    const spanEnd = new Date();
    
    const spanQuery = {
      billStatus: 'approved',
      saleDate: { $gte: spanStart, $lte: spanEnd }
    };
    
    console.log(`Query date range: ${spanStart.toISOString().split('T')[0]} to ${spanEnd.toISOString().split('T')[0]}`);
    console.log(`Should query archive: ${shouldQueryArchive(spanStart, spanEnd)}`);
    console.log(`Should query primary: ${shouldQueryPrimary(spanStart, spanEnd)}`);
    
    const spanResult = await queryUnifiedSales(spanQuery, {
      populate: [
        { path: 'product', select: 'title' },
        { path: 'dealer', select: 'name email' },
      ],
      sort: { saleDate: -1 },
      skip: 0,
      limit: 10,
      lean: true,
    });
    
    console.log(`Results: ${spanResult.data.length} sales`);
    console.log(`  - From primary: ${spanResult.fromPrimary}`);
    console.log(`  - From archive: ${spanResult.fromArchive}`);
    console.log(`  - Total count: ${spanResult.total}`);
    console.log('✅ Test 3 completed\n');

    // Test 4: Query without date filter (should query both)
    console.log('='.repeat(60));
    console.log('Test 4: Query without date filter');
    console.log('='.repeat(60));
    const noDateQuery = {
      billStatus: 'approved',
    };
    
    console.log(`Query: ${JSON.stringify(noDateQuery)}`);
    console.log(`Should query archive: ${shouldQueryArchive(null, null)}`);
    console.log(`Should query primary: ${shouldQueryPrimary(null, null)}`);
    
    const noDateResult = await queryUnifiedSales(noDateQuery, {
      populate: [
        { path: 'product', select: 'title' },
        { path: 'dealer', select: 'name email' },
      ],
      sort: { saleDate: -1 },
      skip: 0,
      limit: 10,
      lean: true,
    });
    
    console.log(`Results: ${noDateResult.data.length} sales`);
    console.log(`  - From primary: ${noDateResult.fromPrimary}`);
    console.log(`  - From archive: ${noDateResult.fromArchive}`);
    console.log(`  - Total count: ${noDateResult.total}`);
    console.log('✅ Test 4 completed\n');

    console.log('='.repeat(60));
    console.log('✅ All unified query tests completed successfully!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testUnifiedQueries();

