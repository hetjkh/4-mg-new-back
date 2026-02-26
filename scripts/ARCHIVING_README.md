# Data Archiving Scripts

This directory contains scripts for archiving old data from the main database to the archive database.

## Overview

The archiving system moves old records that are no longer actively used to a separate archive database. This helps:
- Improve main database performance
- Reduce main database size
- Maintain historical records for compliance
- Reduce costs (archive can use cheaper storage)

## Scripts

### Main Script

**`archiveOldData.js`** - Orchestrates archiving of all data types

### Individual Scripts

- **`archiveSales.js`** - Archives old sales records
- **`archivePayments.js`** - Archives old payment records
- **`archiveDealerRequests.js`** - Archives old dealer request records

## Usage

### Main Script (Recommended)

```bash
# Preview what would be archived (dry run)
node scripts/archiveOldData.js --all --dry-run

# Archive all data types older than 2 years
node scripts/archiveOldData.js --all

# Archive all data types older than 3 years
node scripts/archiveOldData.js --all --years=3

# Archive only sales records
node scripts/archiveOldData.js --sales --years=2

# Archive multiple types
node scripts/archiveOldData.js --sales --payments --years=2

# Test with limited records
node scripts/archiveOldData.js --all --limit=10 --dry-run
```

### Individual Scripts

```bash
# Archive sales (dry run)
node scripts/archiveSales.js --dry-run

# Archive sales older than 2 years
node scripts/archiveSales.js --years=2

# Archive payments with custom batch size
node scripts/archivePayments.js --years=2 --batch-size=50

# Archive dealer requests with limit (for testing)
node scripts/archiveDealerRequests.js --years=2 --limit=100
```

## Options

All scripts support the following options:

- `--years=N` - Archive records older than N years (default: 2)
- `--dry-run` - Preview what would be archived without making changes
- `--batch-size=N` - Process N records at a time (default: 100)
- `--limit=N` - Limit to N records (useful for testing)

## Archive Criteria

### Sales Records
- **Date**: `saleDate` older than specified years
- **Status**: `billStatus = 'approved'` AND `paymentStatus = 'completed'`
- **Reason**: Only archive fully processed and approved sales

### Payment Records
- **Date**: `transactionDate` or `createdAt` older than specified years
- **Status**: `status = 'completed'` OR `reconciled = true`
- **Reason**: Only archive completed or reconciled payments

### Dealer Request Records
- **Date**: `requestedAt` or `createdAt` older than specified years
- **Status**: `status IN ('approved', 'cancelled')`
- **Reason**: Only archive completed requests (not pending)

## Dry Run Mode

**Always run with `--dry-run` first** to preview what will be archived:

```bash
node scripts/archiveOldData.js --all --dry-run
```

This will:
- Show how many records would be archived
- Display sample records
- Not make any changes to the database

## Safety Features

1. **Dry Run Mode**: Preview changes before archiving
2. **Batch Processing**: Process records in batches to avoid memory issues
3. **Error Handling**: Continues processing even if individual records fail
4. **Duplicate Detection**: Handles cases where records might already be archived
5. **Progress Reporting**: Shows progress during archiving
6. **Summary Report**: Displays summary after completion

## Best Practices

1. **Always test first**: Use `--dry-run` and `--limit` to test
2. **Start small**: Use `--limit=10` for initial tests
3. **Monitor performance**: Watch database performance during archiving
4. **Backup first**: Ensure you have backups before archiving
5. **Schedule regularly**: Set up cron jobs to archive periodically
6. **Monitor archive**: Check archive database size and performance

## Scheduling

You can schedule archiving to run automatically using cron:

```bash
# Archive all data older than 2 years every month
0 2 1 * * cd /path/to/4-mg-new-back && node scripts/archiveOldData.js --all --years=2
```

## Troubleshooting

### Error: "Archive database not connected"
- Ensure archive database is configured in `.env`
- Run `node scripts/testArchiveConnection.js` to verify

### Error: "Duplicate key error"
- Record might already be archived
- Script will attempt to delete from main DB
- Check archive database for existing records

### Performance Issues
- Reduce `--batch-size` if memory issues occur
- Use `--limit` to process in smaller chunks
- Run during off-peak hours

## Example Output

```
🔄 Initializing databases...
✅ Databases initialized

📊 Archive Configuration:
   - Years old: 2
   - Cutoff date: 2022-01-01
   - Dry run: NO (will archive records)
   - Batch size: 100

📈 Found 1250 sales records eligible for archiving

🚀 Starting archiving process (max 1250 records)...

   ✅ Archived 50/1250 records (2.3s elapsed)
   ✅ Archived 100/1250 records (4.7s elapsed)
   ...

============================================================
📊 Archiving Summary:
============================================================
   Total eligible: 1250
   Archived: 1250
   Errors: 0
   Time elapsed: 45.2s
============================================================

✅ Archiving completed successfully!
```

## Notes

- Archiving is **irreversible** - archived records are moved, not copied
- The `originalId` field in archive models stores the original `_id` from main database
- The `archivedAt` field records when the record was archived
- Archive models maintain the same schema as main models for consistency

