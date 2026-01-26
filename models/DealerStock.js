const mongoose = require('mongoose');

const dealerStockSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  totalStrips: {
    type: Number,
    required: true,
    min: [0, 'Total strips cannot be negative'],
    default: 0,
    comment: 'Total strips the dealer has from approved requests',
  },
  allocatedStrips: {
    type: Number,
    required: true,
    min: [0, 'Allocated strips cannot be negative'],
    default: 0,
    comment: 'Total strips allocated to salesmen',
  },
  availableStrips: {
    type: Number,
    required: true,
    min: [0, 'Available strips cannot be negative'],
    default: 0,
    comment: 'Available strips = totalStrips - allocatedStrips',
  },
  sourceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealerRequest',
    required: true,
    comment: 'The approved dealer request that added this stock',
  },
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Index for faster queries
dealerStockSchema.index({ dealer: 1, product: 1 });
dealerStockSchema.index({ dealer: 1 });

// Virtual to calculate available strips
dealerStockSchema.virtual('calculatedAvailable').get(function() {
  return this.totalStrips - this.allocatedStrips;
});

// Pre-save hook to update available strips
dealerStockSchema.pre('save', function(next) {
  this.availableStrips = this.totalStrips - this.allocatedStrips;
  if (this.availableStrips < 0) {
    return next(new Error('Allocated strips cannot exceed total strips'));
  }
  next();
});

module.exports = mongoose.model('DealerStock', dealerStockSchema);

