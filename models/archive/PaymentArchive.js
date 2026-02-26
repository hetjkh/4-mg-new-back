const mongoose = require('mongoose');
const { getArchiveConnection } = require('../../config/database');

// Lazy-load archive connection to avoid initialization issues
function getArchiveConnectionSafe() {
  try {
    return getArchiveConnection();
  } catch (error) {
    throw new Error('Archive database not connected. Ensure initializeDatabases() is called first.');
  }
}

const paymentArchiveSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dealerRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealerRequest',
    default: null,
    comment: 'Associated dealer request if payment is for a request',
  },
  type: {
    type: String,
    enum: ['payment', 'refund', 'credit'],
    required: true,
    comment: 'Type of transaction: payment (dealer pays), refund (admin refunds), credit (credit adjustment)',
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Transaction amount in rupees',
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'bank_transfer', 'cash', 'credit', 'other'],
    default: 'upi',
    comment: 'Payment method used',
  },
  upiTransactionId: {
    type: String,
    trim: true,
    default: null,
    comment: 'UPI transaction ID if payment method is UPI',
  },
  upiReferenceNumber: {
    type: String,
    trim: true,
    default: null,
    comment: 'UPI reference number',
  },
  bankTransactionId: {
    type: String,
    trim: true,
    default: null,
    comment: 'Bank transaction ID if payment method is bank transfer',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    comment: 'Payment status',
  },
  receiptImage: {
    type: String,
    trim: true,
    default: null,
    comment: 'URL of payment receipt if uploaded',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Additional notes about the payment',
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Admin who processed/verified this payment',
  },
  processedAt: {
    type: Date,
    default: null,
    comment: 'When the payment was processed',
  },
  transactionDate: {
    type: Date,
    default: Date.now,
    comment: 'Date of the actual transaction',
  },
  reconciled: {
    type: Boolean,
    default: false,
    comment: 'Whether this payment has been reconciled',
  },
  reconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reconciledAt: {
    type: Date,
    default: null,
  },
  archivedAt: {
    type: Date,
    default: Date.now,
    comment: 'Date when this record was archived',
  },
  originalId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    comment: 'Original _id from main database before archiving',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for better query performance (same as original Payment model)
paymentArchiveSchema.index({ status: 1 });
paymentArchiveSchema.index({ type: 1 });
paymentArchiveSchema.index({ transactionDate: -1 });
paymentArchiveSchema.index({ dealer: 1, status: 1, transactionDate: -1 });
paymentArchiveSchema.index({ dealer: 1, createdAt: -1 });
paymentArchiveSchema.index({ originalId: 1 });

// Update updatedAt before saving
paymentArchiveSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create model using archive connection (lazy initialization)
let PaymentArchiveModel = null;

function getModel() {
  if (!PaymentArchiveModel) {
    const archiveConnection = getArchiveConnectionSafe();
    PaymentArchiveModel = archiveConnection.models.PaymentArchive || archiveConnection.model('PaymentArchive', paymentArchiveSchema);
  }
  return PaymentArchiveModel;
}

// Export a proxy that forwards all calls to the model
module.exports = new Proxy(function() {}, {
  get: (target, prop) => {
    const model = getModel();
    const value = model[prop];
    if (typeof value === 'function') {
      return value.bind(model);
    }
    return value;
  },
  apply: (target, thisArg, argumentsList) => {
    const model = getModel();
    return model.apply(model, argumentsList);
  },
  construct: (target, argumentsList) => {
    const model = getModel();
    return new model(...argumentsList);
  }
});

