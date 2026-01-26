const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DealerRequest = require('../models/DealerRequest');
const Product = require('../models/Product');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { getLanguage } = require('../middleware/translateMessages');

const router = express.Router();

// Configure multer for receipt uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
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

// Middleware to verify dealer
const verifyDealer = (req, res, next) => {
  if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Dealer privileges required.' 
    });
  }
  next();
};

// Middleware to verify stalkist
const verifyStalkist = (req, res, next) => {
  if (req.user.role !== 'stalkist') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Stalkist privileges required.' 
    });
  }
  next();
};

// Helper function to format product title for response
const formatProductTitle = (product, language = 'en') => {
  if (!product || !product.title) {
    return '';
  }
  // Handle both old format (string) and new format (object)
  if (typeof product.title === 'string') {
    return product.title;
  }
  // Handle translation object {en, gu}
  return product.title[language] || product.title.en || product.title.gu || '';
};

// Create Dealer Request (Dealer only)
router.post('/', verifyToken, verifyDealer, async (req, res) => {
  try {
    const language = getLanguage(req);
    const { productId, strips } = req.body;

    if (!productId || !strips) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide productId and strips' 
      });
    }

    if (typeof strips !== 'number' || strips < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strips must be a positive number' 
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Check if enough stock available
    if (product.stock < strips) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock. Available: ${product.stock} strips, Requested: ${strips} strips` 
      });
    }

    // Create request
    const request = new DealerRequest({
      dealer: req.user._id,
      product: productId,
      strips,
      status: 'pending',
    });

    await request.save();
    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');

    // Transform request to ensure all IDs are properly mapped and format product titles
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
    };

    res.status(201).json({
      success: true,
      message: 'Request created successfully',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Create dealer request error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during request creation',
      error: error.message 
    });
  }
});

// Get All Requests (Admin - all requests, Dealer - own requests, Stalkist - dealers they created)
router.get('/', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    let query = {};
    
    if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
    } else if (req.user.role === 'stalkist') {
      // Stalkists can see requests from dealers they created
      const dealersCreatedByStalkist = await User.find({ createdBy: req.user._id, role: { $in: ['dealer', 'dellear'] } }).select('_id');
      const dealerIds = dealersCreatedByStalkist.map(dealer => dealer._id);
      query.dealer = { $in: dealerIds };
    }

    const requests = await DealerRequest.find(query)
      .populate('product', 'title packetPrice packetsPerStrip image stock')
      .populate('dealer', 'name email')
      .populate('processedBy', 'name email')
      .populate('paymentVerifiedBy', 'name email')
      .sort({ createdAt: -1 });

    // Transform requests to ensure all IDs are properly mapped and format product titles
    const transformedRequests = requests.map(request => {
      const requestObj = request.toObject ? request.toObject() : request;
      return {
        ...requestObj,
        id: requestObj._id || requestObj.id,
        dealer: requestObj.dealer ? {
          ...requestObj.dealer,
          id: requestObj.dealer._id || requestObj.dealer.id,
        } : requestObj.dealer,
        product: requestObj.product ? {
          ...requestObj.product,
          id: requestObj.product._id || requestObj.product.id,
          title: formatProductTitle(requestObj.product, language),
        } : requestObj.product,
        processedBy: requestObj.processedBy ? {
          ...requestObj.processedBy,
          id: requestObj.processedBy._id || requestObj.processedBy.id,
        } : requestObj.processedBy,
        paymentVerifiedBy: requestObj.paymentVerifiedBy ? {
          ...requestObj.paymentVerifiedBy,
          id: requestObj.paymentVerifiedBy._id || requestObj.paymentVerifiedBy.id,
        } : requestObj.paymentVerifiedBy,
      };
    });

    res.json({
      success: true,
      data: { requests: transformedRequests },
    });
  } catch (error) {
    console.error('Get dealer requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching requests',
      error: error.message 
    });
  }
});

// Get UPI ID (Dealer/Admin - dealers see it, admin can manage it)
// IMPORTANT: This route must come BEFORE /:id route to avoid route conflicts
router.get('/upi-id', verifyToken, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    res.json({
      success: true,
      data: { upiId: settings.upiId },
    });
  } catch (error) {
    console.error('Get UPI ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching UPI ID',
      error: error.message 
    });
  }
});

// Update UPI ID (Admin only)
// IMPORTANT: This route must come BEFORE /:id route to avoid route conflicts
router.put('/upi-id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { upiId } = req.body;

    if (!upiId || typeof upiId !== 'string' || upiId.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a valid UPI ID' 
      });
    }

    const settings = await AdminSettings.getSettings();
    settings.upiId = upiId.trim();
    settings.updatedBy = req.user._id;
    await settings.save();

    res.json({
      success: true,
      message: 'UPI ID updated successfully',
      data: { upiId: settings.upiId },
    });
  } catch (error) {
    console.error('Update UPI ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating UPI ID',
      error: error.message 
    });
  }
});

// Get Single Request
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id)
      .populate('product', 'title packetPrice packetsPerStrip image stock')
      .populate('dealer', 'name email')
      .populate('processedBy', 'name email')
      .populate('paymentVerifiedBy', 'name email');

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    // Dealers can only see their own requests
    if ((req.user.role === 'dealer' || req.user.role === 'dellear') && 
        request.dealer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    // Transform request to ensure all IDs are properly mapped and format product titles
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
      processedBy: requestObj.processedBy ? {
        ...requestObj.processedBy,
        id: requestObj.processedBy._id || requestObj.processedBy.id,
      } : requestObj.processedBy,
      paymentVerifiedBy: requestObj.paymentVerifiedBy ? {
        ...requestObj.paymentVerifiedBy,
        id: requestObj.paymentVerifiedBy._id || requestObj.paymentVerifiedBy.id,
      } : requestObj.paymentVerifiedBy,
    };

    res.json({
      success: true,
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Get dealer request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching request',
      error: error.message 
    });
  }
});

// Upload Payment Receipt (Dealer only)
router.put('/:id/upload-receipt', verifyToken, verifyDealer, upload.single('receipt'), async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    // Verify dealer owns this request
    if (request.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only upload receipts for your own requests.' 
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot upload receipt for ${request.status} request` 
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No receipt image provided',
      });
    }

    // Upload receipt to Cloudinary
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'receipts', // Organize receipts in a separate folder
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1600, crop: 'limit' }, // Resize for receipts
        { quality: 'auto' },
      ],
    });

    // Update request with receipt
    request.receiptImage = result.secure_url;
    request.paymentStatus = 'paid'; // Changed from 'pending' to 'paid'
    await request.save();

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');

    const language = getLanguage(req);
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
    };

    res.json({
      success: true,
      message: 'Receipt uploaded successfully. Waiting for admin verification.',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during receipt upload',
      error: error.message 
    });
  }
});

