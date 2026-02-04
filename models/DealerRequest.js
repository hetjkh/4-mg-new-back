const mongoose = require('mongoose');

const dealerRequestSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  strips: {
    type: Number,
    required: [true, 'Number of strips is required'],
    min: [1, 'Must request at least 1 strip'],
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'cancelled'],
    default: 'pending',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'verified', 'rejected'],
    default: 'pending',
    comment: 'Payment status: pending (no payment), paid (receipt uploaded), verified (admin verified), rejected (admin rejected receipt)',
  },
  receiptImage: {
    type: String,
    trim: true,
    default: null,
    comment: 'URL of the payment receipt image uploaded by dealer',
  },
  paymentVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Admin who verified/rejected the payment',
  },
  paymentVerifiedAt: {
    type: Date,
    default: null,
  },
  paymentNotes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Admin notes about payment verification',
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  processedAt: {
    type: Date,
    default: null,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  billSent: {
    type: Boolean,
    default: false,
    comment: 'Whether the bill has been sent to the dealer',
  },
  billSentAt: {
    type: Date,
    default: null,
    comment: 'Date when the bill was sent to the dealer',
  },
  billSentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Admin who sent the bill',
  },
  orderGroupId: {
    type: String,
    trim: true,
    default: null,
    comment: 'Group ID to group multiple requests submitted together (e.g., from cart)',
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
dealerRequestSchema.index({ dealer: 1, status: 1 });
dealerRequestSchema.index({ product: 1, status: 1 });

module.exports = mongoose.model('DealerRequest', dealerRequestSchema);

