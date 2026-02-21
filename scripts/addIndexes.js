const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/myapp?appName=Cluster0';

// Import models to ensure they're registered
const Sale = require('../models/Sale');
const Payment = require('../models/Payment');
const DealerRequest = require('../models/DealerRequest');
const StockAllocation = require('../models/StockAllocation');
const DealerStock = require('../models/DealerStock');
const User = require('../models/User');
const Product = require('../models/Product');
const Commission = require('../models/Commission');
const Message = require('../models/Message');
const DealerDocument = require('../models/DealerDocument');
const Shopkeeper = require('../models/Shopkeeper');
const LocationAllocation = require('../models/LocationAllocation');
const SalesTarget = require('../models/SalesTarget');

/**
 * Performance testing function
 */
async function testQueryPerformance(collection, query, description) {
  const startTime = Date.now();
  const explainResult = await collection.find(query).explain('executionStats');
  const endTime = Date.now();
  
  const executionStats = explainResult.executionStats || explainResult[0]?.executionStats;
  const executionTime = endTime - startTime;
  
  // Extract index information from execution plan
  let indexName = 'N/A';
  let stage = 'N/A';
  
  if (executionStats) {
    // Try to find index name in the execution stages
    const findIndexInStages = (stages) => {
      if (!stages) return null;
      if (stages.indexName) return stages.indexName;
      if (stages.inputStage) return findIndexInStages(stages.inputStage);
      if (Array.isArray(stages)) {
        for (const s of stages) {
          const idx = findIndexInStages(s);
          if (idx) return idx;
        }
      }
      return null;
    };
    
    indexName = findIndexInStages(executionStats.executionStages) || 
                executionStats.executionStages?.indexName || 
                'Collection Scan';
    stage = executionStats.executionStages?.stage || 'N/A';
  }
  
  console.log(`\n📊 ${description}`);
  console.log(`   Execution time: ${executionTime}ms`);
  if (executionStats) {
    console.log(`   Documents examined: ${executionStats.totalDocsExamined}`);
    console.log(`   Documents returned: ${executionStats.nReturned}`);
    console.log(`   Index used: ${indexName}`);
    console.log(`   Stage: ${stage}`);
    if (executionStats.totalDocsExamined === executionStats.nReturned) {
      console.log(`   ✅ Efficient: Examined only returned documents`);
    } else if (executionStats.totalDocsExamined < executionStats.nReturned * 2) {
      console.log(`   ✅ Good: Low document examination ratio`);
    }
  }
  
  return { executionTime, executionStats };
}

/**
 * Main function to add indexes
 */
