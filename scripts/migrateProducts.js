/**
 * Migration script to convert existing products to multilingual schema
 * Run this once after updating the Product model
 * 
 * Usage: node backend/scripts/migrateProducts.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import Product model
const Product = require('../models/Product');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/?appName=Cluster0';

async function migrateProducts() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const product of products) {
      // Check if product already has multilingual schema
      if (typeof product.title === 'object' && product.title.en) {
        console.log(`Product ${product._id} already migrated, skipping...`);
        skipped++;
        continue;
      }

      // Convert old format to new format
      const oldTitle = typeof product.title === 'string' ? product.title : (product.title?.en || '');
      const oldDescription = typeof product.description === 'string' 
        ? product.description 
        : (product.description?.en || '');

      // Update to multilingual schema
      product.title = {
        en: oldTitle,
        gu: '', // Empty for now, admin can add later
      };
      product.description = {
        en: oldDescription || '',
        gu: '', // Empty for now, admin can add later
      };

      await product.save();
      console.log(`Migrated product ${product._id}: "${oldTitle}"`);
      migrated++;
    }

    console.log('\nMigration complete!');
    console.log(`Migrated: ${migrated} products`);
    console.log(`Skipped: ${skipped} products (already migrated)`);

    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateProducts();

