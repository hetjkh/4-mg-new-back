/**
 * Unified Query Utilities
 * 
 * Provides seamless querying across both primary and archive databases
 * Automatically routes queries to the appropriate database(s) based on date ranges
 */

const Sale = require('../models/Sale');
const Payment = require('../models/Payment');
const DealerRequest = require('../models/DealerRequest');
const {
  shouldQueryArchive,
  shouldQueryPrimary,
  queryArchiveSales,
  countArchiveSales,
  queryArchivePayments,
  countArchivePayments,
  queryArchiveDealerRequests,
  countArchiveDealerRequests,
  normalizeArchiveRecord,
} = require('./archiveQuery');

/**
 * Extract date range from query object
 * @param {Object} query - Mongoose query object
 * @param {string} dateField - Name of date field (e.g., 'saleDate', 'transactionDate')
 * @returns {Object} - { startDate, endDate } or null
 */
function extractDateRange(query, dateField) {
  const dateQuery = query[dateField];
  
  if (!dateQuery) {
    return null;
  }
  
  let startDate = null;
  let endDate = null;
  
  if (dateQuery instanceof Date) {
    // Single date
    startDate = dateQuery;
    endDate = dateQuery;
  } else if (typeof dateQuery === 'object') {
    // Date range object
    if (dateQuery.$gte) {
      startDate = dateQuery.$gte instanceof Date ? dateQuery.$gte : new Date(dateQuery.$gte);
    }
    if (dateQuery.$lte) {
      endDate = dateQuery.$lte instanceof Date ? dateQuery.$lte : new Date(dateQuery.$lte);
    }
    if (dateQuery.$gt) {
      startDate = dateQuery.$gt instanceof Date ? dateQuery.$gt : new Date(dateQuery.$gt);
    }
    if (dateQuery.$lt) {
      endDate = dateQuery.$lt instanceof Date ? dateQuery.$lt : new Date(dateQuery.$lt);
    }
  }
  
  return { startDate, endDate };
}

/**
 * Split query into primary and archive queries based on date range
 * @param {Object} query - Original query
 * @param {string} dateField - Name of date field
 * @returns {Object} - { primaryQuery, archiveQuery, queryBoth }
 */
function splitQueryByDate(query, dateField) {
  const dateRange = extractDateRange(query, dateField);
  const queryBoth = shouldQueryArchive(dateRange?.startDate, dateRange?.endDate) &&
                    shouldQueryPrimary(dateRange?.startDate, dateRange?.endDate);
  
  // If querying both, we need to split the date range
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() - 2); // Archive threshold
  
  const primaryQuery = { ...query };
  const archiveQuery = { ...query };
  
  if (dateRange && queryBoth) {
    // Split date range at threshold
    if (dateRange.startDate && dateRange.endDate) {
      // Primary: from threshold to endDate
      primaryQuery[dateField] = {
        $gte: dateRange.startDate < threshold ? threshold : dateRange.startDate,
        $lte: dateRange.endDate,
      };
      
      // Archive: from startDate to threshold
      archiveQuery[dateField] = {
        $gte: dateRange.startDate,
        $lt: dateRange.endDate < threshold ? dateRange.endDate : threshold,
      };
    } else if (dateRange.startDate) {
      // Only start date
      primaryQuery[dateField] = {
        $gte: dateRange.startDate < threshold ? threshold : dateRange.startDate,
      };
      archiveQuery[dateField] = {
        $lt: threshold,
      };
    } else if (dateRange.endDate) {
      // Only end date
      primaryQuery[dateField] = {
        $lte: dateRange.endDate,
      };
      archiveQuery[dateField] = {
        $lt: dateRange.endDate < threshold ? dateRange.endDate : threshold,
      };
    }
  } else if (dateRange) {
    // Only query one database
    if (shouldQueryArchive(dateRange.startDate, dateRange.endDate)) {
      // Remove date from primary query (won't query it)
      delete primaryQuery[dateField];
    } else {
      // Remove date from archive query (won't query it)
      delete archiveQuery[dateField];
    }
  }
  
  return { primaryQuery, archiveQuery, queryBoth };
}

/**
 * Unified query for Sales
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - { data: Array, total: number, fromArchive: number, fromPrimary: number }
 */
