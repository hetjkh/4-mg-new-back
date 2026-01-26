const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const DealerCredit = require('../models/DealerCredit');
const DealerRequest = require('../models/DealerRequest');
const User = require('../models/User');
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
    console.error('Token verification error:', error);
    return res.status(401).json({ 
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
      message: 'Admin access required' 
    });
  }
  next();
};

// Middleware to verify dealer or admin
const verifyDealerOrAdmin = (req, res, next) => {
  if (req.user.role !== 'dealer' && req.user.role !== 'dellear' && req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Dealer or admin access required' 
    });
  }
  next();
};

// ==================== PAYMENT HISTORY ====================

// Get payment history (Admin: all, Dealer: own)
router.get('/payments', verifyToken, verifyDealerOrAdmin, async (req, res) => {
  try {
    const { 
      dealerId, 
      status, 
      type, 
      startDate, 
      endDate,
      paymentMethod,
      page = 1,
      limit = 50 
    } = req.query;

    const query = {};

    // If dealer, only show their payments
    if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
    } else if (dealerId) {
      // Admin can filter by dealer
      if (mongoose.Types.ObjectId.isValid(dealerId)) {
        query.dealer = dealerId;
      }
    }

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transactionDate.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await Payment.find(query)
      .populate('dealer', 'name email')
      .populate('dealerRequest', 'strips status')
      .populate('processedBy', 'name email')
      .populate('reconciledBy', 'name email')
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    const transformedPayments = payments.map(payment => {
      const paymentObj = payment.toObject ? payment.toObject() : payment;
      return {
        ...paymentObj,
        id: paymentObj._id || paymentObj.id,
        dealer: paymentObj.dealer ? {
          ...paymentObj.dealer,
          id: paymentObj.dealer._id || paymentObj.dealer.id,
        } : paymentObj.dealer,
        dealerRequest: paymentObj.dealerRequest ? {
          ...paymentObj.dealerRequest,
          id: paymentObj.dealerRequest._id || paymentObj.dealerRequest.id,
        } : paymentObj.dealerRequest,
        processedBy: paymentObj.processedBy ? {
          ...paymentObj.processedBy,
          id: paymentObj.processedBy._id || paymentObj.processedBy.id,
        } : paymentObj.processedBy,
        reconciledBy: paymentObj.reconciledBy ? {
          ...paymentObj.reconciledBy,
          id: paymentObj.reconciledBy._id || paymentObj.reconciledBy.id,
        } : paymentObj.reconciledBy,
      };
    });

    res.json({
      success: true,
      data: {
        payments: transformedPayments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment history',
      error: error.message 
    });
  }
});

// Get single payment details
router.get('/payments/:id', verifyToken, verifyDealerOrAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid payment ID format' 
      });
    }

    const payment = await Payment.findById(req.params.id)
      .populate('dealer', 'name email')
      .populate('dealerRequest')
      .populate('processedBy', 'name email')
      .populate('reconciledBy', 'name email');

    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }

    // Check access: dealer can only see their own payments
    if ((req.user.role === 'dealer' || req.user.role === 'dellear') && 
        payment.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const paymentObj = payment.toObject ? payment.toObject() : payment;
    const transformedPayment = {
      ...paymentObj,
      id: paymentObj._id || paymentObj.id,
      dealer: paymentObj.dealer ? {
        ...paymentObj.dealer,
        id: paymentObj.dealer._id || paymentObj.dealer.id,
      } : paymentObj.dealer,
      dealerRequest: paymentObj.dealerRequest ? {
        ...paymentObj.dealerRequest,
        id: paymentObj.dealerRequest._id || paymentObj.dealerRequest.id,
      } : paymentObj.dealerRequest,
      processedBy: paymentObj.processedBy ? {
        ...paymentObj.processedBy,
        id: paymentObj.processedBy._id || paymentObj.processedBy.id,
      } : paymentObj.processedBy,
      reconciledBy: paymentObj.reconciledBy ? {
        ...paymentObj.reconciledBy,
        id: paymentObj.reconciledBy._id || paymentObj.reconciledBy.id,
      } : paymentObj.reconciledBy,
    };

    res.json({
      success: true,
      data: { payment: transformedPayment },
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment',
      error: error.message 
    });
  }
});

