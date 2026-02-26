# Unified Query System

The unified query system provides seamless access to data across both the primary and archive databases. Queries are automatically routed to the appropriate database(s) based on date ranges.

## Overview

Instead of having separate endpoints for archived data, the unified query system:
- Automatically determines which database(s) to query based on date ranges
- Merges results from both databases when needed
- Maintains the same API so existing code doesn't need changes
- Optimizes performance by only querying archive when necessary

## How It Works

### Smart Routing

The system uses a **2-year threshold** to determine which database to query:

- **Recent data** (< 2 years old): Queries primary database only
- **Old data** (> 2 years old): Queries archive database only
- **Spanning data** (crosses threshold): Queries both databases and merges results
- **No date filter**: Queries both databases to be safe

### Date Field Detection

The system automatically detects date fields in queries:
- **Sales**: `saleDate`
- **Payments**: `transactionDate` or `createdAt`
- **Dealer Requests**: `requestedAt` or `createdAt`

## Usage

### In Routes

```javascript
const { queryUnifiedSales } = require('../utils/unifiedQuery');

// Instead of:
const sales = await Sale.find(query)
  .populate('product', 'title')
  .sort({ saleDate: -1 })
  .skip(skip)
  .limit(limit)
  .lean();

// Use:
const result = await queryUnifiedSales(query, {
  populate: [
    { path: 'product', select: 'title' },
  ],
  sort: { saleDate: -1 },
  skip,
  limit,
  lean: true,
});

const sales = result.data;
const total = result.total;
```

### Query Functions

#### `queryUnifiedSales(query, options)`
Query sales from both primary and archive databases.

**Parameters:**
- `query` - Mongoose query object
- `options` - Query options:
  - `populate` - Array of populate options
  - `sort` - Sort object
  - `skip` - Skip number
  - `limit` - Limit number
  - `lean` - Use lean queries (default: true)

**Returns:**
```javascript
{
  data: Array,           // Merged results
  total: number,         // Total count (primary + archive)
  fromPrimary: number,   // Number of results from primary
  fromArchive: number,   // Number of results from archive
  primaryCount: number,  // Total count in primary
  archiveCount: number,  // Total count in archive
}
```

#### `queryUnifiedPayments(query, options)`
Query payments from both primary and archive databases.

#### `queryUnifiedDealerRequests(query, options)`
Query dealer requests from both primary and archive databases.

## Examples

### Example 1: Recent Data (Primary Only)

```javascript
const recentQuery = {
  billStatus: 'approved',
  saleDate: { $gte: new Date('2024-01-01'), $lte: new Date() }
};

const result = await queryUnifiedSales(recentQuery, {
  populate: [{ path: 'product', select: 'title' }],
  sort: { saleDate: -1 },
  limit: 50,
});

// result.fromArchive will be 0 (only queries primary)
```

### Example 2: Old Data (Archive Only)

```javascript
const oldQuery = {
  billStatus: 'approved',
  saleDate: { $gte: new Date('2020-01-01'), $lte: new Date('2020-12-31') }
};

const result = await queryUnifiedSales(oldQuery, {
  populate: [{ path: 'product', select: 'title' }],
  sort: { saleDate: -1 },
  limit: 50,
});

// result.fromPrimary will be 0 (only queries archive)
```

### Example 3: Spanning Data (Both)

```javascript
const spanQuery = {
  billStatus: 'approved',
  saleDate: { $gte: new Date('2021-01-01'), $lte: new Date() }
};

const result = await queryUnifiedSales(spanQuery, {
  populate: [{ path: 'product', select: 'title' }],
  sort: { saleDate: -1 },
  limit: 50,
});

// result.fromPrimary > 0 and result.fromArchive > 0
// Results are merged and re-sorted
```

## Archive Query Utilities

The `archiveQuery.js` module provides lower-level utilities:

### `shouldQueryArchive(startDate, endDate)`
Returns `true` if archive database should be queried.

### `shouldQueryPrimary(startDate, endDate)`
Returns `true` if primary database should be queried.

### `getArchiveThresholdDate()`
Returns the threshold date (2 years ago).

### `queryArchiveSales(query, options)`
Query archive sales directly.

### `normalizeArchiveRecord(record)`
Normalize archive record to match main model structure.

## Performance Considerations

1. **Date Filters**: Always include date filters when possible to avoid querying both databases
2. **Pagination**: Unified queries handle pagination across both databases
3. **Caching**: Archive queries can be cached longer since data doesn't change
4. **Indexes**: Archive models have the same indexes as primary models

## Testing

Run the test script to verify unified queries:

```bash
node scripts/testUnifiedQueries.js
```

This will test:
- Recent data queries (primary only)
- Old data queries (archive only)
- Spanning queries (both)
- Queries without date filters (both)

## Migration Notes

When migrating existing routes:

1. **Import unified query function**:
   ```javascript
   const { queryUnifiedSales } = require('../utils/unifiedQuery');
   ```

2. **Replace Sale.find() with queryUnifiedSales()**:
   ```javascript
   // Before
   const sales = await Sale.find(query).populate(...).lean();
   const total = await Sale.countDocuments(query);
   
   // After
   const result = await queryUnifiedSales(query, { populate: [...], lean: true });
   const sales = result.data;
   const total = result.total;
   ```

3. **Update response structure** (if needed):
   ```javascript
   // Optional: Include metadata about data sources
   res.json({
     success: true,
     data: {
       sales: result.data,
       pagination: { ... },
       metadata: {
         fromPrimary: result.fromPrimary,
         fromArchive: result.fromArchive,
       }
     }
   });
   ```

## Benefits

1. **Transparent**: Routes don't need to know about archive
2. **Automatic**: Smart routing based on dates
3. **Efficient**: Only queries archive when needed
4. **Consistent**: Same API as before
5. **Future-proof**: Easy to adjust threshold or add more databases

## Configuration

The archive threshold is configurable in `utils/archiveQuery.js`:

```javascript
const ARCHIVE_THRESHOLD_YEARS = 2; // Change this to adjust threshold
```

## Notes

- Archive records have `originalId` field storing the original `_id` from primary database
- Archive records have `archivedAt` field recording when they were archived
- Results are automatically normalized to match primary model structure
- Pagination works across both databases (results are merged and re-sorted)

