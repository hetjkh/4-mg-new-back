# Archive Database Setup

This document describes the archive database infrastructure for storing historical data.

## Overview

The archive database is a separate MongoDB database/cluster used to store old records that are no longer actively used but need to be retained for historical purposes, compliance, or reporting.

## Architecture

- **Main Database**: Active production database (default mongoose connection)
- **Archive Database**: Separate MongoDB cluster for archived data (separate mongoose connection)

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Main database (existing)
MONGODB_URI=mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/myapp?appName=Cluster0

# Archive database
ARCHIVE_MONGODB_URI=mongodb+srv://hetjani818_db_user:123@cluster0.6s5idrd.mongodb.net/archive?appName=Cluster0
```

### Database Connection

The dual database connection is managed in `config/database.js`:

- `initializeDatabases()`: Initializes both main and archive connections
- `getMainConnection()`: Returns the main database connection
- `getArchiveConnection()`: Returns the archive database connection

## Archive Models

Archive models are located in `models/archive/`:

1. **SaleArchive** (`models/archive/SaleArchive.js`)
   - Stores archived sales records
   - Includes `archivedAt` and `originalId` fields
   - Same schema as `Sale` model

2. **PaymentArchive** (`models/archive/PaymentArchive.js`)
   - Stores archived payment records
   - Includes `archivedAt` and `originalId` fields
   - Same schema as `Payment` model

3. **DealerRequestArchive** (`models/archive/DealerRequestArchive.js`)
   - Stores archived dealer request records
   - Includes `archivedAt` and `originalId` fields
   - Same schema as `DealerRequest` model

## Usage

### Importing Archive Models

```javascript
const SaleArchive = require('./models/archive/SaleArchive');
const PaymentArchive = require('./models/archive/PaymentArchive');
const DealerRequestArchive = require('./models/archive/DealerRequestArchive');
```

### Archiving Records

Example: Archive old sales records

```javascript
const Sale = require('./models/Sale');
const SaleArchive = require('./models/archive/SaleArchive');

// Find records to archive (e.g., older than 2 years)
const cutoffDate = new Date();
cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);

const salesToArchive = await Sale.find({
  saleDate: { $lt: cutoffDate },
  billStatus: 'approved'
});

// Archive each record
for (const sale of salesToArchive) {
  const archiveData = sale.toObject();
  archiveData.originalId = sale._id;
  archiveData.archivedAt = new Date();
  
  await SaleArchive.create(archiveData);
  
  // Delete from main database
  await Sale.deleteOne({ _id: sale._id });
}
```

### Querying Archived Records

```javascript
const SaleArchive = require('./models/archive/SaleArchive');

// Find archived sales
const archivedSales = await SaleArchive.find({
  dealer: dealerId,
  saleDate: { $gte: startDate, $lte: endDate }
}).populate('product', 'title packetPrice');
```

## Archive Criteria

Consider archiving records that:

1. **Sales**: Older than 2-3 years, fully processed and approved
2. **Payments**: Older than 2-3 years, status is 'completed' or 'reconciled'
3. **Dealer Requests**: Older than 2-3 years, status is 'approved' or 'cancelled'

## Benefits

1. **Performance**: Reduces main database size, improving query performance
2. **Cost**: Archive database can use cheaper storage tiers
3. **Compliance**: Maintains historical records for auditing
4. **Scalability**: Keeps main database focused on active data

## Testing

To test the archive connection:

```javascript
const { initializeDatabases, getArchiveConnection } = require('./config/database');

async function testArchive() {
  await initializeDatabases();
  const archiveConn = getArchiveConnection();
  console.log('Archive connection state:', archiveConn.readyState);
}
```

## Notes

- Archive models use lazy initialization to avoid connection issues
- The `originalId` field stores the original `_id` from the main database
- The `archivedAt` field records when the record was archived
- Archive models maintain the same indexes as their main counterparts for query performance