// Create payment record (Dealer or Admin)
router.post('/payments', verifyToken, verifyDealerOrAdmin, upload.single('receiptImage'), async (req, res) => {
  try {
    const {
      dealerId,
      dealerRequestId,
      type,
      amount,
      paymentMethod,
      upiTransactionId,
      upiReferenceNumber,
      bankTransactionId,
      transactionDate,
      notes,
    } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required and must be greater than 0',
      });
    }

    if (!type || !['payment', 'refund', 'credit'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment type is required',
      });
    }

    // Determine dealer ID
    let finalDealerId;
    if (req.user.role === 'admin' && dealerId) {
      if (!mongoose.Types.ObjectId.isValid(dealerId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid dealer ID format' 
        });
      }
      finalDealerId = dealerId;
    } else {
      // Dealer can only create payments for themselves
      finalDealerId = req.user._id;
    }

    // Verify dealer exists
    const dealer = await User.findById(finalDealerId);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dealer',
      });
    }

    // Handle receipt image upload
    let receiptImageUrl = null;
    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'payment-receipts' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(req.file.buffer);
        });
        receiptImageUrl = result.secure_url;
      } catch (uploadError) {
        console.error('Receipt upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload receipt image',
        });
      }
    }

    // Create payment record
    const payment = new Payment({
      dealer: finalDealerId,
      dealerRequest: dealerRequestId && mongoose.Types.ObjectId.isValid(dealerRequestId) ? dealerRequestId : null,
      type,
      amount: parseFloat(amount),
      paymentMethod: paymentMethod || 'upi',
      upiTransactionId: upiTransactionId || null,
      upiReferenceNumber: upiReferenceNumber || null,
      bankTransactionId: bankTransactionId || null,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      receiptImage: receiptImageUrl,
      notes: notes || '',
      status: 'pending', // Will be verified by admin
    });

    await payment.save();
    await payment.populate('dealer', 'name email');
    if (payment.dealerRequest) {
      await payment.populate('dealerRequest');
    }

    const paymentObj = payment.toObject ? payment.toObject() : payment;
    const transformedPayment = {
      ...paymentObj,
      id: paymentObj._id || paymentObj.id,
      dealer: paymentObj.dealer ? {
        ...paymentObj.dealer,
        id: paymentObj.dealer._id || paymentObj.dealer.id,
      } : paymentObj.dealer,
      dealerRequest: paymentObj.dealerRequest ? {
        ...paymentObj.dealerRequest,
        id: paymentObj.dealerRequest._id || paymentObj.dealerRequest.id,
      } : paymentObj.dealerRequest,
    };

    res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
      data: { payment: transformedPayment },
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating payment',
      error: error.message 
    });
  }
});

// Update payment status (Admin only)
router.put('/payments/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid payment ID format' 
      });
    }

    const { status, notes } = req.body;

    if (!status || !['pending', 'completed', 'failed', 'cancelled', 'refunded'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required',
      });
    }

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }

    payment.status = status;
    payment.processedBy = req.user._id;
    payment.processedAt = new Date();
    if (notes) {
      payment.notes = (payment.notes ? payment.notes + '\n' : '') + notes;
    }

    await payment.save();
    await payment.populate('dealer', 'name email');
    await payment.populate('processedBy', 'name email');

    // Update dealer credit if payment is completed
    if (status === 'completed' && payment.type === 'payment') {
      const dealerCredit = await DealerCredit.findOne({ dealer: payment.dealer });
      if (dealerCredit) {
        dealerCredit.currentBalance = Math.max(0, dealerCredit.currentBalance - payment.amount);
        dealerCredit.lastUpdated = new Date();
        dealerCredit.updatedBy = req.user._id;
        await dealerCredit.save();
      }
    }

    const paymentObj = payment.toObject ? payment.toObject() : payment;
    const transformedPayment = {
      ...paymentObj,
      id: paymentObj._id || paymentObj.id,
      dealer: paymentObj.dealer ? {
        ...paymentObj.dealer,
        id: paymentObj.dealer._id || paymentObj.dealer.id,
      } : paymentObj.dealer,
      processedBy: paymentObj.processedBy ? {
        ...paymentObj.processedBy,
        id: paymentObj.processedBy._id || paymentObj.processedBy.id,
      } : paymentObj.processedBy,
    };

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: { payment: transformedPayment },
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating payment status',
      error: error.message 
    });
  }
});

