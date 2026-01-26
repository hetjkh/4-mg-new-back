const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'Admin who sent the message',
  },
  title: {
    type: String,
    required: [true, 'Message title is required'],
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
  },
  image: {
    type: String,
    trim: true,
    default: null,
    comment: 'Optional image URL',
  },
  recipients: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    default: [],
    comment: 'Specific recipients (if empty, sent to all of selected roles)',
  },
  recipientRoles: {
    type: [{
      type: String,
      enum: ['dellear', 'stalkist', 'salesman'],
    }],
    required: [true, 'At least one recipient role is required'],
    comment: 'Roles that should receive this message',
  },
  sendToAll: {
    type: Boolean,
    default: false,
    comment: 'If true, send to all users of selected roles. If false, send only to specific recipients.',
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isActive: {
    type: Boolean,
    default: true,
    comment: 'If false, message is archived/deleted',
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

// Index for faster queries
messageSchema.index({ recipientRoles: 1, isActive: 1, createdAt: -1 });
messageSchema.index({ recipients: 1, isActive: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

