const mongoose = require('mongoose');

const dealerProfileSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
    comment: 'Dealer user reference',
  },
  // Personal Information
  name: {
    type: String,
    trim: true,
    comment: 'Dealer full name',
  },
  personalPhone: {
    type: String,
    trim: true,
    comment: 'Personal phone number',
  },
  personalEmail: {
    type: String,
    trim: true,
    lowercase: true,
    comment: 'Personal email (if different from account email)',
  },
  homeAddress: {
    type: String,
    trim: true,
    comment: 'Home address',
  },
  homeCity: {
    type: String,
    trim: true,
    comment: 'Home city',
  },
  homeState: {
    type: String,
    trim: true,
    comment: 'Home state',
  },
  homePincode: {
    type: String,
    trim: true,
    comment: 'Home pincode',
  },
  // Company Information
  companyName: {
    type: String,
    trim: true,
    comment: 'Company/Business name',
  },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
    comment: 'GST registration number',
  },
  panNumber: {
    type: String,
    trim: true,
    uppercase: true,
    comment: 'PAN number',
  },
  companyPhone: {
    type: String,
    trim: true,
    comment: 'Company phone number',
  },
  companyEmail: {
    type: String,
    trim: true,
    lowercase: true,
    comment: 'Company email',
  },
  officeAddress: {
    type: String,
    trim: true,
    comment: 'Office address',
  },
  officeCity: {
    type: String,
    trim: true,
    comment: 'Office city',
  },
  officeState: {
    type: String,
    trim: true,
    comment: 'Office state',
  },
  officePincode: {
    type: String,
    trim: true,
    comment: 'Office pincode',
  },
  // Bank Details
  bankName: {
    type: String,
    trim: true,
    comment: 'Bank name',
  },
  accountNumber: {
    type: String,
    trim: true,
    comment: 'Bank account number',
  },
  ifscCode: {
    type: String,
    trim: true,
    uppercase: true,
    comment: 'IFSC code',
  },
  accountHolderName: {
    type: String,
    trim: true,
    comment: 'Account holder name',
  },
  // Additional Information
  businessType: {
    type: String,
    trim: true,
    enum: ['sole_proprietorship', 'partnership', 'private_limited', 'llp', 'other'],
    comment: 'Type of business',
  },
  yearOfEstablishment: {
    type: Number,
    min: [1900, 'Year must be valid'],
    max: [new Date().getFullYear(), 'Year cannot be in the future'],
    comment: 'Year business was established',
  },
  website: {
    type: String,
    trim: true,
    comment: 'Company website',
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    comment: 'Additional notes',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Index for faster queries
dealerProfileSchema.index({ dealer: 1 });

// Virtual for dealer info
dealerProfileSchema.virtual('dealerInfo', {
  ref: 'User',
  localField: 'dealer',
  foreignField: '_id',
  justOne: true,
});

module.exports = mongoose.model('DealerProfile', dealerProfileSchema);

