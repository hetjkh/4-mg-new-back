const mongoose = require('mongoose');

const locationAllocationSchema = new mongoose.Schema({
  allocatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User ID who receives the allocation (dealer or salesman)'
  },
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User ID who made the allocation (admin or dealer)'
  },
  allocationType: {
    type: String,
    enum: ['admin-to-dealer', 'dealer-to-salesman'],
    required: true,
    comment: 'Type of allocation: admin allocates to dealer, dealer allocates to salesman'
  },
  districtCode: {
    type: String,
    required: true,
    comment: 'District code from gujarat-districts.json'
  },
  districtName: {
    type: String,
    required: true,
    comment: 'District name'
  },
  allocationScope: {
    type: String,
    enum: ['full-district', 'specific-talukas'],
    required: true,
    comment: 'Whether full district or specific talukas are allocated'
  },
  talukas: {
    type: [String],
    default: [],
    comment: 'Array of taluka names. Empty if allocationScope is full-district'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    comment: 'Allocation status'
  }
}, {
  timestamps: true,
});

// Index for efficient queries
locationAllocationSchema.index({ allocatedTo: 1, status: 1 });
locationAllocationSchema.index({ allocatedBy: 1 });
locationAllocationSchema.index({ districtCode: 1 });
// Compound index for finding existing allocations
locationAllocationSchema.index({ 
  allocatedTo: 1, 
  districtCode: 1, 
  allocationScope: 1,
  status: 1
});

module.exports = mongoose.model('LocationAllocation', locationAllocationSchema);

