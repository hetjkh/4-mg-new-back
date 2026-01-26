const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for better query performance
paymentSchema.index({ dealer: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ transactionDate: -1 });
paymentSchema.index({ upiTransactionId: 1 });
paymentSchema.index({ reconciled: 1 });

// Update updatedAt before saving
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);


