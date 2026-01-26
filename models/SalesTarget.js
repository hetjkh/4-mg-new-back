const mongoose = require('mongoose');

const salesTargetSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Dealer for whom target is set',
  },
  salesman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
    comment: 'Salesman for whom target is set (null for dealer-level target)',
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true,
    comment: 'Target period',
  },
  periodStart: {
    type: Date,
    required: true,
    comment: 'Start date of the target period',
  },
  periodEnd: {
    type: Date,
    required: true,
    comment: 'End date of the target period',
  },
  targetAmount: {
    type: Number,
    required: true,
    min: [0, 'Target amount cannot be negative'],
    comment: 'Target sales amount in rupees',
  },
  targetStrips: {
    type: Number,
    required: true,
    min: [0, 'Target strips cannot be negative'],
    comment: 'Target number of strips to sell',
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Current amount cannot be negative'],
    comment: 'Current sales amount achieved',
  },
  currentStrips: {
    type: Number,
    default: 0,
    min: [0, 'Current strips cannot be negative'],
    comment: 'Current strips sold',
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: 'Whether this target is currently active',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Additional notes about the target',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User who created this target (usually admin or dealer)',
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
salesTargetSchema.index({ dealer: 1, salesman: 1, periodStart: -1 });
salesTargetSchema.index({ periodStart: 1, periodEnd: 1 });
salesTargetSchema.index({ isActive: 1 });

// Update updatedAt before saving
salesTargetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate achievement percentage (virtual)
salesTargetSchema.virtual('achievementPercentage').get(function() {
  if (this.targetAmount === 0) return 0;
  return (this.currentAmount / this.targetAmount) * 100;
});

module.exports = mongoose.model('SalesTarget', salesTargetSchema);