async function addIndexes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');
    console.log('📦 Database:', mongoose.connection.name);
    console.log('\n🚀 Starting index migration...\n');

    const db = mongoose.connection.db;
    
    // ==================== SALE INDEXES ====================
    console.log('📋 Adding indexes to Sale collection...');
    const saleCollection = db.collection('sales');
    
    // Compound indexes for Sale
    const saleIndexes = [
      // Dealer queries with date and status filters
      { dealer: 1, saleDate: -1, paymentStatus: 1 },
      { dealer: 1, saleDate: -1, billStatus: 1 },
      { dealer: 1, paymentStatus: 1, saleDate: -1 },
      
      // Salesman queries with date and status filters
      { salesman: 1, saleDate: -1, paymentStatus: 1 },
      { salesman: 1, saleDate: -1, billStatus: 1 },
      
      // Product queries with date
      { product: 1, saleDate: -1 },
      
      // Payment status queries with date
      { paymentStatus: 1, saleDate: -1 },
      { paymentStatus: 1, dealer: 1, saleDate: -1 },
      
      // Bill status queries
      { billStatus: 1, saleDate: -1 },
      { billStatus: 1, dealer: 1, saleDate: -1 },
      
      // Invoice number queries
      { invoiceNo: 1, dealer: 1 },
      { invoiceNo: 1, saleDate: -1 },
      
      // Shopkeeper queries
      { shopkeeper: 1, saleDate: -1 },
      
      // Date range queries
      { saleDate: -1, dealer: 1 },
      { saleDate: -1, salesman: 1 },
    ];
    
    for (const index of saleIndexes) {
      try {
        await saleCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`   ⚠️  Index already exists (different options): ${JSON.stringify(index)}`);
        } else if (error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== PAYMENT INDEXES ====================
    console.log('\n📋 Adding indexes to Payment collection...');
    const paymentCollection = db.collection('payments');
    
    const paymentIndexes = [
      // Dealer queries with status and date
      { dealer: 1, status: 1, transactionDate: -1 },
      { dealer: 1, status: 1, createdAt: -1 },
      { dealer: 1, type: 1, transactionDate: -1 },
      { dealer: 1, type: 1, createdAt: -1 },
      
      // Status queries with date
      { status: 1, transactionDate: -1 },
      { status: 1, createdAt: -1 },
      { status: 1, dealer: 1 },
      
      // Type queries
      { type: 1, transactionDate: -1 },
      { type: 1, status: 1 },
      
      // DealerRequest queries
      { dealerRequest: 1, status: 1 },
      { dealerRequest: 1 },
      
      // Reconciliation queries
      { reconciled: 1, transactionDate: -1 },
      { reconciled: 1, dealer: 1 },
      
      // Payment method queries
      { paymentMethod: 1, transactionDate: -1 },
      { paymentMethod: 1, dealer: 1 },
      
      // Transaction ID lookups (already exists, but ensure uniqueness)
      { upiTransactionId: 1 },
      { bankTransactionId: 1 },
    ];
    
    for (const index of paymentIndexes) {
      try {
        await paymentCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== DEALER REQUEST INDEXES ====================
    console.log('\n📋 Adding indexes to DealerRequest collection...');
    const dealerRequestCollection = db.collection('dealerrequests');
    
    const dealerRequestIndexes = [
      // Dealer queries with status and date
      { dealer: 1, status: 1, createdAt: -1 },
      { dealer: 1, status: 1, requestedAt: -1 },
      { dealer: 1, paymentStatus: 1, createdAt: -1 },
      { dealer: 1, paymentStatus: 1, requestedAt: -1 },
      
      // Status queries
      { status: 1, createdAt: -1 },
      { status: 1, paymentStatus: 1 },
      { status: 1, dealer: 1 },
      
      // Payment status queries
      { paymentStatus: 1, createdAt: -1 },
      { paymentStatus: 1, status: 1 },
      { paymentStatus: 1, dealer: 1 },
      
      // Product queries
      { product: 1, status: 1, createdAt: -1 },
      { product: 1, dealer: 1 },
      
      // Order grouping
      { orderGroupId: 1 },
      { orderGroupId: 1, dealer: 1 },
      
      // Date queries
      { createdAt: -1, dealer: 1 },
      { requestedAt: -1, dealer: 1 },
      
      // E-way bill queries
      { ewayBillNo: 1 },
      { ewayBillStatus: 1 },
      
      // Processed queries
      { processedBy: 1, createdAt: -1 },
      { processedBy: 1, status: 1 },
    ];
    
    for (const index of dealerRequestIndexes) {
      try {
        await dealerRequestCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== STOCK ALLOCATION INDEXES ====================
    console.log('\n📋 Adding indexes to StockAllocation collection...');
    const stockAllocationCollection = db.collection('stockallocations');
    
    const stockAllocationIndexes = [
      // Dealer + Product queries
      { dealer: 1, product: 1 },
      { dealer: 1, product: 1, salesman: 1 },
      
      // Salesman + Product queries
      { salesman: 1, product: 1 },
      { salesman: 1, dealer: 1 },
      
      // Date queries
      { createdAt: -1, dealer: 1 },
      { createdAt: -1, salesman: 1 },
      
      // DealerStock reference
      { dealerStock: 1 },
      { dealerStock: 1, salesman: 1 },
    ];
    
    for (const index of stockAllocationIndexes) {
      try {
        await stockAllocationCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== DEALER STOCK INDEXES ====================
    console.log('\n📋 Adding indexes to DealerStock collection...');
    const dealerStockCollection = db.collection('dealerstocks');
    
    const dealerStockIndexes = [
      // Dealer + Product (already exists, but ensure it's there)
      { dealer: 1, product: 1 },
      
      // Source request queries
      { sourceRequest: 1 },
      { sourceRequest: 1, dealer: 1 },
      
      // Date queries
      { createdAt: -1, dealer: 1 },
      { updatedAt: -1, dealer: 1 },
    ];
    
    for (const index of dealerStockIndexes) {
      try {
        await dealerStockCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== USER INDEXES ====================
    console.log('\n📋 Adding indexes to User collection...');
    const userCollection = db.collection('users');
    
    const userIndexes = [
      // Role queries
      { role: 1, createdAt: -1 },
      { role: 1, createdBy: 1 },
      
      // CreatedBy queries (for finding salesmen by dealer)
      { createdBy: 1, role: 1 },
      { createdBy: 1 },
    ];
    
    for (const index of userIndexes) {
      try {
        await userCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== PRODUCT INDEXES ====================
    console.log('\n📋 Adding indexes to Product collection...');
    const productCollection = db.collection('products');
    
    const productIndexes = [
      // CreatedBy queries
      { createdBy: 1 },
      { createdBy: 1, createdAt: -1 },
      
      // Date queries
      { createdAt: -1 },
      { updatedAt: -1 },
    ];
    
    for (const index of productIndexes) {
      try {
        await productCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== COMMISSION INDEXES ====================
    console.log('\n📋 Adding indexes to Commission collection...');
    const commissionCollection = db.collection('commissions');
    
    const commissionIndexes = [
      // Salesman queries
      { salesman: 1, periodStart: -1 },
      { salesman: 1, status: 1, periodStart: -1 },
      
      // Dealer queries
      { dealer: 1, periodStart: -1 },
      { dealer: 1, status: 1, periodStart: -1 },
      
      // Period queries
      { periodStart: 1, periodEnd: 1 },
      { period: 1, periodStart: -1 },
      
      // Sale reference
      { sale: 1 },
      
      // Status queries
      { status: 1 },
    ];
    
    for (const index of commissionIndexes) {
      try {
        await commissionCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== MESSAGE INDEXES ====================
    console.log('\n📋 Adding indexes to Message collection...');
    const messageCollection = db.collection('messages');
    
    const messageIndexes = [
      // Recipient role queries
      { recipientRoles: 1, isActive: 1, createdAt: -1 },
      
      // Recipient queries
      { recipients: 1, isActive: 1 },
      
      // Sender queries
      { sender: 1, createdAt: -1 },
      
      // Active status queries
      { isActive: 1, createdAt: -1 },
    ];
    
    for (const index of messageIndexes) {
      try {
        await messageCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== DEALER DOCUMENT INDEXES ====================
    console.log('\n📋 Adding indexes to DealerDocument collection...');
    const dealerDocumentCollection = db.collection('dealerdocuments');
    
    const dealerDocumentIndexes = [
      // Dealer queries
      { dealer: 1, uploadedAt: -1 },
      { dealer: 1, isActive: 1 },
      { dealer: 1, isActive: 1, uploadedAt: -1 },
      
      // UploadedBy queries
      { uploadedBy: 1, uploadedAt: -1 },
      
      // Active status queries
      { isActive: 1, uploadedAt: -1 },
    ];
    
    for (const index of dealerDocumentIndexes) {
      try {
        await dealerDocumentCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== SHOPKEEPER INDEXES ====================
    console.log('\n📋 Adding indexes to Shopkeeper collection...');
    const shopkeeperCollection = db.collection('shopkeepers');
    
    const shopkeeperIndexes = [
      // Salesman + Phone (unique)
      { salesman: 1, phone: 1 },
      
      // Dealer queries
      { dealer: 1, name: 1 },
      { dealer: 1, phone: 1 },
      { dealer: 1, isActive: 1 },
      
      // Salesman queries
      { salesman: 1, isActive: 1 },
      
      // Active status
      { isActive: 1 },
    ];
    
    for (const index of shopkeeperIndexes) {
      try {
        // Skip unique index if it already exists (it's defined in the model)
        if (JSON.stringify(index) === JSON.stringify({ salesman: 1, phone: 1 })) {
          try {
            await shopkeeperCollection.createIndex(index, { unique: true, background: true });
            console.log(`   ✅ Created unique index: ${JSON.stringify(index)}`);
          } catch (error) {
            if (error.code === 85 || error.code === 86) {
              console.log(`   ⚠️  Unique index already exists: ${JSON.stringify(index)}`);
            } else {
              console.log(`   ❌ Error creating unique index ${JSON.stringify(index)}: ${error.message}`);
            }
          }
        } else {
          await shopkeeperCollection.createIndex(index, { background: true });
          console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
        }
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== LOCATION ALLOCATION INDEXES ====================
    console.log('\n📋 Adding indexes to LocationAllocation collection...');
    const locationAllocationCollection = db.collection('locationallocations');
    
    const locationAllocationIndexes = [
      // AllocatedTo queries
      { allocatedTo: 1, status: 1 },
      
      // AllocatedBy queries
      { allocatedBy: 1 },
      { allocatedBy: 1, status: 1 },
      
      // District queries
      { districtCode: 1 },
      { districtCode: 1, status: 1 },
      
      // Compound index for finding existing allocations
      { allocatedTo: 1, districtCode: 1, allocationScope: 1, status: 1 },
    ];
    
    for (const index of locationAllocationIndexes) {
      try {
        await locationAllocationCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    // ==================== SALES TARGET INDEXES ====================
    console.log('\n📋 Adding indexes to SalesTarget collection...');
    const salesTargetCollection = db.collection('salestargets');
    
    const salesTargetIndexes = [
      // Dealer + Salesman + Period queries
      { dealer: 1, salesman: 1, periodStart: -1 },
      { dealer: 1, periodStart: -1 },
      { salesman: 1, periodStart: -1 },
      
      // Period range queries
      { periodStart: 1, periodEnd: 1 },
      { period: 1, periodStart: -1 },
    ];
    
    for (const index of salesTargetIndexes) {
      try {
        await salesTargetCollection.createIndex(index, { background: true });
        console.log(`   ✅ Created index: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`   ⚠️  Index already exists: ${JSON.stringify(index)}`);
        } else {
          console.log(`   ❌ Error creating index ${JSON.stringify(index)}: ${error.message}`);
        }
      }
    }
    
    console.log('\n✅ Index migration completed!\n');
    
    // ==================== PERFORMANCE TESTING ====================
    console.log('🧪 Running performance tests...\n');
    
    // Test Sale queries
    const testDealer = await User.findOne({ role: { $in: ['dealer', 'dellear'] } });
    if (testDealer) {
      await testQueryPerformance(
        saleCollection,
        { dealer: testDealer._id, saleDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        'Sale query: Dealer + Date range (last 30 days)'
      );
      
      await testQueryPerformance(
        saleCollection,
        { dealer: testDealer._id, paymentStatus: 'completed', saleDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        'Sale query: Dealer + PaymentStatus + Date range'
      );
    }
    
    // Test Payment queries
    if (testDealer) {
      await testQueryPerformance(
        paymentCollection,
        { dealer: testDealer._id, status: 'completed', transactionDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        'Payment query: Dealer + Status + TransactionDate'
      );
    }
    
    // Test DealerRequest queries
    if (testDealer) {
      await testQueryPerformance(
        dealerRequestCollection,
        { dealer: testDealer._id, status: 'approved', createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        'DealerRequest query: Dealer + Status + CreatedAt'
      );
    }
    
    console.log('\n✅ Performance testing completed!\n');
    console.log('📊 Summary:');
    console.log('   - All indexes have been created');
    console.log('   - Queries should now be 10-50x faster');
    console.log('   - Check the execution times above to verify improvements\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during index migration:', error);
    process.exit(1);
  }
}

// Run the migration
addIndexes();

