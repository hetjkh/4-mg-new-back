/**
 * Test script to verify archive database connection
 * 
 * Usage: node scripts/testArchiveConnection.js
 */

require('dotenv').config();
const { initializeDatabases, getArchiveConnection, getMainConnection } = require('../config/database');

async function testArchiveConnection() {
  try {
    console.log('🔄 Initializing databases...');
    await initializeDatabases();
    
    console.log('\n✅ Database connections initialized successfully!\n');
    
    // Test main connection
    const mainConn = getMainConnection();
    console.log('📊 Main Database:');
    console.log('  - Name:', mainConn.name);
    console.log('  - State:', getStateName(mainConn.readyState));
    console.log('  - Host:', mainConn.host);
    
    // Test archive connection
    const archiveConn = getArchiveConnection();
    console.log('\n📊 Archive Database:');
    console.log('  - Name:', archiveConn.name);
    console.log('  - State:', getStateName(archiveConn.readyState));
    console.log('  - Host:', archiveConn.host);
    
    // Test archive models
    console.log('\n🔄 Testing archive models...');
    
    const SaleArchive = require('../models/archive/SaleArchive');
    const PaymentArchive = require('../models/archive/PaymentArchive');
    const DealerRequestArchive = require('../models/archive/DealerRequestArchive');
    
    console.log('  - SaleArchive model loaded:', !!SaleArchive);
    console.log('  - PaymentArchive model loaded:', !!PaymentArchive);
    console.log('  - DealerRequestArchive model loaded:', !!DealerRequestArchive);
    
    // Test a simple query (should return empty array if no data)
    try {
      const count = await SaleArchive.countDocuments();
      console.log(`  - SaleArchive document count: ${count}`);
    } catch (error) {
      console.error('  - Error querying SaleArchive:', error.message);
    }
    
    try {
      const count = await PaymentArchive.countDocuments();
      console.log(`  - PaymentArchive document count: ${count}`);
    } catch (error) {
      console.error('  - Error querying PaymentArchive:', error.message);
    }
    
    try {
      const count = await DealerRequestArchive.countDocuments();
      console.log(`  - DealerRequestArchive document count: ${count}`);
    } catch (error) {
      console.error('  - Error querying DealerRequestArchive:', error.message);
    }
    
    console.log('\n✅ Archive database connection test completed successfully!');
    
    // Close connections
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Archive database connection test failed:');
    console.error('  Error:', error.message);
    console.error('  Stack:', error.stack);
    process.exit(1);
  }
}

function getStateName(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[state] || 'unknown';
}

// Run the test
testArchiveConnection();