// Verify Payment (Admin only - approve the payment)
router.put('/:id/verify-payment', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id)
      .populate('product');

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    if (request.paymentStatus !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        message: `Payment status is ${request.paymentStatus}. Only 'paid' receipts can be verified.` 
      });
    }

    // Verify payment
    request.paymentStatus = 'verified';
    request.paymentVerifiedBy = req.user._id;
    request.paymentVerifiedAt = new Date();
    request.paymentNotes = req.body.notes || '';
    await request.save();

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');
    await request.populate('paymentVerifiedBy', 'name email');

    const language = getLanguage(req);
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
      paymentVerifiedBy: requestObj.paymentVerifiedBy ? {
        ...requestObj.paymentVerifiedBy,
        id: requestObj.paymentVerifiedBy._id || requestObj.paymentVerifiedBy.id,
      } : requestObj.paymentVerifiedBy,
    };

    res.json({
      success: true,
      message: 'Payment verified successfully. You can now approve the request.',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during payment verification',
      error: error.message 
    });
  }
});

// Reject Payment (Admin only - reject the receipt)
router.put('/:id/reject-payment', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    if (request.paymentStatus !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        message: `Payment status is ${request.paymentStatus}. Only 'paid' receipts can be rejected.` 
      });
    }

    // Reject payment - dealer can upload new receipt
    request.paymentStatus = 'rejected';
    request.paymentVerifiedBy = req.user._id;
    request.paymentVerifiedAt = new Date();
    request.paymentNotes = req.body.notes || 'Receipt rejected. Please upload a valid receipt.';
    // Clear receipt image so dealer can upload a new one
    request.receiptImage = null;
    await request.save();

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');
    await request.populate('paymentVerifiedBy', 'name email');

    const language = getLanguage(req);
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
      paymentVerifiedBy: requestObj.paymentVerifiedBy ? {
        ...requestObj.paymentVerifiedBy,
        id: requestObj.paymentVerifiedBy._id || requestObj.paymentVerifiedBy.id,
      } : requestObj.paymentVerifiedBy,
    };

    res.json({
      success: true,
      message: 'Payment rejected. Dealer can upload a new receipt.',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Reject payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during payment rejection',
      error: error.message 
    });
  }
});

