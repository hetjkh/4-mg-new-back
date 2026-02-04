const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DealerDocument = require('../models/DealerDocument');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for documents
  },
});

// Middleware to verify token
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

// Helper function to determine file type
const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('document') || mimetype.includes('word') || mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
    return 'document';
  }
  return 'other';
};

// Upload document (Dealer only)
router.post('/', verifyToken, upload.single('document'), async (req, res) => {
  try {
    // Check if user is a dealer
    if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
      return res.status(403).json({
        success: false,
        message: 'Only dealers can upload documents',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No document file provided',
      });
    }

    const { title, description } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Document title is required',
      });
    }

    // Convert buffer to base64 string for Cloudinary
    const base64File = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64File, {
      folder: 'dealer-documents',
      resource_type: 'auto', // Auto-detect file type
    });

    // Create document record
    const document = new DealerDocument({
      dealer: req.user._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      fileUrl: result.secure_url,
      fileType: getFileType(req.file.mimetype),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      uploadedBy: req.user._id,
    });

    await document.save();
    await document.populate('dealer', 'name email');

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: document,
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload document',
      error: error.message,
    });
  }
});

// Get dealer's own documents (Dealer only)
router.get('/my-documents', verifyToken, async (req, res) => {
  try {
    // Check if user is a dealer
    if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
      return res.status(403).json({
        success: false,
        message: 'Only dealers can access their documents',
      });
    }

    const documents = await DealerDocument.find({
      dealer: req.user._id,
      isActive: true,
    })
      .populate('dealer', 'name email')
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents',
      error: error.message,
    });
  }
});

// Get all dealer documents grouped by dealer (Admin only)
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can access all dealer documents',
      });
    }

    const documents = await DealerDocument.find({ isActive: true })
      .populate('dealer', 'name email')
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 });

    // Group by dealer
    const groupedByDealer = {};
    documents.forEach(doc => {
      const dealerId = doc.dealer._id.toString();
      if (!groupedByDealer[dealerId]) {
        groupedByDealer[dealerId] = {
          dealer: {
            id: doc.dealer._id,
            name: doc.dealer.name,
            email: doc.dealer.email,
          },
          documents: [],
        };
      }
      groupedByDealer[dealerId].documents.push(doc);
    });

    res.json({
      success: true,
      data: Object.values(groupedByDealer),
    });
  } catch (error) {
    console.error('Get all documents error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents',
      error: error.message,
    });
  }
});

// Get documents for a specific dealer (Admin only)
router.get('/admin/dealer/:dealerId', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can access dealer documents',
      });
    }

    const { dealerId } = req.params;

    const documents = await DealerDocument.find({
      dealer: dealerId,
      isActive: true,
    })
      .populate('dealer', 'name email')
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 });

    // Mark as viewed by admin
    const updatePromises = documents.map(doc => {
      const viewedByAdmin = doc.viewedBy.find(
        v => v.admin.toString() === req.user._id.toString()
      );
      
      if (!viewedByAdmin) {
        doc.viewedBy.push({
          admin: req.user._id,
          viewedAt: new Date(),
        });
        return doc.save();
      }
      return Promise.resolve();
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error('Get dealer documents error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents',
      error: error.message,
    });
  }
});

// Delete document (Dealer only - can delete own documents)
router.delete('/:documentId', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await DealerDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Check if user is the dealer who uploaded it
    if (document.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own documents',
      });
    }

    // Soft delete
    document.isActive = false;
    await document.save();

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document',
      error: error.message,
    });
  }
});

module.exports = router;

