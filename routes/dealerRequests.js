const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DealerRequest = require('../models/DealerRequest');
const Product = require('../models/Product');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const Payment = require('../models/Payment');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { getLanguage } = require('../middleware/translateMessages');
const PDFDocument = require('pdfkit');

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
    const { productId, strips, orderGroupId } = req.body;

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
      orderGroupId: orderGroupId || null,
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
      .populate('billSentBy', 'name email')
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
        billSentBy: requestObj.billSentBy ? {
          ...requestObj.billSentBy,
          id: requestObj.billSentBy._id || requestObj.billSentBy.id,
        } : requestObj.billSentBy,
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
      .populate('paymentVerifiedBy', 'name email')
      .populate('billSentBy', 'name email');

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
      billSentBy: requestObj.billSentBy ? {
        ...requestObj.billSentBy,
        id: requestObj.billSentBy._id || requestObj.billSentBy.id,
      } : requestObj.billSentBy,
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

// Approve Request (Admin only - can approve with or without payment)
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

    // Check stock availability
    if (request.product.stock < request.strips) {
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient stock to approve this request' 
      });
    }

    // Calculate total amount
    const totalAmount = request.strips * request.product.packetsPerStrip * request.product.packetPrice;
    
    // Get payment details from request body
    const paidAmount = req.body.paidAmount ? parseFloat(req.body.paidAmount) : 0;
    const paymentType = req.body.paymentType || (paidAmount === 0 ? 'none' : (paidAmount >= totalAmount ? 'full' : 'partial'));
    
    // Validate paid amount
    if (paidAmount < 0 || paidAmount > totalAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Paid amount must be between 0 and ${totalAmount}` 
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
    request.totalAmount = totalAmount;
    request.paidAmount = paidAmount;
    request.paymentType = paymentType;
    request.isOutstanding = paidAmount < totalAmount;
    
    // If payment is not verified but admin is approving, mark payment status accordingly
    if (request.paymentStatus !== 'verified') {
      if (paidAmount > 0) {
        request.paymentStatus = 'paid'; // Mark as paid if amount is provided
      } else {
        request.paymentStatus = 'pending'; // Keep as pending if no payment
      }
    }
    
    await request.save();

    // Create Payment record if there's outstanding amount (approved without full payment)
    if (request.isOutstanding && paidAmount < totalAmount) {
      const outstandingAmount = totalAmount - paidAmount;
      
      // Create payment record for outstanding amount
      const outstandingPayment = new Payment({
        dealer: request.dealer._id,
        dealerRequest: request._id,
        type: 'payment',
        amount: outstandingAmount,
        paymentMethod: 'credit', // Mark as credit since it's outstanding
        status: 'pending', // Outstanding payments are pending
        notes: `Outstanding amount for approved request. Paid: ₹${paidAmount}, Total: ₹${totalAmount}`,
        processedBy: req.user._id,
        processedAt: new Date(),
        transactionDate: new Date(),
      });
      await outstandingPayment.save();
    }

    // Create Payment record for paid amount if any
    if (paidAmount > 0) {
      const paidPayment = new Payment({
        dealer: request.dealer._id,
        dealerRequest: request._id,
        type: 'payment',
        amount: paidAmount,
        paymentMethod: req.body.paymentMethod || 'cash',
        status: 'completed', // Paid amount is considered completed
        notes: req.body.paymentNotes || `Partial payment for approved request. Total: ₹${totalAmount}`,
        processedBy: req.user._id,
        processedAt: new Date(),
        transactionDate: new Date(),
      });
      await paidPayment.save();
    }

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
    await request.populate('billSentBy', 'name email');

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
      billSentBy: requestObj.billSentBy ? {
        ...requestObj.billSentBy,
        id: requestObj.billSentBy._id || requestObj.billSentBy.id,
      } : requestObj.billSentBy,
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

// Send Bill to Dealer (Admin only)
router.put('/:id/send-bill', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id)
      .populate('product', 'title packetPrice packetsPerStrip image')
      .populate('dealer', 'name email');

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot send bill. Request status is ${request.status}. Only approved requests can have bills sent.` 
      });
    }

    // Get bill details from request body
    const { destination, vehicleNumber, dispatchedDocNo, invoiceSnapshot } = req.body;

    // Validate required fields
    if (!destination || !destination.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Destination is required' 
      });
    }

    if (!vehicleNumber || !vehicleNumber.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vehicle number is required' 
      });
    }

    // Save bill details and mark bill as sent
    request.destination = destination.trim();
    request.vehicleNumber = vehicleNumber.trim();
    request.dispatchedDocNo = dispatchedDocNo ? dispatchedDocNo.trim() : null;
    request.billSent = true;
    request.billSentAt = new Date();
    request.billSentBy = req.user._id;
    
    // Store invoice snapshot if provided (for historical accuracy)
    if (invoiceSnapshot) {
      request.invoiceSnapshot = invoiceSnapshot;
    }
    
    await request.save();

    await request.populate('product', 'title packetPrice packetsPerStrip image');
    await request.populate('dealer', 'name email');
    await request.populate('processedBy', 'name email');
    await request.populate('paymentVerifiedBy', 'name email');
    await request.populate('billSentBy', 'name email');

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
      billSentBy: requestObj.billSentBy ? {
        ...requestObj.billSentBy,
        id: requestObj.billSentBy._id || requestObj.billSentBy.id,
      } : requestObj.billSentBy,
    };

    res.json({
      success: true,
      message: 'Bill sent to dealer successfully',
      data: { request: transformedRequest },
    });
  } catch (error) {
    console.error('Send bill error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error while sending bill',
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

// Helper function to convert number to words (Indian numbering system)
function convertNumberToWords(amount) {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  
  function convertHundreds(num) {
    let result = '';
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' HUNDRED ';
      num %= 100;
    }
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0) {
      result += ones[num] + ' ';
    }
    return result.trim();
  }
  
  if (amount === 0) return 'ZERO';
  
  let words = '';
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const hundred = Math.floor((amount % 1000) / 100);
  const remainder = amount % 100;
  
  if (crore > 0) {
    words += convertHundreds(crore) + ' CRORE ';
  }
  if (lakh > 0) {
    words += convertHundreds(lakh) + ' LAKH ';
  }
  if (thousand > 0) {
    words += convertHundreds(thousand) + ' THOUSAND ';
  }
  if (hundred > 0) {
    words += convertHundreds(hundred) + ' HUNDRED ';
  }
  if (remainder > 0) {
    words += convertHundreds(remainder);
  }
  
  return words.trim() + ' RUPEES ONLY';
}

