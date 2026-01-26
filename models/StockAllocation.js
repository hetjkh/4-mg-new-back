const mongoose = require('mongoose');

const stockAllocationSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  salesman: {
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
  strips: {
    type: Number,
    required: [true, 'Number of strips is required'],
    min: [1, 'Must allocate at least 1 strip'],
    comment: 'Number of strips allocated to salesman',
  },
  dealerStock: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealerStock',
    required: true,
    comment: 'Reference to the dealer stock entry',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Optional notes about the allocation',
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
stockAllocationSchema.index({ dealer: 1, salesman: 1 });
stockAllocationSchema.index({ salesman: 1 });
stockAllocationSchema.index({ product: 1 });

module.exports = mongoose.model('StockAllocation', stockAllocationSchema);

