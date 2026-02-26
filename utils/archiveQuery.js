/**
 * Archive Query Utilities
 * 
 * Provides utilities for querying archive models with the same API as main models
 */

const SaleArchive = require('../models/archive/SaleArchive');
const PaymentArchive = require('../models/archive/PaymentArchive');
const DealerRequestArchive = require('../models/archive/DealerRequestArchive');

/**
 * Default archive threshold (years)
 * Records older than this are typically archived
 */
const ARCHIVE_THRESHOLD_YEARS = 2;

/**
 * Get archive threshold date
 */
function getArchiveThresholdDate() {
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() - ARCHIVE_THRESHOLD_YEARS);
  return threshold;
}

/**
 * Check if a date range should query archive database
 * @param {Date|null} startDate - Start date of query
 * @param {Date|null} endDate - End date of query
 * @returns {boolean} - True if archive should be queried
 */
function shouldQueryArchive(startDate, endDate) {
  const threshold = getArchiveThresholdDate();
  
  // If no date filter, check both
  if (!startDate && !endDate) {
    return true; // Query both to be safe
  }
  
  // If end date is before threshold, definitely query archive
  if (endDate && endDate < threshold) {
    return true;
  }
  
  // If start date is before threshold, query archive (might span both)
  if (startDate && startDate < threshold) {
    return true;
  }
  
  return false;
}

/**
 * Check if a date range should query primary database
 * @param {Date|null} startDate - Start date of query
 * @param {Date|null} endDate - End date of query
 * @returns {boolean} - True if primary should be queried
 */
function shouldQueryPrimary(startDate, endDate) {
  const threshold = getArchiveThresholdDate();
  
  // If no date filter, check both
  if (!startDate && !endDate) {
    return true;
  }
  
  // If start date is after threshold, definitely query primary
  if (startDate && startDate >= threshold) {
    return true;
  }
  
  // If end date is after threshold, query primary (might span both)
  if (endDate && endDate >= threshold) {
    return true;
  }
  
  return false;
}

/**
 * Query archive sales
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options (populate, sort, skip, limit, lean)
 * @returns {Promise<Array>} - Array of sales
 */
async function queryArchiveSales(query, options = {}) {
  const {
    populate = [],
    sort = { saleDate: -1, createdAt: -1 },
    skip = 0,
    limit = null,
    lean = true,
  } = options;

  // Get main database models for manual population
  const User = require('../models/User');
  const Product = require('../models/Product');
  const Shopkeeper = require('../models/Shopkeeper');

  let archiveQuery = SaleArchive.find(query);

  // Apply sort
  if (sort) {
    archiveQuery = archiveQuery.sort(sort);
  }

  // Apply skip
  if (skip) {
    archiveQuery = archiveQuery.skip(skip);
  }

  // Apply limit
  if (limit) {
    archiveQuery = archiveQuery.limit(limit);
  }

  // Apply lean
  if (lean) {
    archiveQuery = archiveQuery.lean();
  }

  const results = await archiveQuery.exec();

  // Manually populate from main database (batch queries for efficiency)
  if (populate.length > 0 && results.length > 0) {
    const resultObjs = results.map(r => r.toObject ? r.toObject() : { ...r });
    
    // Collect all IDs to populate
    const userIds = new Set();
    const productIds = new Set();
    const shopkeeperIds = new Set();
    
    for (const pop of populate) {
      const popPath = typeof pop === 'string' ? pop : pop.path;
      
      resultObjs.forEach(resultObj => {
        if (popPath === 'salesman' && resultObj.salesman) userIds.add(resultObj.salesman);
        if (popPath === 'dealer' && resultObj.dealer) userIds.add(resultObj.dealer);
        if (popPath === 'product' && resultObj.product) productIds.add(resultObj.product);
        if (popPath === 'shopkeeper' && resultObj.shopkeeper) shopkeeperIds.add(resultObj.shopkeeper);
      });
    }
    
    // Batch fetch all referenced documents
    const [users, products, shopkeepers] = await Promise.all([
      userIds.size > 0 ? User.find({ _id: { $in: Array.from(userIds) } }).select('name email').lean() : [],
      productIds.size > 0 ? Product.find({ _id: { $in: Array.from(productIds) } }).select('title packetPrice packetsPerStrip image').lean() : [],
      shopkeeperIds.size > 0 ? Shopkeeper.find({ _id: { $in: Array.from(shopkeeperIds) } }).select('name phone email location').lean() : [],
    ]);
    
    // Create lookup maps
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const shopkeeperMap = new Map(shopkeepers.map(s => [s._id.toString(), s]));
    
    // Populate results
    for (let i = 0; i < resultObjs.length; i++) {
      const resultObj = resultObjs[i];
      
      for (const pop of populate) {
        const popPath = typeof pop === 'string' ? pop : pop.path;
        const popSelect = typeof pop === 'object' && pop.select ? pop.select : null;
        
        if (popPath === 'salesman' && resultObj.salesman) {
          resultObj.salesman = userMap.get(resultObj.salesman.toString()) || null;
        } else if (popPath === 'dealer' && resultObj.dealer) {
          resultObj.dealer = userMap.get(resultObj.dealer.toString()) || null;
        } else if (popPath === 'product' && resultObj.product) {
          resultObj.product = productMap.get(resultObj.product.toString()) || null;
        } else if (popPath === 'shopkeeper' && resultObj.shopkeeper) {
          resultObj.shopkeeper = shopkeeperMap.get(resultObj.shopkeeper.toString()) || null;
        }
      }
      
      // Update result
      if (results[i].toObject) {
        Object.assign(results[i], resultObj);
      } else {
        Object.assign(results[i], resultObj);
      }
    }
  }

  return results;
}

