const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    en: { type: String, required: true, trim: true },
    gu: { type: String, trim: true },
  },
  description: {
    en: { type: String, trim: true, default: '' },
    gu: { type: String, trim: true, default: '' },
  },
  packetPrice: {
    type: Number,
    required: [true, 'Packet price is required'],
    min: [0, 'Price must be positive'],
  },
  // Immutable "original" packet price captured at product creation time.
  // Used for invoice display (historical/base rate reference).
  initialPacketPrice: {
    type: Number,
    // NOTE: do not mark required to avoid breaking saves for legacy products
    // that were created before this field existed.
    min: [0, 'Price must be positive'],
    default: function () {
      return this.packetPrice;
    },
  },
  packetsPerStrip: {
    type: Number,
    required: [true, 'Packets per strip is required'],
    min: [1, 'Must have at least 1 packet per strip'],
  },
  image: {
    type: String,
    required: [true, 'Product image is required'],
    trim: true,
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0,
    comment: 'Stock in strips (not packets)',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

// Backfill initialPacketPrice for legacy docs on any save/validate.
productSchema.pre('validate', function (next) {
  if (this.initialPacketPrice === undefined || this.initialPacketPrice === null) {
    this.initialPacketPrice = this.packetPrice;
  }
  next();
});

// Indexes for faster queries
// CreatedBy queries (for filtering products by creator)
productSchema.index({ createdBy: 1 });
productSchema.index({ createdBy: 1, createdAt: -1 });

// Date queries
productSchema.index({ createdAt: -1 });
productSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Product', productSchema);