// Approve Request (Admin only - only after payment is verified)
router.put('/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id)
      .populate('product');

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.status}` 
      });
    }

    // Check if payment is verified
    if (request.paymentStatus !== 'verified') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot approve request. Payment status is ${request.paymentStatus}. Payment must be verified first.` 
      });
    }

    // Check stock availability
    if (request.product.stock < request.strips) {
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient stock to approve this request' 
      });
    }

    // Update stock
    request.product.stock -= request.strips;
    await request.product.save();

    // Update request
    request.status = 'approved';
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    request.notes = req.body.notes || '';
    await request.save();

    // Create or update dealer stock
    let dealerStock = await DealerStock.findOne({
      dealer: request.dealer._id,
      product: request.product._id,
      sourceRequest: request._id,
    });

    if (dealerStock) {
      // If stock entry exists for this request, update it
      dealerStock.totalStrips += request.strips;
      dealerStock.availableStrips = dealerStock.totalStrips - dealerStock.allocatedStrips;
      await dealerStock.save();
    } else {
      // Create new dealer stock entry
      dealerStock = new DealerStock({
        dealer: request.dealer._id,
        product: request.product._id,
        totalStrips: request.strips,
        allocatedStrips: 0,
        availableStrips: request.strips,
        sourceRequest: request._id,
      });
      await dealerStock.save();
    }

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');
    await request.populate('processedBy', 'name email');
    await request.populate('paymentVerifiedBy', 'name email');

    const language = getLanguage(req);
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
      processedBy: requestObj.processedBy ? {
        ...requestObj.processedBy,
        id: requestObj.processedBy._id || requestObj.processedBy.id,
      } : requestObj.processedBy,
      paymentVerifiedBy: requestObj.paymentVerifiedBy ? {
        ...requestObj.paymentVerifiedBy,
        id: requestObj.paymentVerifiedBy._id || requestObj.paymentVerifiedBy.id,
      } : requestObj.paymentVerifiedBy,
    };

    res.json({
      success: true,
      message: 'Request approved successfully',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during request approval',
      error: error.message 
    });
  }
});

// Cancel Request (Admin only)
router.put('/:id/cancel', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.status}` 
      });
    }

    // Update request
    request.status = 'cancelled';
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    request.notes = req.body.notes || '';
    await request.save();

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');
    await request.populate('processedBy', 'name email');

    const language = getLanguage(req);
    const requestObj = request.toObject ? request.toObject() : request;
    const transformedRequest = {
      ...requestObj,
      id: requestObj._id || requestObj.id,
      dealer: requestObj.dealer ? {
        ...requestObj.dealer,
        id: requestObj.dealer._id || requestObj.dealer.id,
      } : requestObj.dealer,
      product: requestObj.product ? {
        ...requestObj.product,
        id: requestObj.product._id || requestObj.product.id,
        title: formatProductTitle(requestObj.product, language),
      } : requestObj.product,
      processedBy: requestObj.processedBy ? {
        ...requestObj.processedBy,
        id: requestObj.processedBy._id || requestObj.processedBy.id,
      } : requestObj.processedBy,
    };

    res.json({
      success: true,
      message: 'Request cancelled successfully',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during request cancellation',
      error: error.message 
    });
  }
});

// Get Dealer Statistics (Stalkist only - for dealers they created)
router.get('/dealer/:dealerId/stats', verifyToken, verifyStalkist, async (req, res) => {
  try {
    const language = getLanguage(req);
    const { dealerId } = req.params;

    // Verify that this dealer was created by the stalkist
    const dealer = await User.findOne({
      _id: dealerId,
      createdBy: req.user._id,
      role: { $in: ['dealer', 'dellear'] }
    });

    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found or access denied' 
      });
    }

    // Get all requests for this dealer
    const requests = await DealerRequest.find({ dealer: dealerId })
      .populate('product', 'title packetPrice packetsPerStrip');

    // Calculate statistics
    const totalRequests = requests.length;
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const approvedRequests = requests.filter(r => r.status === 'approved').length;
    const cancelledRequests = requests.filter(r => r.status === 'cancelled').length;

    // Calculate total strips requested
    const totalStripsRequested = requests.reduce((sum, r) => sum + r.strips, 0);
    const totalStripsApproved = requests
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + r.strips, 0);
    const totalStripsPending = requests
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.strips, 0);

    // Calculate total value
    const totalValueRequested = requests.reduce((sum, r) => {
      return sum + (r.strips * r.product.packetsPerStrip * r.product.packetPrice);
    }, 0);
    const totalValueApproved = requests
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => {
        return sum + (r.strips * r.product.packetsPerStrip * r.product.packetPrice);
      }, 0);

    res.json({
      success: true,
      data: {
        dealer: {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
        },
        stats: {
          totalRequests,
          pendingRequests,
          approvedRequests,
          cancelledRequests,
          totalStripsRequested,
          totalStripsApproved,
          totalStripsPending,
          totalValueRequested: totalValueRequested.toFixed(2),
          totalValueApproved: totalValueApproved.toFixed(2),
        },
        requests: requests.map(r => {
          const productObj = r.product.toObject ? r.product.toObject() : r.product;
          return {
            id: r._id,
            product: {
              id: productObj._id || productObj.id,
              title: formatProductTitle(productObj, language),
              packetPrice: productObj.packetPrice,
              packetsPerStrip: productObj.packetsPerStrip,
            },
            strips: r.strips,
            status: r.status,
            requestedAt: r.requestedAt,
            processedAt: r.processedAt,
            totalValue: (r.strips * productObj.packetsPerStrip * productObj.packetPrice).toFixed(2),
          };
        }),
      },
    });
  } catch (error) {
    console.error('Get dealer stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer statistics',
      error: error.message 
    });
  }
});

module.exports = router;

