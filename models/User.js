const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: ['admin', 'stalkist', 'dellear', 'salesman'],
    default: 'salesman',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'ID of the user who created this user (dealer creates salesman)',
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Indexes for faster queries
// Role queries (for filtering users by role)
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, createdBy: 1 });

// CreatedBy queries (for finding salesmen by dealer, dealers by stalkist)
userSchema.index({ createdBy: 1, role: 1 });
userSchema.index({ createdBy: 1 });

// Email is already unique, so it has an index automatically

module.exports = mongoose.model('User', userSchema);