// ==================== OUTSTANDING PAYMENTS ====================

// Get outstanding payments dashboard
router.get('/outstanding', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId } = req.query;

    const query = {
      status: { $in: ['pending', 'completed'] },
      type: 'payment',
    };

    if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
      query.dealer = dealerId;
    }

    // Get all payments that haven't been fully reconciled
    const payments = await Payment.find(query)
      .populate('dealer', 'name email')
      .populate('dealerRequest')
      .sort({ transactionDate: -1 });

    // Calculate outstanding amounts per dealer
    const dealerOutstanding = {};
    
    payments.forEach(payment => {
      const dealerId = payment.dealer._id.toString();
      if (!dealerOutstanding[dealerId]) {
        dealerOutstanding[dealerId] = {
          dealer: {
            id: payment.dealer._id.toString(),
            name: payment.dealer.name,
            email: payment.dealer.email,
          },
          totalOutstanding: 0,
          pendingPayments: 0,
          completedPayments: 0,
          payments: [],
        };
      }

      if (payment.status === 'pending') {
        dealerOutstanding[dealerId].totalOutstanding += payment.amount;
        dealerOutstanding[dealerId].pendingPayments += 1;
      } else if (payment.status === 'completed' && !payment.reconciled) {
        dealerOutstanding[dealerId].totalOutstanding += payment.amount;
        dealerOutstanding[dealerId].completedPayments += 1;
      }

      dealerOutstanding[dealerId].payments.push({
        id: payment._id.toString(),
        amount: payment.amount,
        status: payment.status,
        transactionDate: payment.transactionDate,
        paymentMethod: payment.paymentMethod,
      });
    });

    const outstandingList = Object.values(dealerOutstanding)
      .filter(item => item.totalOutstanding > 0)
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // Calculate totals
    const totalOutstanding = outstandingList.reduce((sum, item) => sum + item.totalOutstanding, 0);
    const totalPending = outstandingList.reduce((sum, item) => sum + item.pendingPayments, 0);
    const totalCompleted = outstandingList.reduce((sum, item) => sum + item.completedPayments, 0);

    res.json({
      success: true,
      data: {
        outstanding: outstandingList,
        summary: {
          totalOutstanding,
          totalDealers: outstandingList.length,
          totalPending,
          totalCompleted,
        },
      },
    });
  } catch (error) {
    console.error('Get outstanding payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching outstanding payments',
      error: error.message 
    });
  }
});

// ==================== PAYMENT RECONCILIATION ====================

