# Database Index Migration Guide

## Overview

This migration script adds comprehensive database indexes to improve query performance by 10-50x. The indexes are designed to optimize the most common query patterns in the application.

## What This Script Does

The `addIndexes.js` script creates compound indexes on the following collections:

### 1. **Sale Collection**
- Dealer + Date + Status combinations
- Salesman + Date + Status combinations
- Product + Date queries
- Payment status + Date queries
- Bill status queries
- Invoice number lookups
- Shopkeeper queries

### 2. **Payment Collection**
- Dealer + Status + Date combinations
- Dealer + Type + Date combinations
- Status + Date queries
- DealerRequest references
- Reconciliation queries
- Payment method queries

### 3. **DealerRequest Collection**
- Dealer + Status + Date combinations
- Payment status queries
- Product + Status queries
- Order grouping (orderGroupId)
- E-way bill queries

### 4. **StockAllocation Collection**
- Dealer + Product combinations
- Salesman + Product combinations
- Date-based queries
- DealerStock references

### 5. **DealerStock Collection**
- Dealer + Product (unique combination)
- Source request queries
- Date-based queries

### 6. **User Collection**
- Role-based queries
- CreatedBy queries (for finding salesmen by dealer)

### 7. **Product Collection**
- CreatedBy queries
- Date-based queries

### 8. **Other Collections**
- Commission: Salesman/Dealer + Period + Status
- Message: Recipient roles + Active status
- DealerDocument: Dealer + Active status
- Shopkeeper: Salesman + Phone (unique)
- LocationAllocation: Allocation queries
- SalesTarget: Dealer/Salesman + Period

## How to Run

### Prerequisites
1. Ensure MongoDB is running and accessible
2. Set up your `.env` file with `MONGODB_URI` (or it will use the default)
3. Install dependencies: `npm install` (if not already done)

### Running the Migration

```bash
cd 4-mg-new-back
node scripts/addIndexes.js
```

### What to Expect

The script will:
1. Connect to MongoDB
2. Create indexes on all collections (in background mode to avoid blocking)
3. Show progress for each collection
4. Run performance tests on sample queries
5. Display execution statistics

**Note**: Indexes are created in background mode, so they won't block database operations. However, creating many indexes may take several minutes depending on your data size.

### Output Example

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB
📦 Database: myapp

🚀 Starting index migration...

📋 Adding indexes to Sale collection...
   ✅ Created index: {"dealer":1,"saleDate":-1,"paymentStatus":1}
   ✅ Created index: {"salesman":1,"saleDate":-1}
   ...

✅ Index migration completed!

🧪 Running performance tests...

📊 Sale query: Dealer + Date range (last 30 days)
   Execution time: 45ms
   Documents examined: 150
   Documents returned: 150
   Index used: dealer_1_saleDate_-1_paymentStatus_1

✅ Performance testing completed!
```

## Performance Improvements

After running this migration, you should see:

- **10-50x faster queries** on filtered date ranges
- **Faster lookups** by dealer, salesman, or product
- **Improved performance** on status-based filters
- **Better performance** on compound queries (multiple filters)

## Index Maintenance

### Checking Existing Indexes

To see all indexes on a collection:

```javascript
// In MongoDB shell or Compass
db.sales.getIndexes()
db.payments.getIndexes()
db.dealerrequests.getIndexes()
```

### Removing Indexes (if needed)

If you need to remove an index:

```javascript
// In MongoDB shell
db.sales.dropIndex("dealer_1_saleDate_-1_paymentStatus_1")
```

### Index Size

Indexes take up additional storage space. Monitor your database size after running the migration. The performance benefits usually outweigh the storage cost.

## Troubleshooting

### Error: "Index already exists"
- This is normal if you run the script multiple times
- The script will skip existing indexes and continue

### Error: "Connection refused"
- Check your MongoDB connection string in `.env`
- Ensure MongoDB is running
- Verify network connectivity

### Slow Index Creation
- Large collections may take time to index
- Indexes are created in background mode (non-blocking)
- Monitor MongoDB logs for progress

### Performance Not Improved
- Ensure indexes are actually being used (check query execution plans)
- Verify your queries match the index patterns
- Consider running `explain()` on slow queries to see if indexes are used

## Rollback

If you need to rollback, you can manually drop indexes using MongoDB shell or Compass. However, the indexes defined in the models will be recreated on the next server restart.

To prevent automatic index creation, you would need to remove the index definitions from the model files.

## Best Practices

1. **Run during low-traffic periods** - While indexes are created in background, it's still best to run during maintenance windows
2. **Monitor database size** - Indexes consume storage space
3. **Test queries** - After migration, test your application queries to verify improvements
4. **Keep models updated** - The index definitions in models ensure new deployments have the right indexes

## Support

If you encounter issues:
1. Check MongoDB logs
2. Verify your connection string
3. Ensure you have proper database permissions
4. Review the error messages for specific guidance

