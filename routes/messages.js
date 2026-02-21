const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Message = require('../models/Message');
const User = require('../models/User');
const { translateMessage, getLanguage } = require('../middleware/translateMessages');
const cloudinary = require('../config/cloudinary');

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
    let { title, content, recipientRoles, recipients, sendToAll } = req.body;

    // Debug logging
    console.log('Received body:', { title, content, recipientRoles, recipients, sendToAll });
    console.log('recipientRoles type:', typeof recipientRoles);
    console.log('recipientRoles value:', recipientRoles);

    // Parse JSON strings if they come from FormData
    if (typeof recipientRoles === 'string') {
      try {
        recipientRoles = JSON.parse(recipientRoles);
        console.log('Parsed recipientRoles:', recipientRoles);
      } catch (e) {
        console.log('JSON parse failed, trying comma split');
        // If parsing fails, try splitting by comma
        recipientRoles = recipientRoles.split(',').map(r => r.trim()).filter(r => r);
        console.log('Comma split recipientRoles:', recipientRoles);
      }
    }

    if (typeof recipients === 'string' && recipients) {
      try {
        recipients = JSON.parse(recipients);
      } catch (e) {
        recipients = recipients.split(',').map(r => r.trim()).filter(r => r);
      }
    }

    // Convert sendToAll to boolean if it's a string
    if (typeof sendToAll === 'string') {
      sendToAll = sendToAll === 'true' || sendToAll === '1';
    }

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: translateMessage(language, 'messages.titleAndContentRequired', 'Title and content are required'),
      });
    }

    // Final validation after parsing
    if (!recipientRoles) {
      console.error('recipientRoles is missing or null');
      return res.status(400).json({
        success: false,
        message: translateMessage(language, 'messages.recipientRolesRequired', 'At least one recipient role is required'),
      });
    }

    if (!Array.isArray(recipientRoles)) {
      console.error('recipientRoles is not an array:', recipientRoles, typeof recipientRoles);
      return res.status(400).json({
        success: false,
        message: translateMessage(language, 'messages.recipientRolesRequired', 'At least one recipient role is required'),
      });
    }

    if (recipientRoles.length === 0) {
      console.error('recipientRoles array is empty');
      return res.status(400).json({
        success: false,
        message: translateMessage(language, 'messages.recipientRolesRequired', 'At least one recipient role is required'),
      });
    }

    // Validate recipient roles
    const validRoles = ['dellear', 'stalkist', 'salesman'];
    const invalidRoles = recipientRoles.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: translateMessage(language, 'messages.invalidRecipientRoles', 'Invalid recipient roles'),
      });
    }

    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      try {
        // Upload to Cloudinary using upload_stream for better memory handling
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'messages',
              resource_type: 'image',
              transformation: [
                { width: 1200, height: 1200, crop: 'limit' },
                { quality: 'auto' },
              ],
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          // Write buffer to upload stream
          uploadStream.end(req.file.buffer);
        });
        
        imageUrl = uploadResult.secure_url;
        console.log('Image uploaded successfully:', imageUrl);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: translateMessage(language, 'messages.imageUploadFailed', 'Failed to upload image'),
        });
      }
    }

    // Parse recipients if provided
    let recipientIds = [];
    if (!sendToAll && recipients) {
      if (Array.isArray(recipients)) {
        recipientIds = recipients.map(id => String(id).trim()).filter(id => id);
      } else if (typeof recipients === 'string') {
        try {
          const parsed = JSON.parse(recipients);
          recipientIds = Array.isArray(parsed) ? parsed.map(id => String(id).trim()).filter(id => id) : [];
        } catch (e) {
          recipientIds = recipients.split(',').map(id => id.trim()).filter(id => id);
        }
      }
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
      message: translateMessage(language, 'messages.messageSent', 'Message sent successfully'),
      data: message,
    });
  } catch (error) {
    console.error('Create message error:', error);
    const errorLanguage = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage(errorLanguage, 'messages.createError', 'Failed to create message'),
      error: error.message,
    });
  }
});

// GET /api/messages - Get messages for current user
router.get('/', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    const { page = 1, limit = 50 } = req.query;
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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find(query)
      .populate('sender', 'name email role')
      .lean()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments(query);

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage(language, 'messages.fetchError', 'Failed to fetch messages'),
      error: error.message,
    });
  }
});

// GET /api/messages/sent - Get messages sent by admin
router.get('/sent', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const language = getLanguage(req);
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const messages = await Message.find({ sender: req.user._id })
      .populate('sender', 'name email role')
      .populate('recipients', 'name email role')
      .lean()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ sender: req.user._id });

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get sent messages error:', error);
    const language = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage(language, 'messages.fetchError', 'Failed to fetch sent messages'),
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
        message: translateMessage(language, 'messages.notFound', 'Message not found'),
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
      message: translateMessage(language, 'messages.markedAsRead', 'Message marked as read'),
      data: message,
    });
  } catch (error) {
    console.error('Mark message as read error:', error);
    const errorLanguage = getLanguage(req);
    res.status(500).json({
      success: false,
      message: translateMessage(errorLanguage, 'messages.updateError', 'Failed to update message'),
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
      message: translateMessage(language, 'messages.fetchError', 'Failed to fetch recipients'),
      error: error.message,
    });
  }
});

module.exports = router;