// Reconcile payment (Admin only)
router.put('/payments/:id/reconcile', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid payment ID format' 
      });
    }

    const payment = await Payment.findById(req.params.id)
      .populate('dealer', 'name email');

    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }

    if (payment.reconciled) {
      return res.status(400).json({
        success: false,
        message: 'Payment is already reconciled',
      });
    }

    payment.reconciled = true;
    payment.reconciledBy = req.user._id;
    payment.reconciledAt = new Date();

    await payment.save();
    await payment.populate('reconciledBy', 'name email');

    const paymentObj = payment.toObject ? payment.toObject() : payment;
    const transformedPayment = {
      ...paymentObj,
      id: paymentObj._id || paymentObj.id,
      dealer: paymentObj.dealer ? {
        ...paymentObj.dealer,
        id: paymentObj.dealer._id || paymentObj.dealer.id,
      } : paymentObj.dealer,
      reconciledBy: paymentObj.reconciledBy ? {
        ...paymentObj.reconciledBy,
        id: paymentObj.reconciledBy._id || paymentObj.reconciledBy.id,
      } : paymentObj.reconciledBy,
    };

    res.json({
      success: true,
      message: 'Payment reconciled successfully',
      data: { payment: transformedPayment },
    });
  } catch (error) {
    console.error('Reconcile payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while reconciling payment',
      error: error.message 
    });
  }
});

