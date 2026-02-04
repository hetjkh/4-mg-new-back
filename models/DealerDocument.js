const mongoose = require('mongoose');

const dealerDocumentSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    comment: 'Dealer who uploaded the document',
  },
  title: {
    type: String,
    required: [true, 'Document title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
    comment: 'Title/name of the document',
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: '',
    comment: 'Optional description of the document',
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required'],
    trim: true,
    comment: 'URL of the uploaded document file',
  },
  fileType: {
    type: String,
    required: true,
    enum: ['image', 'pdf', 'document', 'other'],
    default: 'document',
    comment: 'Type of document file',
  },
  fileName: {
    type: String,
    trim: true,
    comment: 'Original filename of the document',
  },
  fileSize: {
    type: Number,
    comment: 'File size in bytes',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    comment: 'Date when document was uploaded',
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User who uploaded the document (should be the dealer)',
  },
  viewedBy: [{
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isActive: {
    type: Boolean,
    default: true,
    comment: 'Whether the document is active (not deleted)',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better query performance
dealerDocumentSchema.index({ dealer: 1, uploadedAt: -1 });
dealerDocumentSchema.index({ dealer: 1, isActive: 1 });

// Virtual for dealer info
dealerDocumentSchema.virtual('dealerInfo', {
  ref: 'User',
  localField: 'dealer',
  foreignField: '_id',
  justOne: true,
});

module.exports = mongoose.model('DealerDocument', dealerDocumentSchema);

