const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  upiId: {
    type: String,
    required: [true, 'UPI ID is required'],
    trim: true,
    default: 'your-upi-id@paytm', // Default UPI ID - admin should update this
    comment: 'Static UPI ID for payment collection',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// Ensure only one settings document exists
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ upiId: process.env.DEFAULT_UPI_ID || 'your-upi-id@paytm' });
  }
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);