// Bulk reconcile payments
router.post('/payments/reconcile-bulk', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { paymentIds } = req.body;

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment IDs array is required',
      });
    }

    const validIds = paymentIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid payment IDs provided',
      });
    }

    const result = await Payment.updateMany(
      { _id: { $in: validIds }, reconciled: false },
      {
        $set: {
          reconciled: true,
          reconciledBy: req.user._id,
          reconciledAt: new Date(),
        },
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} payment(s) reconciled successfully`,
      data: {
        reconciled: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error('Bulk reconcile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while reconciling payments',
      error: error.message 
    });
  }
});

// ==================== UPI TRANSACTION HISTORY ====================

// Get UPI transaction history
router.get('/upi-transactions', verifyToken, verifyDealerOrAdmin, async (req, res) => {
  try {
    const { 
      dealerId,
      upiTransactionId,
      startDate,
      endDate,
      page = 1,
      limit = 50 
    } = req.query;

    const query = {
      paymentMethod: 'upi',
    };

    if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
    } else if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
      query.dealer = dealerId;
    }

    if (upiTransactionId) {
      query.upiTransactionId = { $regex: upiTransactionId, $options: 'i' };
    }

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transactionDate.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await Payment.find(query)
      .populate('dealer', 'name email')
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    const transformedPayments = payments.map(payment => {
      const paymentObj = payment.toObject ? payment.toObject() : payment;
      return {
        ...paymentObj,
        id: paymentObj._id || paymentObj.id,
        dealer: paymentObj.dealer ? {
          ...paymentObj.dealer,
          id: paymentObj.dealer._id || paymentObj.dealer.id,
        } : paymentObj.dealer,
      };
    });

    res.json({
      success: true,
      data: {
        transactions: transformedPayments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get UPI transactions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching UPI transactions',
      error: error.message 
    });
  }
});

// ==================== REFUND MANAGEMENT ====================

// Create refund (Admin only)
router.post('/refunds', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const {
      dealerId,
      paymentId,
      amount,
      reason,
      notes,
    } = req.body;

    if (!dealerId || !mongoose.Types.ObjectId.isValid(dealerId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid dealer ID is required',
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required and must be greater than 0',
      });
    }

    const dealer = await User.findById(dealerId);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dealer',
      });
    }

    // Verify payment exists if paymentId provided
    let originalPayment = null;
    if (paymentId && mongoose.Types.ObjectId.isValid(paymentId)) {
      originalPayment = await Payment.findById(paymentId);
      if (!originalPayment) {
        return res.status(404).json({
          success: false,
          message: 'Original payment not found',
        });
      }
    }

    const refund = new Payment({
      dealer: dealerId,
      dealerRequest: originalPayment?.dealerRequest || null,
      type: 'refund',
      amount: parseFloat(amount),
      paymentMethod: 'credit',
      status: 'completed', // Refunds are auto-completed
      notes: notes || reason || '',
      processedBy: req.user._id,
      processedAt: new Date(),
      transactionDate: new Date(),
    });

    await refund.save();
    await refund.populate('dealer', 'name email');
    await refund.populate('processedBy', 'name email');

    // Update dealer credit
    let dealerCredit = await DealerCredit.findOne({ dealer: dealerId });
    if (!dealerCredit) {
      dealerCredit = new DealerCredit({
        dealer: dealerId,
        creditLimit: 0,
        currentBalance: 0,
      });
    }
    dealerCredit.currentBalance = Math.max(0, dealerCredit.currentBalance - parseFloat(amount));
    dealerCredit.lastUpdated = new Date();
    dealerCredit.updatedBy = req.user._id;
    await dealerCredit.save();

    const refundObj = refund.toObject ? refund.toObject() : refund;
    const transformedRefund = {
      ...refundObj,
      id: refundObj._id || refundObj.id,
      dealer: refundObj.dealer ? {
        ...refundObj.dealer,
        id: refundObj.dealer._id || refundObj.dealer.id,
      } : refundObj.dealer,
      processedBy: refundObj.processedBy ? {
        ...refundObj.processedBy,
        id: refundObj.processedBy._id || refundObj.processedBy.id,
      } : refundObj.processedBy,
    };

    res.status(201).json({
      success: true,
      message: 'Refund processed successfully',
      data: { refund: transformedRefund },
    });
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while processing refund',
      error: error.message 
    });
  }
});

// Get refunds
router.get('/refunds', verifyToken, verifyDealerOrAdmin, async (req, res) => {
  try {
    const { dealerId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const query = { type: 'refund' };

    if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
    } else if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
      query.dealer = dealerId;
    }

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transactionDate.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const refunds = await Payment.find(query)
      .populate('dealer', 'name email')
      .populate('processedBy', 'name email')
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    const transformedRefunds = refunds.map(refund => {
      const refundObj = refund.toObject ? refund.toObject() : refund;
      return {
        ...refundObj,
        id: refundObj._id || refundObj.id,
        dealer: refundObj.dealer ? {
          ...refundObj.dealer,
          id: refundObj.dealer._id || refundObj.dealer.id,
        } : refundObj.dealer,
        processedBy: refundObj.processedBy ? {
          ...refundObj.processedBy,
          id: refundObj.processedBy._id || refundObj.processedBy.id,
        } : refundObj.processedBy,
      };
    });

    res.json({
      success: true,
      data: {
        refunds: transformedRefunds,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get refunds error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching refunds',
      error: error.message 
    });
  }
});

// ==================== CREDIT LIMIT MANAGEMENT ====================

// Get all dealer credits (Admin only)
router.get('/credits', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId } = req.query;

    const query = {};
    if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
      query.dealer = dealerId;
    }

    const credits = await DealerCredit.find(query)
      .populate('dealer', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ currentBalance: -1 });

    const transformedCredits = credits.map(credit => {
      const creditObj = credit.toObject ? credit.toObject() : credit;
      return {
        ...creditObj,
        id: creditObj._id || creditObj.id,
        dealer: creditObj.dealer ? {
          ...creditObj.dealer,
          id: creditObj.dealer._id || creditObj.dealer.id,
        } : creditObj.dealer,
        updatedBy: creditObj.updatedBy ? {
          ...creditObj.updatedBy,
          id: creditObj.updatedBy._id || creditObj.updatedBy.id,
        } : creditObj.updatedBy,
      };
    });

    res.json({
      success: true,
      data: { credits: transformedCredits },
    });
  } catch (error) {
    console.error('Get credits error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching credits',
      error: error.message 
    });
  }
});

// Get dealer's own credit (Dealer)
router.get('/credits/my', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
      return res.status(403).json({
        success: false,
        message: 'Dealer access required',
      });
    }

    let credit = await DealerCredit.findOne({ dealer: req.user._id })
      .populate('dealer', 'name email')
      .populate('updatedBy', 'name email');

    // Create default if doesn't exist
    if (!credit) {
      credit = new DealerCredit({
        dealer: req.user._id,
        creditLimit: 0,
        currentBalance: 0,
      });
      await credit.save();
      await credit.populate('dealer', 'name email');
    }

    const creditObj = credit.toObject ? credit.toObject() : credit;
    const transformedCredit = {
      ...creditObj,
      id: creditObj._id || creditObj.id,
      dealer: creditObj.dealer ? {
        ...creditObj.dealer,
        id: creditObj.dealer._id || creditObj.dealer.id,
      } : creditObj.dealer,
      updatedBy: creditObj.updatedBy ? {
        ...creditObj.updatedBy,
        id: creditObj.updatedBy._id || creditObj.updatedBy.id,
      } : creditObj.updatedBy,
    };

    res.json({
      success: true,
      data: { credit: transformedCredit },
    });
  } catch (error) {
    console.error('Get my credit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching credit',
      error: error.message 
    });
  }
});

// Update credit limit (Admin only)
router.put('/credits/:dealerId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { creditLimit, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(dealerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid dealer ID format' 
      });
    }

    if (creditLimit === undefined || creditLimit < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid credit limit is required',
      });
    }

    const dealer = await User.findById(dealerId);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found',
      });
    }

    let credit = await DealerCredit.findOne({ dealer: dealerId });

    if (!credit) {
      credit = new DealerCredit({
        dealer: dealerId,
        creditLimit: parseFloat(creditLimit),
        currentBalance: 0,
      });
    } else {
      credit.creditLimit = parseFloat(creditLimit);
    }

    credit.lastUpdated = new Date();
    credit.updatedBy = req.user._id;
    if (notes) {
      credit.notes = (credit.notes ? credit.notes + '\n' : '') + new Date().toISOString() + ': ' + notes;
    }

    await credit.save();
    await credit.populate('dealer', 'name email');
    await credit.populate('updatedBy', 'name email');

    const creditObj = credit.toObject ? credit.toObject() : credit;
    const transformedCredit = {
      ...creditObj,
      id: creditObj._id || creditObj.id,
      dealer: creditObj.dealer ? {
        ...creditObj.dealer,
        id: creditObj.dealer._id || creditObj.dealer.id,
      } : creditObj.dealer,
      updatedBy: creditObj.updatedBy ? {
        ...creditObj.updatedBy,
        id: creditObj.updatedBy._id || creditObj.updatedBy.id,
      } : creditObj.updatedBy,
    };

    res.json({
      success: true,
      message: 'Credit limit updated successfully',
      data: { credit: transformedCredit },
    });
  } catch (error) {
    console.error('Update credit limit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating credit limit',
      error: error.message 
    });
  }
});

// ==================== PAYMENT REMINDERS ====================

// Get payment reminders (Admin only)
router.get('/reminders', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { daysOverdue = 7 } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOverdue));

    // Find pending payments older than cutoff date
    const pendingPayments = await Payment.find({
      status: 'pending',
      type: 'payment',
      transactionDate: { $lte: cutoffDate },
    })
      .populate('dealer', 'name email')
      .populate('dealerRequest')
      .sort({ transactionDate: 1 });

    const reminders = pendingPayments.map(payment => {
      const paymentObj = payment.toObject ? payment.toObject() : payment;
      const daysOverdue = Math.floor((new Date() - new Date(payment.transactionDate)) / (1000 * 60 * 60 * 24));
      
      return {
        ...paymentObj,
        id: paymentObj._id || paymentObj.id,
        dealer: paymentObj.dealer ? {
          ...paymentObj.dealer,
          id: paymentObj.dealer._id || paymentObj.dealer.id,
        } : paymentObj.dealer,
        daysOverdue,
      };
    });

    res.json({
      success: true,
      data: {
        reminders,
        summary: {
          total: reminders.length,
          totalAmount: reminders.reduce((sum, r) => sum + r.amount, 0),
        },
      },
    });
  } catch (error) {
    console.error('Get payment reminders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment reminders',
      error: error.message 
    });
  }
});

module.exports = router;


