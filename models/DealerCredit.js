const mongoose = require('mongoose');

const dealerCreditSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    comment: 'Dealer user ID',
  },
  creditLimit: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    comment: 'Credit limit in rupees',
  },
  currentBalance: {
    type: Number,
    required: true,
    default: 0,
    comment: 'Current outstanding balance (amount dealer owes)',
  },
  availableCredit: {
    type: Number,
    required: true,
    default: 0,
    comment: 'Available credit (creditLimit - currentBalance)',
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Admin who last updated the credit limit',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Notes about credit limit changes',
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

// Indexes
dealerCreditSchema.index({ dealer: 1 });

// Update updatedAt before saving
dealerCreditSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate available credit before saving
dealerCreditSchema.pre('save', function(next) {
  this.availableCredit = Math.max(0, this.creditLimit - this.currentBalance);
  next();
});

module.exports = mongoose.model('DealerCredit', dealerCreditSchema);


