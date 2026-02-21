const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  salesman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Salesman who earned the commission',
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Dealer who owns this salesman',
  },
  sale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    default: null,
    comment: 'Reference to the sale that generated this commission',
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true,
    comment: 'Commission period',
  },
  periodStart: {
    type: Date,
    required: true,
    comment: 'Start date of the commission period',
  },
  periodEnd: {
    type: Date,
    required: true,
    comment: 'End date of the commission period',
  },
  totalSalesAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Total sales amount for the period',
  },
  commissionRate: {
    type: Number,
    required: true,
    min: [0, 'Commission rate cannot be negative'],
    max: [100, 'Commission rate cannot exceed 100%'],
    comment: 'Commission rate as percentage',
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Calculated commission amount',
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'cancelled'],
    default: 'pending',
    comment: 'Commission payment status',
  },
  paidAt: {
    type: Date,
    default: null,
    comment: 'Date when commission was paid',
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'User who approved/paid the commission',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Additional notes about the commission',
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
// Single field indexes
commissionSchema.index({ status: 1 });

// Compound indexes for common query patterns
// Salesman queries
commissionSchema.index({ salesman: 1, periodStart: -1 });
commissionSchema.index({ salesman: 1, status: 1, periodStart: -1 });

// Dealer queries
commissionSchema.index({ dealer: 1, periodStart: -1 });
commissionSchema.index({ dealer: 1, status: 1, periodStart: -1 });

// Period queries
commissionSchema.index({ periodStart: 1, periodEnd: 1 });
commissionSchema.index({ period: 1, periodStart: -1 });

// Sale reference
commissionSchema.index({ sale: 1 });

// Update updatedAt before saving
commissionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Commission', commissionSchema);