/**
 * Count archive sales
 * @param {Object} query - Mongoose query object
 * @returns {Promise<number>} - Count of sales
 */
async function countArchiveSales(query) {
  return await SaleArchive.countDocuments(query);
}

/**
 * Query archive payments
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options (populate, sort, skip, limit, lean)
 * @returns {Promise<Array>} - Array of payments
 */
async function queryArchivePayments(query, options = {}) {
  const {
    populate = [],
    sort = { transactionDate: -1, createdAt: -1 },
    skip = 0,
    limit = null,
    lean = true,
  } = options;

  // Get main database models for manual population
  const User = require('../models/User');
  const DealerRequest = require('../models/DealerRequest');
  const Product = require('../models/Product');

  let archiveQuery = PaymentArchive.find(query);

  // Apply sort
  if (sort) {
    archiveQuery = archiveQuery.sort(sort);
  }

  // Apply skip
  if (skip) {
    archiveQuery = archiveQuery.skip(skip);
  }

  // Apply limit
  if (limit) {
    archiveQuery = archiveQuery.limit(limit);
  }

  // Apply lean
  if (lean) {
    archiveQuery = archiveQuery.lean();
  }

  const results = await archiveQuery.exec();

  // Manually populate from main database
  if (populate.length > 0 && results.length > 0) {
    for (const result of results) {
      const resultObj = result.toObject ? result.toObject() : result;
      
      for (const pop of populate) {
        const popPath = typeof pop === 'string' ? pop : pop.path;
        const popSelect = typeof pop === 'object' && pop.select ? pop.select : null;
        
        if (popPath === 'dealer' && resultObj.dealer) {
          const dealer = await User.findById(resultObj.dealer).select(popSelect || 'name email').lean();
          resultObj.dealer = dealer;
        } else if (popPath === 'dealerRequest' && resultObj.dealerRequest) {
          const dealerRequest = await DealerRequest.findById(resultObj.dealerRequest)
            .select(popSelect || 'strips status totalAmount paidAmount paymentType product orderGroupId')
            .lean();
          if (dealerRequest && dealerRequest.product) {
            dealerRequest.product = await Product.findById(dealerRequest.product)
              .select('title image packetPrice packetsPerStrip')
              .lean();
          }
          resultObj.dealerRequest = dealerRequest;
        } else if (popPath === 'processedBy' && resultObj.processedBy) {
          const processedBy = await User.findById(resultObj.processedBy).select(popSelect || 'name email').lean();
          resultObj.processedBy = processedBy;
        }
      }
      
      // Update result
      if (result.toObject) {
        Object.assign(result, resultObj);
      } else {
        Object.assign(result, resultObj);
      }
    }
  }

  return results;
}

