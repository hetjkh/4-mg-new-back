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

const saleArchiveSchema = new mongoose.Schema({
  salesman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Salesman who made the sale',
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Dealer who owns this salesman',
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    comment: 'Product sold',
  },
  stockAllocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockAllocation',
    default: null,
    comment: 'Reference to stock allocation if sale is from allocated stock',
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    comment: 'Number of packets sold',
  },
  strips: {
    type: Number,
    required: true,
    min: [0, 'Strips cannot be negative'],
    comment: 'Number of strips sold (calculated from quantity)',
  },
  unitPrice: {
    type: Number,
    required: true,
    min: [0, 'Unit price cannot be negative'],
    comment: 'Price per packet',
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative'],
    comment: 'Total sale amount (quantity * unitPrice)',
  },
  customerName: {
    type: String,
    trim: true,
    default: '',
    comment: 'Customer name (optional)',
  },
  customerPhone: {
    type: String,
    trim: true,
    default: '',
    comment: 'Customer phone number (optional)',
  },
  customerEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    comment: 'Customer email (optional)',
  },
  shopkeeper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shopkeeper',
    default: null,
    index: true,
    comment: 'Optional link to shopkeeper/customer master record',
  },
  invoiceNo: {
    type: String,
    trim: true,
    default: '',
    index: true,
    comment: 'Invoice / bill number to group multi-item bills',
  },
  location: {
    district: {
      type: String,
      trim: true,
      default: '',
    },
    taluka: {
      type: String,
      trim: true,
      default: '',
    },
    village: {
      type: String,
      trim: true,
      default: '',
    },
  },
  saleDate: {
    type: Date,
    default: Date.now,
    required: true,
    comment: 'Date of sale',
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank_transfer', 'credit', 'other'],
    default: 'cash',
    comment: 'Payment method used',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'partial'],
    default: 'completed',
    comment: 'Payment status',
  },
  billStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    comment: 'Bill approval status (for bills created by salesman)',
  },
  billApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Dealer who approved/rejected the bill',
  },
  billApprovedAt: {
    type: Date,
    default: null,
    comment: 'Date when bill was approved/rejected',
  },
  billRejectionReason: {
    type: String,
    trim: true,
    default: '',
    comment: 'Reason for bill rejection (if rejected)',
  },
  billPdfUrl: {
    type: String,
    trim: true,
    default: '',
    comment: 'URL of the generated PDF bill (stored when salesman generates it)',
  },
  billNameType: {
    type: String,
    enum: ['company', 'personal', null],
    default: null,
    comment: 'Name type used for bill generation (company or personal, only for dealer bills)',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    comment: 'Additional notes about the sale',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User who created this sale record',
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

// Indexes for better query performance (same as original Sale model)
saleArchiveSchema.index({ product: 1 });
saleArchiveSchema.index({ saleDate: -1 });
saleArchiveSchema.index({ paymentStatus: 1 });
saleArchiveSchema.index({ billStatus: 1 });
saleArchiveSchema.index({ dealer: 1, saleDate: -1, paymentStatus: 1 });
saleArchiveSchema.index({ dealer: 1, saleDate: -1, billStatus: 1 });
saleArchiveSchema.index({ salesman: 1, saleDate: -1 });
saleArchiveSchema.index({ originalId: 1 });

// Update updatedAt before saving
saleArchiveSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create model using archive connection (lazy initialization)
let SaleArchiveModel = null;

function getModel() {
  if (!SaleArchiveModel) {
    const archiveConnection = getArchiveConnectionSafe();
    SaleArchiveModel = archiveConnection.models.SaleArchive || archiveConnection.model('SaleArchive', saleArchiveSchema);
  }
  return SaleArchiveModel;
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