async function queryUnifiedSales(query, options = {}) {
  const {
    populate = [],
    sort = { saleDate: -1, createdAt: -1 },
    skip = 0,
    limit = 50,
    lean = true,
  } = options;
  
  // Determine which database(s) to query
  const dateRange = extractDateRange(query, 'saleDate');
  const queryArchive = shouldQueryArchive(dateRange?.startDate, dateRange?.endDate);
  const queryPrimary = shouldQueryPrimary(dateRange?.startDate, dateRange?.endDate);
  
  let primaryResults = [];
  let archiveResults = [];
  let primaryCount = 0;
  let archiveCount = 0;
  
  // Query primary database
  if (queryPrimary) {
    try {
      let primaryQuery = Sale.find(query);
      
      // Apply populate
      populate.forEach(pop => {
        if (typeof pop === 'string') {
          primaryQuery = primaryQuery.populate(pop);
        } else if (typeof pop === 'object') {
          primaryQuery = primaryQuery.populate(pop);
        }
      });
      
      // Apply sort
      if (sort) {
        primaryQuery = primaryQuery.sort(sort);
      }
      
      // Apply lean
      if (lean) {
        primaryQuery = primaryQuery.lean();
      }
      
      // Get count
      primaryCount = await Sale.countDocuments(query);
      
      // Get data (with pagination)
      primaryQuery = primaryQuery.skip(skip).limit(limit);
      primaryResults = await primaryQuery.exec();
    } catch (error) {
      console.error('Error querying primary sales:', error);
    }
  }
  
  // Query archive database
  if (queryArchive) {
    try {
      // Calculate how many to get from archive if we already have some from primary
      const archiveLimit = queryPrimary ? Math.max(0, limit - primaryResults.length) : limit;
      const archiveSkip = queryPrimary && primaryResults.length < limit ? 0 : skip;
      
      archiveResults = await queryArchiveSales(query, {
        populate,
        sort,
        skip: archiveSkip,
        limit: archiveLimit,
        lean,
      });
      
      archiveCount = await countArchiveSales(query);
      
      // Normalize archive results
      archiveResults = archiveResults.map(normalizeArchiveRecord);
    } catch (error) {
      console.error('Error querying archive sales:', error);
    }
  }
  
  // Merge results (primary first, then archive)
  const mergedResults = [...primaryResults, ...archiveResults];
  
  // Re-sort if needed (in case we got results from both)
  if (queryArchive && queryPrimary && mergedResults.length > 0) {
    mergedResults.sort((a, b) => {
      const dateA = new Date(a.saleDate || a.createdAt);
      const dateB = new Date(b.saleDate || b.createdAt);
      return dateB - dateA; // Descending
    });
    
    // Apply limit after merge
    if (mergedResults.length > limit) {
      mergedResults.splice(limit);
    }
  }
  
  return {
    data: mergedResults,
    total: primaryCount + archiveCount,
    fromPrimary: primaryResults.length,
    fromArchive: archiveResults.length,
    primaryCount,
    archiveCount,
  };
}

/**
 * Unified query for Payments
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - { data: Array, total: number, fromArchive: number, fromPrimary: number }
 */
async function queryUnifiedPayments(query, options = {}) {
  const {
    populate = [],
    sort = { transactionDate: -1, createdAt: -1 },
    skip = 0,
    limit = 50,
    lean = true,
  } = options;
  
  // Determine which database(s) to query
  const dateRange = extractDateRange(query, 'transactionDate') || extractDateRange(query, 'createdAt');
  const queryArchive = shouldQueryArchive(dateRange?.startDate, dateRange?.endDate);
  const queryPrimary = shouldQueryPrimary(dateRange?.startDate, dateRange?.endDate);
  
  let primaryResults = [];
  let archiveResults = [];
  let primaryCount = 0;
  let archiveCount = 0;
  
  // Query primary database
  if (queryPrimary) {
    try {
      let primaryQuery = Payment.find(query);
      
      // Apply populate
      populate.forEach(pop => {
        if (typeof pop === 'string') {
          primaryQuery = primaryQuery.populate(pop);
        } else if (typeof pop === 'object') {
          primaryQuery = primaryQuery.populate(pop);
        }
      });
      
      // Apply sort
      if (sort) {
        primaryQuery = primaryQuery.sort(sort);
      }
      
      // Apply lean
      if (lean) {
        primaryQuery = primaryQuery.lean();
      }
      
      // Get count
      primaryCount = await Payment.countDocuments(query);
      
      // Get data (with pagination)
      primaryQuery = primaryQuery.skip(skip).limit(limit);
      primaryResults = await primaryQuery.exec();
    } catch (error) {
      console.error('Error querying primary payments:', error);
    }
  }
  
  // Query archive database
  if (queryArchive) {
    try {
      const archiveLimit = queryPrimary ? Math.max(0, limit - primaryResults.length) : limit;
      const archiveSkip = queryPrimary && primaryResults.length < limit ? 0 : skip;
      
      archiveResults = await queryArchivePayments(query, {
        populate,
        sort,
        skip: archiveSkip,
        limit: archiveLimit,
        lean,
      });
      
      archiveCount = await countArchivePayments(query);
      
      // Normalize archive results
      archiveResults = archiveResults.map(normalizeArchiveRecord);
    } catch (error) {
      console.error('Error querying archive payments:', error);
    }
  }
  
  // Merge results
  const mergedResults = [...primaryResults, ...archiveResults];
  
  // Re-sort if needed
  if (queryArchive && queryPrimary && mergedResults.length > 0) {
    mergedResults.sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.createdAt);
      const dateB = new Date(b.transactionDate || b.createdAt);
      return dateB - dateA;
    });
    
    if (mergedResults.length > limit) {
      mergedResults.splice(limit);
    }
  }
  
  return {
    data: mergedResults,
    total: primaryCount + archiveCount,
    fromPrimary: primaryResults.length,
    fromArchive: archiveResults.length,
    primaryCount,
    archiveCount,
  };
}