/**
 * Count archive payments
 * @param {Object} query - Mongoose query object
 * @returns {Promise<number>} - Count of payments
 */
async function countArchivePayments(query) {
  return await PaymentArchive.countDocuments(query);
}

/**
 * Query archive dealer requests
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options (populate, sort, skip, limit, lean)
 * @returns {Promise<Array>} - Array of dealer requests
 */
async function queryArchiveDealerRequests(query, options = {}) {
  const {
    populate = [],
    sort = { requestedAt: -1, createdAt: -1 },
    skip = 0,
    limit = null,
    lean = true,
  } = options;

  // Get main database models for manual population
  const User = require('../models/User');
  const Product = require('../models/Product');

  let archiveQuery = DealerRequestArchive.find(query);

  // Apply sort
  if (sort) {
    archiveQuery = archiveQuery.sort(sort);
  }

  // Apply skip
  if (skip) {
    archiveQuery = archiveQuery.skip(skip);
  }

  // Apply limit
  if (limit) {
    archiveQuery = archiveQuery.limit(limit);
  }

  // Apply lean
  if (lean) {
    archiveQuery = archiveQuery.lean();
  }

  const results = await archiveQuery.exec();

  // Manually populate from main database
  if (populate.length > 0 && results.length > 0) {
    for (const result of results) {
      const resultObj = result.toObject ? result.toObject() : result;
      
      for (const pop of populate) {
        const popPath = typeof pop === 'string' ? pop : pop.path;
        const popSelect = typeof pop === 'object' && pop.select ? pop.select : null;
        
        if (popPath === 'dealer' && resultObj.dealer) {
          const dealer = await User.findById(resultObj.dealer).select(popSelect || 'name email').lean();
          resultObj.dealer = dealer;
        } else if (popPath === 'product' && resultObj.product) {
          const product = await Product.findById(resultObj.product).select(popSelect || 'title packetPrice initialPacketPrice packetsPerStrip image').lean();
          resultObj.product = product;
        } else if (popPath === 'processedBy' && resultObj.processedBy) {
          const processedBy = await User.findById(resultObj.processedBy).select(popSelect || 'name email').lean();
          resultObj.processedBy = processedBy;
        }
      }
      
      // Update result
      if (result.toObject) {
        Object.assign(result, resultObj);
      } else {
        Object.assign(result, resultObj);
      }
    }
  }

  return results;
}

/**
 * Count archive dealer requests
 * @param {Object} query - Mongoose query object
 * @returns {Promise<number>} - Count of dealer requests
 */
async function countArchiveDealerRequests(query) {
  return await DealerRequestArchive.countDocuments(query);
}

/**
 * Normalize archive record to match main model structure
 * This ensures archive records have the same structure as main records
 * @param {Object} record - Archive record
 * @returns {Object} - Normalized record
 */
function normalizeArchiveRecord(record) {
  if (!record) return record;
  
  // Convert to plain object if needed
  const normalized = record.toObject ? record.toObject() : { ...record };
  
  // Ensure _id exists (archive records have new _id, but originalId stores original)
  // We keep the archive _id but can add originalId as a reference
  if (normalized.originalId && !normalized._originalId) {
    normalized._originalId = normalized.originalId;
  }
  
  return normalized;
}

module.exports = {
  getArchiveThresholdDate,
  shouldQueryArchive,
  shouldQueryPrimary,
  queryArchiveSales,
  countArchiveSales,
  queryArchivePayments,
  countArchivePayments,
  queryArchiveDealerRequests,
  countArchiveDealerRequests,
  normalizeArchiveRecord,
  ARCHIVE_THRESHOLD_YEARS,
};