// Generate PDF Bill for Approved Dealer Request (Admin only)
router.get('/:id/bill', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request ID format' 
      });
    }

    const request = await DealerRequest.findById(req.params.id)
      .populate('product', 'title packetPrice packetsPerStrip image')
      .populate('dealer', 'name email')
      .populate('processedBy', 'name email');

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }

    // Only generate bill for approved requests
    if (request.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot generate bill for ${request.status} request. Only approved requests can have bills.` 
      });
    }

    const language = getLanguage(req);
    const productTitle = formatProductTitle(request.product, language);
    
    // Calculate totals
    const totalPackets = request.strips * (request.product.packetsPerStrip || 1);
    const totalAmount = totalPackets * (request.product.packetPrice || 0);
    const unitPrice = request.product.packetPrice || 0;

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Bill-${request.id}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Set initial y-position after margins
    let y = 50;
    const startX = 50;
    const pageWidth = 500;
    const rightSectionX = 320; // Right side starts here for invoice details
    
    // ========== HEADER SECTION ==========
    // Tax Invoice Title - TOP CENTER (Large and Bold, at the very top)
    doc.fontSize(24).font('Helvetica-Bold').text('TAX INVOICE', startX, y, { width: pageWidth, align: 'center' });
    y += 40; // Increased spacing
    
    // Company Name - BELOW TAX INVOICE, LEFT SIDE (Reduced size)
    doc.fontSize(14).font('Helvetica-Bold').text('SAFALATA FOOD PRIVATE LIMITED', startX, y);
    let companyInfoY = y + 20; // Increased spacing
    
    // Company Address Box - LEFT SIDE (with border)
    const companyBoxY = y;
    const companyBoxHeight = 70;
    doc.rect(startX, companyBoxY, 240, companyBoxHeight).stroke();
    
    // Company Address - LEFT SIDE
    doc.fontSize(10).font('Helvetica');
    doc.text('1, Momai Nagar, B/h Amar Nagar', startX + 5, companyInfoY);
    companyInfoY += 15; // Increased spacing
    doc.text('Odhav-Ahmedabad-382415.', startX + 5, companyInfoY);
    companyInfoY += 15; // Increased spacing
    doc.text('Mobile No.: 9998109435', startX + 5, companyInfoY);
    companyInfoY += 15; // Increased spacing
    doc.text('GST No.: 24ABRCS1053J1Z5', startX + 5, companyInfoY);
    
    // ========== INVOICE DETAILS SECTION (TOP RIGHT) ==========
    // Calculate invoice number (format: sequential/year-year)
    const invoiceDate = new Date(request.processedAt || request.requestedAt);
    const financialYear = invoiceDate.getMonth() >= 3 
      ? `${invoiceDate.getFullYear()}-${String(invoiceDate.getFullYear() + 1).slice(-2)}`
      : `${invoiceDate.getFullYear() - 1}-${String(invoiceDate.getFullYear()).slice(-2)}`;
    
    // Use request ID short version or sequential number (format: XX/YYYY-YY)
    const invoiceNumber = `${String(request._id.toString().slice(-2))}/${financialYear}`;
    // Format date as DD-MM-YYYY
    const day = String(invoiceDate.getDate()).padStart(2, '0');
    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
    const year = invoiceDate.getFullYear();
    const invoiceDateFormatted = `${day}-${month}-${year}`;
    
    // Invoice Details Box - RIGHT SIDE (with border)
    const invoiceDetailsY = 120; // Increased spacing from top
    const invoiceBoxWidth = 250;
    const invoiceBoxHeight = 75;
    doc.rect(rightSectionX, invoiceDetailsY - 5, invoiceBoxWidth, invoiceBoxHeight).stroke();
    
    const leftColLabelX = rightSectionX + 5;
    const leftColValueX = rightSectionX + 85;
    const rightColLabelX = rightSectionX + 130;
    const rightColValueX = rightSectionX + 210;
    const lineHeight = 18; // Increased line height
    
    // Left Column Labels - Invoice Details
    doc.fontSize(9).font('Helvetica');
    doc.text('Invoice No.:', leftColLabelX, invoiceDetailsY);
    doc.text('Dated:', leftColLabelX, invoiceDetailsY + lineHeight);
    doc.text('Buyer\'s Order No.:', leftColLabelX, invoiceDetailsY + (lineHeight * 2));
    doc.text('Dated:', leftColLabelX, invoiceDetailsY + (lineHeight * 3));
    
    // Left Column Values
    doc.font('Helvetica-Bold');
    doc.text(invoiceNumber, leftColValueX, invoiceDetailsY);
    doc.text(invoiceDateFormatted, leftColValueX, invoiceDetailsY + lineHeight);
    const buyerOrderNo = String(request._id.toString().slice(-2)).padStart(2, '0');
    doc.text(buyerOrderNo, leftColValueX, invoiceDetailsY + (lineHeight * 2));
    doc.text(invoiceDateFormatted, leftColValueX, invoiceDetailsY + (lineHeight * 3));
    
    // Right Column Labels - Dispatch Information
    doc.font('Helvetica');
    doc.text('Dispatched through:', rightColLabelX, invoiceDetailsY);
    doc.text('Dispatched Document No.:', rightColLabelX, invoiceDetailsY + lineHeight);
    
    // Right Column Values - Use saved values or defaults
    doc.font('Helvetica-Bold');
    const vehicleInfo = request.vehicleNumber ? `Vehicle No.: ${request.vehicleNumber}` : 'company vehicle';
    doc.text(vehicleInfo, rightColValueX, invoiceDetailsY);
    const dispatchDocNo = request.dispatchedDocNo || `GJ-${String(invoiceDate.getDate()).padStart(2, '0')}-TT-${String(request._id.toString().slice(-4))}`;
    doc.text(dispatchDocNo, rightColValueX, invoiceDetailsY + lineHeight);
    
    // ========== BUYER INFORMATION SECTION (MID-LEFT) - Box Structure ==========
    y = 200; // Increased spacing from invoice details
    const buyerBoxY = y;
    const buyerBoxHeight = 50;
    doc.rect(startX, buyerBoxY, 240, buyerBoxHeight).stroke();
    
    doc.fontSize(10).font('Helvetica-Bold').text('Buyer (Bill to):', startX + 5, y + 5);
    y += 18; // Increased spacing
    doc.font('Helvetica');
    doc.text(request.dealer.name, startX + 5, y);
    y += 15; // Increased spacing
    const buyerAddress = request.dealer.email || 'Address not provided';
    doc.text(buyerAddress, startX + 5, y, { width: 220 });
    
    // ========== DESTINATION SECTION (MID-RIGHT) - Box Structure ==========
    const destinationY = 200; // Increased spacing
    const destinationBoxHeight = 50;
    doc.rect(rightSectionX, destinationY, 250, destinationBoxHeight).stroke();
    
    doc.fontSize(10).font('Helvetica-Bold').text('Destination:', rightSectionX + 5, destinationY + 5);
    doc.font('Helvetica');
    const finalDestination = request.destination || buyerAddress;
    doc.text(finalDestination, rightSectionX + 5, destinationY + 23, { width: 220 });
    
    // ========== PAYMENT TERMS SECTION - Box Structure ==========
    y = 255; // Increased spacing
    const paymentTermsBoxHeight = 25;
    doc.rect(startX, y, 240, paymentTermsBoxHeight).stroke();
    
    doc.fontSize(10).font('Helvetica-Bold').text('Payment Terms:', startX + 5, y + 5);
    y += 18; // Increased spacing
    
    // Separator line before product table
    y += 10; // Increased spacing before line
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    y += 20; // Increased spacing after line
    
    // ========== PRODUCT TABLE - Box Structure ==========
    // Table Header with background
    const tableHeaderHeight = 20;
    const tableBoxY = y;
    doc.rect(startX, tableBoxY, pageWidth, tableHeaderHeight).fill('#f0f0f0').stroke();
    doc.fillColor('#000000');
    
    // Column positions
    const colSI = startX + 5;
    const colDesc = startX + 35;
    const colHSN = startX + 180;
    const colQty = startX + 250;
    const colUnit = startX + 300;
    const colRate = startX + 360;
    const colAmount = startX + 420;
    
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('SI No.', colSI, y + 6);
    doc.text('Description', colDesc, y + 6);
    doc.text('HSN/SAC', colHSN, y + 6);
    doc.text('Qty', colQty, y + 6, { width: 40, align: 'right' });
    doc.text('Unit', colUnit, y + 6, { width: 50, align: 'right' });
    doc.text('Rate', colRate, y + 6, { width: 50, align: 'right' });
    doc.text('Amount', colAmount, y + 6, { width: 70, align: 'right' });
    
    y += tableHeaderHeight + 8; // Increased spacing
    
    // Product Row
    doc.fontSize(9).font('Helvetica');
    doc.text('1', colSI, y);
    doc.text(productTitle, colDesc, y, { width: 140 });
    doc.text('2106', colHSN, y); // HSN code for food products
    doc.text(totalPackets.toString(), colQty, y, { width: 40, align: 'right' });
    doc.text('Pkt', colUnit, y, { width: 50, align: 'right' });
    doc.text(`₹${unitPrice.toFixed(2)}`, colRate, y, { width: 50, align: 'right' });
    doc.text(`₹${totalAmount.toFixed(2)}`, colAmount, y, { width: 70, align: 'right' });
    
    // Close the table box
    const tableTotalHeight = y + 25 - tableBoxY;
    doc.rect(startX, tableBoxY, pageWidth, tableTotalHeight).stroke();
    
    y += 25; // Increased spacing after product row
    
    // ========== SUMMARY SECTION (BOTTOM RIGHT) - Box Structure ==========*
    const summaryStartY = y;
    const summaryBoxWidth = 200;
    const summaryBoxHeight = 120;
    doc.rect(startX + pageWidth - summaryBoxWidth, summaryStartY, summaryBoxWidth, summaryBoxHeight).stroke();
    
    const summaryLabelX = startX + 350;
    const summaryValueX = startX + 450;
    const summaryWidth = 100;
    
    // Subtotal
    doc.fontSize(9).font('Helvetica');
    doc.text('Subtotal:', summaryLabelX, y, { width: summaryWidth, align: 'right' });
    doc.text(`₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryValueX, y, { width: 50, align: 'right' });
    y += 18; // Increased spacing
    
    // GST Calculation (2.5% CGST + 2.5% SGST = 5% total)
    const cgstRate = 2.5;
    const sgstRate = 2.5;
    const cgstAmount = (totalAmount * cgstRate) / 100;
    const sgstAmount = (totalAmount * sgstRate) / 100;
    
    doc.text(`Output CGST @ ${cgstRate}%:`, summaryLabelX, y, { width: summaryWidth, align: 'right' });
    doc.text(`₹${cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryValueX, y, { width: 50, align: 'right' });
    y += 18; // Increased spacing
    
    doc.text(`Output SGST @ ${sgstRate}%:`, summaryLabelX, y, { width: summaryWidth, align: 'right' });
    doc.text(`₹${sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryValueX, y, { width: 50, align: 'right' });
    y += 18; // Increased spacing
    
    // Rounding off
    const grandTotalBeforeRounding = totalAmount + cgstAmount + sgstAmount;
    const roundingOff = Math.round(grandTotalBeforeRounding) - grandTotalBeforeRounding;
    const grandTotal = Math.round(grandTotalBeforeRounding);
    
    doc.text('Rounding off:', summaryLabelX, y, { width: summaryWidth, align: 'right' });
    doc.text(`₹${roundingOff.toFixed(2)}`, summaryValueX, y, { width: 50, align: 'right' });
    y += 20; // Increased spacing before total
    
    // Total
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Total:', summaryLabelX, y, { width: summaryWidth, align: 'right' });
    doc.text(`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryValueX, y, { width: 50, align: 'right' });
    
    y += 35; // Increased spacing after total
    
    // ========== FOOTER SECTION - Box Structures ==========
    // Amount in Words Box (Bottom Left)
    const amountWordsBoxY = y;
    const amountWordsBoxHeight = 45;
    doc.rect(startX, amountWordsBoxY, 300, amountWordsBoxHeight).stroke();
    
    const amountInWords = convertNumberToWords(grandTotal);
    doc.fontSize(9).font('Helvetica-Bold').text('Amount Chargeable (in words):', startX + 5, y + 5);
    y += 15; // Increased spacing
    doc.font('Helvetica');
    doc.text(amountInWords, startX + 5, y, { width: 290 });
    
    // E. & O.E (Errors and Omissions Excepted) - Next to Total
    doc.fontSize(8).font('Helvetica').text('E. & O.E', summaryValueX + 60, summaryStartY + 70);
    
    // Remarks Box (Below amount in words)
    y = amountWordsBoxY + amountWordsBoxHeight + 10;
    const remarksBoxHeight = 30;
    doc.rect(startX, y, 300, remarksBoxHeight).stroke();
    
    doc.fontSize(9).font('Helvetica-Bold').text('Remarks:', startX + 5, y + 5);
    y += 15; // Increased spacing
    doc.font('Helvetica');
    doc.text('Total payment due in 30 days', startX + 5, y, { width: 290 });
    
    // Bank Details Box (Right side)
    let bankDetailsY = summaryStartY + 110; // Increased spacing
    const bankDetailsBoxHeight = 100;
    doc.rect(rightSectionX, bankDetailsY, 250, bankDetailsBoxHeight).stroke();
    
    doc.fontSize(9).font('Helvetica-Bold').text('Company\'s Bank Details:', rightSectionX + 5, bankDetailsY + 5);
    bankDetailsY += 18; // Increased spacing
    doc.font('Helvetica');
    doc.text('Bank Name:', rightSectionX + 5, bankDetailsY);
    bankDetailsY += 15; // Increased spacing
    doc.text('Account No.:', rightSectionX + 5, bankDetailsY);
    bankDetailsY += 15; // Increased spacing
    doc.text('IFSC Code:', rightSectionX + 5, bankDetailsY);
    bankDetailsY += 15; // Increased spacing
    doc.text('Branch:', rightSectionX + 5, bankDetailsY);
    
    // A/c Holder's Name
    bankDetailsY += 20; // Increased spacing
    doc.fontSize(9).font('Helvetica-Bold').text('A/c Holder\'s Name:', rightSectionX + 5, bankDetailsY);
    bankDetailsY += 15; // Increased spacing
    doc.font('Helvetica');
    doc.text('SAFALATA FOOD PRIVATE LIMITED', rightSectionX + 5, bankDetailsY);
    
    // Footer line
    y = doc.page.height - 40;
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    y += 10;
    
    // Footer text
    doc.fontSize(8).font('Helvetica').text(
      `Generated on ${new Date().toLocaleString('en-IN')} | This is a computer-generated invoice, no signature required.`,
      startX,
      y,
      { align: 'center', width: pageWidth }
    );

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Generate bill PDF error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while generating bill PDF',
      error: error.message 
    });
  }
});

// Generate E-Way Bill (Admin only)
// POST /api/dealer-requests/:id/ewaybill
router.post('/:id/ewaybill', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const request = await DealerRequest.findById(id)
      .populate('dealer', 'name email')
      .populate('product', 'title packetPrice packetsPerStrip');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Dealer request not found'
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'E-way bill can only be generated for approved requests'
      });
    }

    // Check if e-way bill already exists
    if (request.ewayBillNo && request.ewayBillStatus === 'active') {
      return res.status(400).json({
        success: false,
        message: 'E-way bill already generated for this request',
        data: {
          ewayBillNo: request.ewayBillNo,
          ewayBillDate: request.ewayBillDate,
          ewayBillValidUpto: request.ewayBillValidUpto
        }
      });
    }

    // Calculate invoice details
    const invoiceDate = request.processedAt || request.requestedAt;
    const totalPackets = request.strips * (request.product?.packetsPerStrip || 1);
    const totalAmount = totalPackets * (request.product?.packetPrice || 0);
    const cgstRate = 2.5;
    const sgstRate = 2.5;
    const cgstAmount = (totalAmount * cgstRate) / 100;
    const sgstAmount = (totalAmount * sgstRate) / 100;
    const grandTotal = Math.round(totalAmount + cgstAmount + sgstAmount);

    // Dummy GST details for testing (replace with actual values in production)
    const supplierGstin = process.env.SUPPLIER_GSTIN || '24AABCU9603R1ZX'; // Dummy GSTIN for testing
    const buyerGstin = req.body.buyerGstin || '24AABCS1234R1ZX'; // Dummy buyer GSTIN, can be provided in request
    
    // Generate dummy e-way bill number (format: 123456789012)
    // In production, this would be generated by calling the actual GST e-way bill API
    const ewayBillNo = `1234567890${String(Date.now()).slice(-2)}`;
    const ewayBillDate = new Date();
    const validUpto = new Date(ewayBillDate);
    validUpto.setDate(validUpto.getDate() + 1); // Valid for 1 day (can be adjusted)

    // Update request with e-way bill details
    request.ewayBillNo = ewayBillNo;
    request.ewayBillDate = ewayBillDate;
    request.ewayBillValidUpto = validUpto;
    request.ewayBillGeneratedBy = req.user._id;
    request.ewayBillStatus = 'active';
    await request.save();

    res.json({
      success: true,
      message: 'E-way bill generated successfully',
      data: {
        ewayBillNo: request.ewayBillNo,
        ewayBillDate: request.ewayBillDate,
        validUpto: request.ewayBillValidUpto,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Generate e-way bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating e-way bill',
      error: error.message
    });
  }
});

// Get E-Way Bill Details
// GET /api/dealer-requests/:id/ewaybill
router.get('/:id/ewaybill', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const request = await DealerRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Dealer request not found'
      });
    }

    if (!request.ewayBillNo) {
      return res.status(404).json({
        success: false,
        message: 'E-way bill not generated for this request'
      });
    }

    res.json({
      success: true,
      message: 'E-way bill details retrieved successfully',
      data: {
        ewayBillNo: request.ewayBillNo,
        ewayBillDate: request.ewayBillDate,
        validUpto: request.ewayBillValidUpto,
        status: request.ewayBillStatus
      }
    });
  } catch (error) {
    console.error('Get e-way bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching e-way bill',
      error: error.message
    });
  }
});

// Cancel E-Way Bill
// POST /api/dealer-requests/:id/ewaybill/cancel
router.post('/:id/ewaybill/cancel', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const request = await DealerRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Dealer request not found'
      });
    }

    if (!request.ewayBillNo || request.ewayBillStatus !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'No active e-way bill found to cancel'
      });
    }

    // Update e-way bill status
    request.ewayBillStatus = 'cancelled';
    await request.save();

    res.json({
      success: true,
      message: 'E-way bill cancelled successfully',
      data: {
        ewayBillNo: request.ewayBillNo,
        cancelledAt: new Date(),
        reason: reason || 'Cancelled by admin'
      }
    });
  } catch (error) {
    console.error('Cancel e-way bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling e-way bill',
      error: error.message
    });
  }
});

module.exports = router;