/**
 * Unified query for Dealer Requests
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - { data: Array, total: number, fromArchive: number, fromPrimary: number }
 */
async function queryUnifiedDealerRequests(query, options = {}) {
  const {
    populate = [],
    sort = { requestedAt: -1, createdAt: -1 },
    skip = 0,
    limit = 50,
    lean = true,
  } = options;
  
  // Determine which database(s) to query
  const dateRange = extractDateRange(query, 'requestedAt') || extractDateRange(query, 'createdAt');
  const queryArchive = shouldQueryArchive(dateRange?.startDate, dateRange?.endDate);
  const queryPrimary = shouldQueryPrimary(dateRange?.startDate, dateRange?.endDate);
  
  let primaryResults = [];
  let archiveResults = [];
  let primaryCount = 0;
  let archiveCount = 0;
  
  // Query primary database
  if (queryPrimary) {
    try {
      let primaryQuery = DealerRequest.find(query);
      
      // Apply populate
      populate.forEach(pop => {
        if (typeof pop === 'string') {
          primaryQuery = primaryQuery.populate(pop);
        } else if (typeof pop === 'object') {
          primaryQuery = primaryQuery.populate(pop);
        }
      });
      
      // Apply sort
      if (sort) {
        primaryQuery = primaryQuery.sort(sort);
      }
      
      // Apply lean
      if (lean) {
        primaryQuery = primaryQuery.lean();
      }
      
      // Get count
      primaryCount = await DealerRequest.countDocuments(query);
      
      // Get data (with pagination)
      primaryQuery = primaryQuery.skip(skip).limit(limit);
      primaryResults = await primaryQuery.exec();
    } catch (error) {
      console.error('Error querying primary dealer requests:', error);
    }
  }
  
  // Query archive database
  if (queryArchive) {
    try {
      const archiveLimit = queryPrimary ? Math.max(0, limit - primaryResults.length) : limit;
      const archiveSkip = queryPrimary && primaryResults.length < limit ? 0 : skip;
      
      archiveResults = await queryArchiveDealerRequests(query, {
        populate,
        sort,
        skip: archiveSkip,
        limit: archiveLimit,
        lean,
      });
      
      archiveCount = await countArchiveDealerRequests(query);
      
      // Normalize archive results
      archiveResults = archiveResults.map(normalizeArchiveRecord);
    } catch (error) {
      console.error('Error querying archive dealer requests:', error);
    }
  }
  
  // Merge results
  const mergedResults = [...primaryResults, ...archiveResults];
  
  // Re-sort if needed
  if (queryArchive && queryPrimary && mergedResults.length > 0) {
    mergedResults.sort((a, b) => {
      const dateA = new Date(a.requestedAt || a.createdAt);
      const dateB = new Date(b.requestedAt || b.createdAt);
      return dateB - dateA;
    });
    
    if (mergedResults.length > limit) {
      mergedResults.splice(limit);
    }
  }
  
  return {
    data: mergedResults,
    total: primaryCount + archiveCount,
    fromPrimary: primaryResults.length,
    fromArchive: archiveResults.length,
    primaryCount,
    archiveCount,
  };
}

module.exports = {
  queryUnifiedSales,
  queryUnifiedPayments,
  queryUnifiedDealerRequests,
  extractDateRange,
  splitQueryByDate,
};

