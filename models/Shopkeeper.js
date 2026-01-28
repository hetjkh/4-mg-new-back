const mongoose = require('mongoose');

const shopkeeperSchema = new mongoose.Schema(
  {
    salesman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      comment: 'Salesman who manages this shopkeeper',
    },
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      comment: 'Dealer who owns this salesman (createdBy)',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    location: {
      district: { type: String, trim: true, default: '' },
      taluka: { type: String, trim: true, default: '' },
      village: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Unique-ish per salesman to avoid duplicates
shopkeeperSchema.index({ salesman: 1, phone: 1 }, { unique: true });
shopkeeperSchema.index({ dealer: 1, name: 1 });
shopkeeperSchema.index({ dealer: 1, phone: 1 });

module.exports = mongoose.model('Shopkeeper', shopkeeperSchema);


