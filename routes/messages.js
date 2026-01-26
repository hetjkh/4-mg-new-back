const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Message = require('../models/Message');
const User = require('../models/User');
const { translateMessage, getLanguage } = require('../middleware/translateMessages');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Middleware to verify token and get user
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
};

// Middleware to verify admin
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin privileges required.' 
    });
  }
  next();
};

// POST /api/messages - Create a new message (admin only)
router.post('/', verifyToken, verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const language = getLanguage(req);
    const { title, content, recipientRoles, recipients, sendToAll } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: translateMessage('messages.titleAndContentRequired', language),
      });
    }

    if (!recipientRoles || !Array.isArray(recipientRoles) || recipientRoles.length === 0) {
      return res.status(400).json({
        success: false,
        message: translateMessage('messages.recipientRolesRequired', language),
      });
    }

    // Validate recipient roles
    const validRoles = ['dellear', 'stalkist', 'salesman'];
    const invalidRoles = recipientRoles.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: translateMessage('messages.invalidRecipientRoles', language),
      });
    }

    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'messages',
          resource_type: 'image',
        });
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: translateMessage('messages.imageUploadFailed', language),
        });
      }
    }

    // Parse recipients if provided
    let recipientIds = [];
    if (!sendToAll && recipients && Array.isArray(recipients) && recipients.length > 0) {
      recipientIds = recipients.map(id => id.trim()).filter(id => id);
    }

    // Create message
    const message = new Message({
      sender: req.user._id,
      title: title.trim(),
      content: content.trim(),
      image: imageUrl,
      recipientRoles: recipientRoles,
      recipients: recipientIds,
      sendToAll: sendToAll === true || sendToAll === 'true',
    });

    await message.save();

    // Populate sender info
    await message.populate('sender', 'name email role');

    res.status(201).json({
      success: true,
      message: translateMessage('messages.messageSent', language),
      data: message,
    });
  } catch (error) {
    console.error('Create message error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage('messages.createError', language),
      error: error.message,
    });
  }
});

// GET /api/messages - Get messages for current user
router.get('/', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    const user = req.user;

    // Build query based on user role
    const query = {
      isActive: true,
      $or: [
        { recipientRoles: user.role },
        { recipients: user._id },
      ],
    };

    // If user is admin, they can see all messages
    if (user.role === 'admin') {
      delete query.$or;
      query.isActive = true;
    }

    const messages = await Message.find(query)
      .populate('sender', 'name email role')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage('messages.fetchError', language),
      error: error.message,
    });
  }
});

// GET /api/messages/sent - Get messages sent by admin
router.get('/sent', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const language = getLanguage(req);
    const messages = await Message.find({ sender: req.user._id })
      .populate('sender', 'name email role')
      .populate('recipients', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Get sent messages error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage('messages.fetchError', language),
      error: error.message,
    });
  }
});

// PUT /api/messages/:id/read - Mark message as read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: translateMessage('messages.notFound', language),
      });
    }

    // Check if already read
    const alreadyRead = message.readBy.some(
      read => read.user.toString() === req.user._id.toString()
    );

    if (!alreadyRead) {
      message.readBy.push({
        user: req.user._id,
        readAt: new Date(),
      });
      await message.save();
    }

    res.json({
      success: true,
      message: translateMessage('messages.markedAsRead', language),
      data: message,
    });
  } catch (error) {
    console.error('Mark message as read error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage('messages.updateError', language),
      error: error.message,
    });
  }
});

// GET /api/messages/recipients - Get list of users for recipient selection (admin only)
router.get('/recipients', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { roles } = req.query;
    const roleArray = roles ? roles.split(',') : ['dellear', 'stalkist', 'salesman'];

    const users = await User.find({
      role: { $in: roleArray },
    })
      .select('name email role')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Get recipients error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage('messages.fetchError', language),
      error: error.message,
    });
  }
});

module.exports = router;

