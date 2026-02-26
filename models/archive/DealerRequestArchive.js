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

const dealerRequestArchiveSchema = new mongoose.Schema({
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
  totalAmount: {
    type: Number,
    default: null,
    comment: 'Total amount for this request (strips * packetsPerStrip * packetPrice)',
  },
  paidAmount: {
    type: Number,
    default: 0,
    comment: 'Amount paid by dealer (for partial payments)',
  },
  paymentType: {
    type: String,
    enum: ['full', 'partial', 'none'],
    default: 'none',
    comment: 'Payment type: full (fully paid), partial (partially paid), none (not paid)',
  },
  isOutstanding: {
    type: Boolean,
    default: false,
    comment: 'Whether this request has outstanding payment (approved without full payment)',
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
  destination: {
    type: String,
    trim: true,
    default: null,
    comment: 'Destination address for bill dispatch',
  },
  vehicleNumber: {
    type: String,
    trim: true,
    default: null,
    comment: 'Vehicle number used for dispatch',
  },
  dispatchedDocNo: {
    type: String,
    trim: true,
    default: null,
    comment: 'Dispatched document number',
  },
  ewayBillNo: {
    type: String,
    trim: true,
    default: null,
    comment: 'E-Way Bill number generated for this request',
  },
  ewayBillDate: {
    type: Date,
    default: null,
    comment: 'Date when e-way bill was generated',
  },
  ewayBillValidUpto: {
    type: Date,
    default: null,
    comment: 'E-Way Bill validity date',
  },
  ewayBillGeneratedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Admin who generated the e-way bill',
  },
  ewayBillStatus: {
    type: String,
    enum: ['not_generated', 'active', 'cancelled', 'expired'],
    default: 'not_generated',
    comment: 'E-Way Bill status',
  },
  invoiceSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    comment: 'Invoice snapshot stored when bill is sent - preserves historical invoice data for accuracy',
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

// Indexes for faster queries (same as original DealerRequest model)
dealerRequestArchiveSchema.index({ status: 1 });
dealerRequestArchiveSchema.index({ paymentStatus: 1 });
dealerRequestArchiveSchema.index({ product: 1 });
dealerRequestArchiveSchema.index({ dealer: 1, status: 1, createdAt: -1 });
dealerRequestArchiveSchema.index({ dealer: 1, paymentStatus: 1, createdAt: -1 });
dealerRequestArchiveSchema.index({ originalId: 1 });

// Create model using archive connection (lazy initialization)
let DealerRequestArchiveModel = null;

function getModel() {
  if (!DealerRequestArchiveModel) {
    const archiveConnection = getArchiveConnectionSafe();
    DealerRequestArchiveModel = archiveConnection.models.DealerRequestArchive || archiveConnection.model('DealerRequestArchive', dealerRequestArchiveSchema);
  }
  return DealerRequestArchiveModel;
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

