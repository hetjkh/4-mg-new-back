const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const SalesTarget = require('../models/SalesTarget');
const Commission = require('../models/Commission');
const User = require('../models/User');
const Product = require('../models/Product');
const StockAllocation = require('../models/StockAllocation');
const Shopkeeper = require('../models/Shopkeeper');
const { getLanguage } = require('../middleware/translateMessages');

const router = express.Router();

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

// Middleware to verify dealer
const verifyDealer = (req, res, next) => {
  if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
    return res.status(403).json({ 
      success: false, 
      message: 'Dealer access required' 
    });
  }
  next();
};

// Middleware to verify salesman
const verifySalesman = (req, res, next) => {
  if (req.user.role !== 'salesman') {
    return res.status(403).json({ 
      success: false, 
      message: 'Salesman access required' 
    });
  }
  next();
};

// Helper function to format product title
const formatProductTitle = (product, language = 'en') => {
  if (!product || !product.title) {
    return '';
  }
  if (typeof product.title === 'string') {
    return product.title;
  }
  return product.title[language] || product.title.en || product.title.gu || '';
};

// Helper function to get date range
const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    default:
      startDate = new Date(0);
      endDate = now;
  }

  return { startDate, endDate };
};

// ==================== SALES TRACKING ====================

// Create Sale (Salesman or Dealer)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      salesmanId,
      productId,
      quantity,
      unitPrice,
      customerName,
      customerPhone,
      customerEmail,
      shopkeeperId,
      invoiceNo,
      location,
      saleDate,
      paymentMethod,
      paymentStatus,
      notes,
      stockAllocationId,
    } = req.body;

    // Validate required fields
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and valid quantity are required',
      });
    }

    if (!unitPrice || unitPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid unit price is required',
      });
    }

    // Determine salesman and dealer
    let salesman, dealer;
    if (req.user.role === 'salesman') {
      salesman = req.user;
      dealer = await User.findById(req.user.createdBy);
      if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dealer association',
        });
      }
    } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      dealer = req.user;
      if (!salesmanId || !mongoose.Types.ObjectId.isValid(salesmanId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid salesman ID is required',
        });
      }
      salesman = await User.findOne({
        _id: salesmanId,
        createdBy: dealer._id,
        role: 'salesman',
      });
      if (!salesman) {
        return res.status(404).json({
          success: false,
          message: 'Salesman not found or access denied',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Only salesmen and dealers can create sales',
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Optional shopkeeper validation (if provided)
    let shopkeeper = null;
    if (shopkeeperId && mongoose.Types.ObjectId.isValid(shopkeeperId)) {
      shopkeeper = await Shopkeeper.findById(shopkeeperId);
      if (!shopkeeper) {
        return res.status(404).json({ success: false, message: 'Shopkeeper not found' });
      }
      // Ensure shopkeeper belongs to this salesman/dealer relationship
      if (req.user.role === 'salesman') {
        if (shopkeeper.salesman.toString() !== req.user._id.toString()) {
          return res.status(403).json({ success: false, message: 'Access denied (shopkeeper)' });
        }
      } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
        if (shopkeeper.dealer.toString() !== dealer._id.toString()) {
          return res.status(403).json({ success: false, message: 'Access denied (shopkeeper)' });
        }
      }
    }

    // Calculate strips (assuming packetsPerStrip from product)
    const strips = Math.ceil(quantity / (product.packetsPerStrip || 1));
    const totalAmount = quantity * unitPrice;

    // Create sale record
    const sale = new Sale({
      salesman: salesman._id,
      dealer: dealer._id,
      product: productId,
      stockAllocation: stockAllocationId && mongoose.Types.ObjectId.isValid(stockAllocationId) ? stockAllocationId : null,
      quantity,
      strips,
      unitPrice,
      totalAmount,
      shopkeeper: shopkeeper ? shopkeeper._id : null,
      invoiceNo: invoiceNo || '',
      customerName: customerName || (shopkeeper ? shopkeeper.name : '') || '',
      customerPhone: customerPhone || (shopkeeper ? shopkeeper.phone : '') || '',
      customerEmail: (customerEmail || (shopkeeper ? shopkeeper.email : '') || '').toLowerCase().trim(),
      location: location || {},
      saleDate: saleDate ? new Date(saleDate) : new Date(),
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: paymentStatus || 'completed',
      notes: notes || '',
      createdBy: req.user._id,
    });

    await sale.save();
    await sale.populate('salesman', 'name email');
    await sale.populate('dealer', 'name email');
    await sale.populate('product', 'title packetPrice packetsPerStrip image');

    // Update sales target if exists
    await updateSalesTarget(salesman._id, dealer._id, totalAmount, strips);

    const language = getLanguage(req);
    const saleObj = sale.toObject ? sale.toObject() : sale;
    const transformedSale = {
      ...saleObj,
      id: saleObj._id || saleObj.id,
      salesman: saleObj.salesman ? {
        ...saleObj.salesman,
        id: saleObj.salesman._id || saleObj.salesman.id,
      } : saleObj.salesman,
      dealer: saleObj.dealer ? {
        ...saleObj.dealer,
        id: saleObj.dealer._id || saleObj.dealer.id,
      } : saleObj.dealer,
      product: saleObj.product ? {
        ...saleObj.product,
        id: saleObj.product._id || saleObj.product.id,
        title: formatProductTitle(saleObj.product, language),
      } : saleObj.product,
    };

    res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: { sale: transformedSale },
    });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating sale',
      error: error.message 
    });
  }
});

// Get Sales (with filters)
router.get('/', verifyToken, async (req, res) => {
  try {
    const {
      salesmanId,
      dealerId,
      productId,
      startDate,
      endDate,
      paymentStatus,
      paymentMethod,
      period,
      page = 1,
      limit = 50,
      search,
    } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'salesman') {
      query.salesman = req.user._id;
    } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        // Verify salesman belongs to this dealer
        const salesman = await User.findOne({
          _id: salesmanId,
          createdBy: req.user._id,
          role: 'salesman',
        });
        if (salesman) {
          query.salesman = salesmanId;
        }
      }
    } else if (req.user.role === 'admin') {
      if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
        query.dealer = dealerId;
      }
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        query.salesman = salesmanId;
      }
    }

    // Product filter
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.product = productId;
    }

    // Date range
    if (period) {
      const { startDate: periodStart, endDate: periodEnd } = getDateRange(period);
      query.saleDate = { $gte: periodStart, $lte: periodEnd };
    } else {
      if (startDate || endDate) {
        query.saleDate = {};
        if (startDate) {
          query.saleDate.$gte = new Date(startDate);
        }
        if (endDate) {
          query.saleDate.$lte = new Date(endDate);
        }
      }
    }

    // Payment filters
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    // Search filter (customer fields / invoiceNo)
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sales = await Sale.find(query)
      .populate('salesman', 'name email')
      .populate('dealer', 'name email')
      .populate('product', 'title packetPrice packetsPerStrip image')
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Sale.countDocuments(query);

    const language = getLanguage(req);
    const transformedSales = sales.map(sale => {
      const saleObj = sale.toObject ? sale.toObject() : sale;
      return {
        ...saleObj,
        id: saleObj._id || saleObj.id,
        salesman: saleObj.salesman ? {
          ...saleObj.salesman,
          id: saleObj.salesman._id || saleObj.salesman.id,
        } : saleObj.salesman,
        dealer: saleObj.dealer ? {
          ...saleObj.dealer,
          id: saleObj.dealer._id || saleObj.dealer.id,
        } : saleObj.dealer,
        product: saleObj.product ? {
          ...saleObj.product,
          id: saleObj.product._id || saleObj.product.id,
          title: formatProductTitle(saleObj.product, language),
        } : saleObj.product,
      };
    });

    res.json({
      success: true,
      data: {
        sales: transformedSales,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching sales',
      error: error.message 
    });
  }
});

// Get Single Sale
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid sale ID format' 
      });
    }

    const sale = await Sale.findById(req.params.id)
      .populate('salesman', 'name email')
      .populate('dealer', 'name email')
      .populate('product', 'title packetPrice packetsPerStrip image');

    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sale not found' 
      });
    }

    // Check access
    if (req.user.role === 'salesman' && sale.salesman.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    if ((req.user.role === 'dealer' || req.user.role === 'dellear') && sale.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const language = getLanguage(req);
    const saleObj = sale.toObject ? sale.toObject() : sale;
    const transformedSale = {
      ...saleObj,
      id: saleObj._id || saleObj.id,
      salesman: saleObj.salesman ? {
        ...saleObj.salesman,
        id: saleObj.salesman._id || saleObj.salesman.id,
      } : saleObj.salesman,
      dealer: saleObj.dealer ? {
        ...saleObj.dealer,
        id: saleObj.dealer._id || saleObj.dealer.id,
      } : saleObj.dealer,
      product: saleObj.product ? {
        ...saleObj.product,
        id: saleObj.product._id || saleObj.product.id,
        title: formatProductTitle(saleObj.product, language),
      } : saleObj.product,
    };

    res.json({
      success: true,
      data: { sale: transformedSale },
    });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching sale',
      error: error.message 
    });
  }
});

// Update Sale
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid sale ID format' 
      });
    }

    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sale not found' 
      });
    }

    // Check access
    if (req.user.role === 'salesman' && sale.salesman.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    if ((req.user.role === 'dealer' || req.user.role === 'dellear') && sale.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    // Update allowed fields
    const {
      quantity,
      unitPrice,
      customerName,
      customerPhone,
      location,
      saleDate,
      paymentMethod,
      paymentStatus,
      notes,
    } = req.body;

    if (quantity !== undefined) sale.quantity = quantity;
    if (unitPrice !== undefined) sale.unitPrice = unitPrice;
    if (customerName !== undefined) sale.customerName = customerName;
    if (customerPhone !== undefined) sale.customerPhone = customerPhone;
    if (location !== undefined) sale.location = location;
    if (saleDate !== undefined) sale.saleDate = new Date(saleDate);
    if (paymentMethod !== undefined) sale.paymentMethod = paymentMethod;
    if (paymentStatus !== undefined) sale.paymentStatus = paymentStatus;
    if (notes !== undefined) sale.notes = notes;

    // Recalculate total amount and strips
    if (quantity !== undefined || unitPrice !== undefined) {
      sale.totalAmount = sale.quantity * sale.unitPrice;
      await sale.populate('product', 'packetsPerStrip');
      if (sale.product) {
        sale.strips = Math.ceil(sale.quantity / (sale.product.packetsPerStrip || 1));
      }
    }

    await sale.save();
    await sale.populate('salesman', 'name email');
    await sale.populate('dealer', 'name email');
    await sale.populate('product', 'title packetPrice packetsPerStrip image');

    const language = getLanguage(req);
    const saleObj = sale.toObject ? sale.toObject() : sale;
    const transformedSale = {
      ...saleObj,
      id: saleObj._id || saleObj.id,
      salesman: saleObj.salesman ? {
        ...saleObj.salesman,
        id: saleObj.salesman._id || saleObj.salesman.id,
      } : saleObj.salesman,
      dealer: saleObj.dealer ? {
        ...saleObj.dealer,
        id: saleObj.dealer._id || saleObj.dealer.id,
      } : saleObj.dealer,
      product: saleObj.product ? {
        ...saleObj.product,
        id: saleObj.product._id || saleObj.product.id,
        title: formatProductTitle(saleObj.product, language),
      } : saleObj.product,
    };

    res.json({
      success: true,
      message: 'Sale updated successfully',
      data: { sale: transformedSale },
    });
  } catch (error) {
    console.error('Update sale error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating sale',
      error: error.message 
    });
  }
});

// Delete Sale
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid sale ID format' 
      });
    }

    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sale not found' 
      });
    }

    // Check access (only dealer or admin can delete)
    if (req.user.role === 'salesman') {
      return res.status(403).json({ 
        success: false, 
        message: 'Salesmen cannot delete sales' 
      });
    }
    if ((req.user.role === 'dealer' || req.user.role === 'dellear') && sale.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    await Sale.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Sale deleted successfully',
    });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting sale',
      error: error.message 
    });
  }
});

// ==================== BILL / INVOICE (MULTI-ITEM) ====================

// Create Bill (Salesman only): creates multiple Sale rows under one invoiceNo
router.post('/bill', verifyToken, verifySalesman, async (req, res) => {
  try {
    const { shopkeeperId, customerName, customerPhone, customerEmail, location, saleDate, paymentMethod, paymentStatus, notes, items, invoiceNo } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items array is required' });
    }

    const dealer = await User.findById(req.user.createdBy);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(400).json({ success: false, message: 'Invalid dealer association' });
    }

    // Optional shopkeeper
    let shopkeeper = null;
    if (shopkeeperId) {
      if (!mongoose.Types.ObjectId.isValid(shopkeeperId)) {
        return res.status(400).json({ success: false, message: 'Invalid shopkeeperId format' });
      }
      shopkeeper = await Shopkeeper.findById(shopkeeperId);
      if (!shopkeeper) {
        return res.status(404).json({ success: false, message: 'Shopkeeper not found' });
      }
      if (shopkeeper.salesman.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied (shopkeeper)' });
      }
    }

    // Generate invoiceNo if not provided
    const inv = (invoiceNo && String(invoiceNo).trim()) || `INV-${Date.now()}`;

    const createdSales = [];
    for (const item of items) {
      const { productId, quantity, unitPrice, stockAllocationId } = item || {};

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: 'Each item requires valid productId' });
      }
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ success: false, message: 'Each item requires valid quantity' });
      }
      if (unitPrice === undefined || unitPrice === null || unitPrice < 0) {
        return res.status(400).json({ success: false, message: 'Each item requires valid unitPrice' });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const strips = Math.ceil(quantity / (product.packetsPerStrip || 1));
      const totalAmount = quantity * unitPrice;

      const sale = new Sale({
        salesman: req.user._id,
        dealer: dealer._id,
        product: productId,
        stockAllocation: stockAllocationId && mongoose.Types.ObjectId.isValid(stockAllocationId) ? stockAllocationId : null,
        quantity,
        strips,
        unitPrice,
        totalAmount,
        shopkeeper: shopkeeper ? shopkeeper._id : null,
        invoiceNo: inv,
        customerName: customerName || (shopkeeper ? shopkeeper.name : '') || '',
        customerPhone: customerPhone || (shopkeeper ? shopkeeper.phone : '') || '',
        customerEmail: (customerEmail || (shopkeeper ? shopkeeper.email : '') || '').toLowerCase().trim(),
        location: location || (shopkeeper ? shopkeeper.location : {}) || {},
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: paymentStatus || 'completed',
        billStatus: 'pending', // Bills need dealer approval
        notes: notes || '',
        createdBy: req.user._id,
      });

      await sale.save();
      createdSales.push(sale);

      // Update sales target if exists
      await updateSalesTarget(req.user._id, dealer._id, totalAmount, strips);
    }

    // Populate the sales for response
    const language = getLanguage(req);
    const populatedSales = await Sale.find({ _id: { $in: createdSales.map((s) => s._id) } })
      .populate('salesman', 'name email')
      .populate('dealer', 'name email')
      .populate('product', 'title packetPrice packetsPerStrip image')
      .sort({ createdAt: 1 });

    const transformedSales = populatedSales.map((sale) => {
      const saleObj = sale.toObject ? sale.toObject() : sale;
      return {
        ...saleObj,
        id: saleObj._id || saleObj.id,
        salesman: saleObj.salesman
          ? { ...saleObj.salesman, id: saleObj.salesman._id || saleObj.salesman.id }
          : saleObj.salesman,
        dealer: saleObj.dealer ? { ...saleObj.dealer, id: saleObj.dealer._id || saleObj.dealer.id } : saleObj.dealer,
        product: saleObj.product
          ? {
              ...saleObj.product,
              id: saleObj.product._id || saleObj.product.id,
              title: formatProductTitle(saleObj.product, language),
            }
          : saleObj.product,
      };
    });

    const grandTotal = transformedSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    res.status(201).json({
      success: true,
      message: 'Bill created successfully',
      data: {
        invoiceNo: inv,
        grandTotal,
        sales: transformedSales,
      },
    });
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ success: false, message: 'Server error while creating bill', error: error.message });
  }
});

// ==================== SALES REPORTS ====================

// Get Sales Report
router.get('/reports/summary', verifyToken, async (req, res) => {
  try {
    const { period = 'monthly', salesmanId, dealerId, startDate, endDate } = req.query;

    let query = {};
    let dateRange;

    // Role-based filtering
    if (req.user.role === 'salesman') {
      query.salesman = req.user._id;
    } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        const salesman = await User.findOne({
          _id: salesmanId,
          createdBy: req.user._id,
          role: 'salesman',
        });
        if (salesman) {
          query.salesman = salesmanId;
        }
      }
    } else if (req.user.role === 'admin') {
      if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
        query.dealer = dealerId;
      }
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        query.salesman = salesmanId;
      }
    }

    // Date range
    if (startDate && endDate) {
      dateRange = { startDate: new Date(startDate), endDate: new Date(endDate) };
    } else {
      dateRange = getDateRange(period);
    }
    query.saleDate = { $gte: dateRange.startDate, $lte: dateRange.endDate };

    // Get sales data
    const sales = await Sale.find(query)
      .populate('salesman', 'name email')
      .populate('product', 'title');

    // Calculate summary
    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const totalStrips = sales.reduce((sum, sale) => sum + sale.strips, 0);
    const averageSaleValue = totalSales > 0 ? totalAmount / totalSales : 0;

    // Group by salesman
    const bySalesman = {};
    sales.forEach(sale => {
      const salesmanId = sale.salesman._id.toString();
      if (!bySalesman[salesmanId]) {
        bySalesman[salesmanId] = {
          salesman: {
            id: sale.salesman._id,
            name: sale.salesman.name,
            email: sale.salesman.email,
          },
          totalSales: 0,
          totalAmount: 0,
          totalQuantity: 0,
          totalStrips: 0,
        };
      }
      bySalesman[salesmanId].totalSales += 1;
      bySalesman[salesmanId].totalAmount += sale.totalAmount;
      bySalesman[salesmanId].totalQuantity += sale.quantity;
      bySalesman[salesmanId].totalStrips += sale.strips;
    });

    // Group by product
    const byProduct = {};
    sales.forEach(sale => {
      const productId = sale.product._id.toString();
      if (!byProduct[productId]) {
        byProduct[productId] = {
          product: {
            id: sale.product._id,
            title: typeof sale.product.title === 'string' ? sale.product.title : sale.product.title?.en || sale.product.title?.gu || 'Unknown',
          },
          totalSales: 0,
          totalAmount: 0,
          totalQuantity: 0,
        };
      }
      byProduct[productId].totalSales += 1;
      byProduct[productId].totalAmount += sale.totalAmount;
      byProduct[productId].totalQuantity += sale.quantity;
    });

    // Group by date
    const byDate = {};
    sales.forEach(sale => {
      const dateKey = sale.saleDate.toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: dateKey,
          totalSales: 0,
          totalAmount: 0,
        };
      }
      byDate[dateKey].totalSales += 1;
      byDate[dateKey].totalAmount += sale.totalAmount;
    });

    res.json({
      success: true,
      data: {
        period,
        dateRange: {
          start: dateRange.startDate,
          end: dateRange.endDate,
        },
        summary: {
          totalSales,
          totalAmount,
          totalQuantity,
          totalStrips,
          averageSaleValue,
        },
        bySalesman: Object.values(bySalesman),
        byProduct: Object.values(byProduct),
        byDate: Object.values(byDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      },
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while generating sales report',
      error: error.message 
    });
  }
});

// ==================== SALES TARGETS ====================

// Create Sales Target
router.post('/targets', verifyToken, verifyDealer, async (req, res) => {
  try {
    const {
      salesmanId,
      period,
      periodStart,
      periodEnd,
      targetAmount,
      targetStrips,
      notes,
    } = req.body;

    if (!period || !['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Valid period is required',
      });
    }

    if (!targetAmount || targetAmount < 0 || !targetStrips || targetStrips < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid target amount and strips are required',
      });
    }

    // Verify salesman if provided
    let salesman = null;
    if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
      salesman = await User.findOne({
        _id: salesmanId,
        createdBy: req.user._id,
        role: 'salesman',
      });
      if (!salesman) {
        return res.status(404).json({
          success: false,
          message: 'Salesman not found or access denied',
        });
      }
    }

    const target = new SalesTarget({
      dealer: req.user._id,
      salesman: salesman ? salesman._id : null,
      period,
      periodStart: periodStart ? new Date(periodStart) : new Date(),
      periodEnd: periodEnd ? new Date(periodEnd) : new Date(),
      targetAmount: parseFloat(targetAmount),
      targetStrips: parseInt(targetStrips),
      currentAmount: 0,
      currentStrips: 0,
      notes: notes || '',
      createdBy: req.user._id,
    });

    await target.save();
    await target.populate('salesman', 'name email');
    await target.populate('dealer', 'name email');

    const targetObj = target.toObject ? target.toObject() : target;
    const transformedTarget = {
      ...targetObj,
      id: targetObj._id || targetObj.id,
      salesman: targetObj.salesman ? {
        ...targetObj.salesman,
        id: targetObj.salesman._id || targetObj.salesman.id,
      } : targetObj.salesman,
      dealer: targetObj.dealer ? {
        ...targetObj.dealer,
        id: targetObj.dealer._id || targetObj.dealer.id,
      } : targetObj.dealer,
      achievementPercentage: target.achievementPercentage,
    };

    res.status(201).json({
      success: true,
      message: 'Sales target created successfully',
      data: { target: transformedTarget },
    });
  } catch (error) {
    console.error('Create sales target error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating sales target',
      error: error.message 
    });
  }
});

// Get Sales Targets
router.get('/targets', verifyToken, async (req, res) => {
  try {
    const { salesmanId, dealerId, period, isActive } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'salesman') {
      query.salesman = req.user._id;
      query.dealer = req.user.createdBy;
    } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        const salesman = await User.findOne({
          _id: salesmanId,
          createdBy: req.user._id,
          role: 'salesman',
        });
        if (salesman) {
          query.salesman = salesmanId;
        }
      }
    } else if (req.user.role === 'admin') {
      if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
        query.dealer = dealerId;
      }
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        query.salesman = salesmanId;
      }
    }

    if (period) {
      query.period = period;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const targets = await SalesTarget.find(query)
      .populate('salesman', 'name email')
      .populate('dealer', 'name email')
      .sort({ periodStart: -1 });

    const transformedTargets = targets.map(target => {
      const targetObj = target.toObject ? target.toObject() : target;
      return {
        ...targetObj,
        id: targetObj._id || targetObj.id,
        salesman: targetObj.salesman ? {
          ...targetObj.salesman,
          id: targetObj.salesman._id || targetObj.salesman.id,
        } : targetObj.salesman,
        dealer: targetObj.dealer ? {
          ...targetObj.dealer,
          id: targetObj.dealer._id || targetObj.dealer.id,
        } : targetObj.dealer,
        achievementPercentage: target.achievementPercentage,
      };
    });

    res.json({
      success: true,
      data: { targets: transformedTargets },
    });
  } catch (error) {
    console.error('Get sales targets error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching sales targets',
      error: error.message 
    });
  }
});

// Update Sales Target
router.put('/targets/:id', verifyToken, verifyDealer, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid target ID format' 
      });
    }

    const target = await SalesTarget.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ 
        success: false, 
        message: 'Target not found' 
      });
    }

    // Check access
    if (target.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const {
      targetAmount,
      targetStrips,
      isActive,
      notes,
    } = req.body;

    if (targetAmount !== undefined) target.targetAmount = parseFloat(targetAmount);
    if (targetStrips !== undefined) target.targetStrips = parseInt(targetStrips);
    if (isActive !== undefined) target.isActive = isActive;
    if (notes !== undefined) target.notes = notes;

    await target.save();
    await target.populate('salesman', 'name email');
    await target.populate('dealer', 'name email');

    const targetObj = target.toObject ? target.toObject() : target;
    const transformedTarget = {
      ...targetObj,
      id: targetObj._id || targetObj.id,
      salesman: targetObj.salesman ? {
        ...targetObj.salesman,
        id: targetObj.salesman._id || targetObj.salesman.id,
      } : targetObj.salesman,
      dealer: targetObj.dealer ? {
        ...targetObj.dealer,
        id: targetObj.dealer._id || targetObj.dealer.id,
      } : targetObj.dealer,
      achievementPercentage: target.achievementPercentage,
    };

    res.json({
      success: true,
      message: 'Sales target updated successfully',
      data: { target: transformedTarget },
    });
  } catch (error) {
    console.error('Update sales target error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating sales target',
      error: error.message 
    });
  }
});

// Helper function to update sales target
async function updateSalesTarget(salesmanId, dealerId, amount, strips) {
  try {
    const now = new Date();
    const activeTargets = await SalesTarget.find({
      dealer: dealerId,
      salesman: salesmanId,
      isActive: true,
      periodStart: { $lte: now },
      periodEnd: { $gte: now },
    });

    for (const target of activeTargets) {
      target.currentAmount += amount;
      target.currentStrips += strips;
      await target.save();
    }
  } catch (error) {
    console.error('Update sales target error:', error);
  }
}

// ==================== COMMISSION CALCULATION ====================

// Calculate Commission
router.post('/commissions/calculate', verifyToken, verifyDealer, async (req, res) => {
  try {
    const {
      salesmanId,
      period,
      periodStart,
      periodEnd,
      commissionRate,
    } = req.body;

    if (!salesmanId || !mongoose.Types.ObjectId.isValid(salesmanId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid salesman ID is required',
      });
    }

    if (!commissionRate || commissionRate < 0 || commissionRate > 100) {
      return res.status(400).json({
        success: false,
        message: 'Valid commission rate (0-100) is required',
      });
    }

    // Verify salesman
    const salesman = await User.findOne({
      _id: salesmanId,
      createdBy: req.user._id,
      role: 'salesman',
    });

    if (!salesman) {
      return res.status(404).json({
        success: false,
        message: 'Salesman not found or access denied',
      });
    }

    // Get date range
    let dateRange;
    if (periodStart && periodEnd) {
      dateRange = { startDate: new Date(periodStart), endDate: new Date(periodEnd) };
    } else if (period) {
      dateRange = getDateRange(period);
    } else {
      dateRange = getDateRange('monthly');
    }

    // Get sales for period
    const sales = await Sale.find({
      salesman: salesmanId,
      dealer: req.user._id,
      saleDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
      paymentStatus: 'completed',
    });

    const totalSalesAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const commissionAmount = (totalSalesAmount * commissionRate) / 100;

    // Check if commission already exists
    const existingCommission = await Commission.findOne({
      salesman: salesmanId,
      dealer: req.user._id,
      periodStart: dateRange.startDate,
      periodEnd: dateRange.endDate,
    });

    if (existingCommission) {
      return res.status(400).json({
        success: false,
        message: 'Commission for this period already exists',
        data: { commission: existingCommission },
      });
    }

    // Create commission record
    const commission = new Commission({
      salesman: salesmanId,
      dealer: req.user._id,
      period: period || 'monthly',
      periodStart: dateRange.startDate,
      periodEnd: dateRange.endDate,
      totalSalesAmount,
      commissionRate: parseFloat(commissionRate),
      commissionAmount,
      status: 'pending',
    });

    await commission.save();
    await commission.populate('salesman', 'name email');
    await commission.populate('dealer', 'name email');

    const commissionObj = commission.toObject ? commission.toObject() : commission;
    const transformedCommission = {
      ...commissionObj,
      id: commissionObj._id || commissionObj.id,
      salesman: commissionObj.salesman ? {
        ...commissionObj.salesman,
        id: commissionObj.salesman._id || commissionObj.salesman.id,
      } : commissionObj.salesman,
      dealer: commissionObj.dealer ? {
        ...commissionObj.dealer,
        id: commissionObj.dealer._id || commissionObj.dealer.id,
      } : commissionObj.dealer,
    };

    res.status(201).json({
      success: true,
      message: 'Commission calculated successfully',
      data: { commission: transformedCommission },
    });
  } catch (error) {
    console.error('Calculate commission error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while calculating commission',
      error: error.message 
    });
  }
});

// Get Commissions
router.get('/commissions', verifyToken, async (req, res) => {
  try {
    const { salesmanId, dealerId, period, status, startDate, endDate } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'salesman') {
      query.salesman = req.user._id;
    } else if (req.user.role === 'dealer' || req.user.role === 'dellear') {
      query.dealer = req.user._id;
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        const salesman = await User.findOne({
          _id: salesmanId,
          createdBy: req.user._id,
          role: 'salesman',
        });
        if (salesman) {
          query.salesman = salesmanId;
        }
      }
    } else if (req.user.role === 'admin') {
      if (dealerId && mongoose.Types.ObjectId.isValid(dealerId)) {
        query.dealer = dealerId;
      }
      if (salesmanId && mongoose.Types.ObjectId.isValid(salesmanId)) {
        query.salesman = salesmanId;
      }
    }

    if (period) {
      query.period = period;
    }
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.periodStart = {};
      if (startDate) {
        query.periodStart.$gte = new Date(startDate);
      }
      if (endDate) {
        query.periodEnd = { $lte: new Date(endDate) };
      }
    }

    const commissions = await Commission.find(query)
      .populate('salesman', 'name email')
      .populate('dealer', 'name email')
      .populate('paidBy', 'name email')
      .sort({ periodStart: -1 });

    const transformedCommissions = commissions.map(commission => {
      const commissionObj = commission.toObject ? commission.toObject() : commission;
      return {
        ...commissionObj,
        id: commissionObj._id || commissionObj.id,
        salesman: commissionObj.salesman ? {
          ...commissionObj.salesman,
          id: commissionObj.salesman._id || commissionObj.salesman.id,
        } : commissionObj.salesman,
        dealer: commissionObj.dealer ? {
          ...commissionObj.dealer,
          id: commissionObj.dealer._id || commissionObj.dealer.id,
        } : commissionObj.dealer,
        paidBy: commissionObj.paidBy ? {
          ...commissionObj.paidBy,
          id: commissionObj.paidBy._id || commissionObj.paidBy.id,
        } : commissionObj.paidBy,
      };
    });

    res.json({
      success: true,
      data: { commissions: transformedCommissions },
    });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching commissions',
      error: error.message 
    });
  }
});

// Update Commission Status
router.put('/commissions/:id/status', verifyToken, verifyDealer, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid commission ID format' 
      });
    }

    const { status } = req.body;

    if (!status || !['pending', 'approved', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required',
      });
    }

    const commission = await Commission.findById(req.params.id);

    if (!commission) {
      return res.status(404).json({ 
        success: false, 
        message: 'Commission not found' 
      });
    }

    // Check access
    if (commission.dealer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    commission.status = status;
    if (status === 'paid') {
      commission.paidAt = new Date();
      commission.paidBy = req.user._id;
    }

    await commission.save();
    await commission.populate('salesman', 'name email');
    await commission.populate('dealer', 'name email');
    await commission.populate('paidBy', 'name email');

    const commissionObj = commission.toObject ? commission.toObject() : commission;
    const transformedCommission = {
      ...commissionObj,
      id: commissionObj._id || commissionObj.id,
      salesman: commissionObj.salesman ? {
        ...commissionObj.salesman,
        id: commissionObj.salesman._id || commissionObj.salesman.id,
      } : commissionObj.salesman,
      dealer: commissionObj.dealer ? {
        ...commissionObj.dealer,
        id: commissionObj.dealer._id || commissionObj.dealer.id,
      } : commissionObj.dealer,
      paidBy: commissionObj.paidBy ? {
        ...commissionObj.paidBy,
        id: commissionObj.paidBy._id || commissionObj.paidBy.id,
      } : commissionObj.paidBy,
    };

    res.json({
      success: true,
      message: 'Commission status updated successfully',
      data: { commission: transformedCommission },
    });
  } catch (error) {
    console.error('Update commission status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating commission status',
      error: error.message 
    });
  }
});

// ==================== BILL APPROVAL (DEALER) ====================

// Get bills pending approval (Dealer only)
router.get('/bills/pending', verifyToken, verifyDealer, async (req, res) => {
  try {
    const bills = await Sale.aggregate([
      {
        $match: {
          dealer: new mongoose.Types.ObjectId(req.user._id),
          invoiceNo: { $exists: true, $ne: '' },
          billStatus: 'pending',
        },
      },
      {
        $group: {
          _id: '$invoiceNo',
          sales: { $push: '$$ROOT' },
          totalAmount: { $sum: '$totalAmount' },
          saleDate: { $first: '$saleDate' },
          customerName: { $first: '$customerName' },
          invoiceNo: { $first: '$invoiceNo' },
        },
      },
      {
        $sort: { saleDate: -1 },
      },
    ]);

    // Populate references
    const populatedBills = await Sale.populate(bills, [
      { path: 'sales.salesman', select: 'name email' },
      { path: 'sales.product', select: 'title packetPrice packetsPerStrip' },
      { path: 'sales.shopkeeper', select: 'name phone' },
    ]);

    // Format product titles
    const language = getLanguage(req);
    const formattedBills = populatedBills.map(bill => ({
      ...bill,
      sales: bill.sales.map(sale => ({
        ...sale,
        product: sale.product ? {
          ...sale.product,
          id: sale.product._id || sale.product.id,
          title: formatProductTitle(sale.product, language),
        } : sale.product,
      })),
    }));

    res.json({
      success: true,
      data: {
        bills: formattedBills,
      },
    });
  } catch (error) {
    console.error('Get pending bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending bills',
      error: error.message,
    });
  }
});

// Get bills approved (Dealer only)
router.get('/bills/approved', verifyToken, verifyDealer, async (req, res) => {
  try {
    const bills = await Sale.aggregate([
      {
        $match: {
          dealer: new mongoose.Types.ObjectId(req.user._id),
          invoiceNo: { $exists: true, $ne: '' },
          billStatus: 'approved',
        },
      },
      {
        $group: {
          _id: '$invoiceNo',
          sales: { $push: '$$ROOT' },
          totalAmount: { $sum: '$totalAmount' },
          saleDate: { $first: '$saleDate' },
          customerName: { $first: '$customerName' },
          invoiceNo: { $first: '$invoiceNo' },
        },
      },
      {
        $sort: { saleDate: -1 },
      },
    ]);

    // Populate references
    const populatedBills = await Sale.populate(bills, [
      { path: 'sales.salesman', select: 'name email' },
      { path: 'sales.product', select: 'title packetPrice packetsPerStrip' },
      { path: 'sales.shopkeeper', select: 'name phone' },
    ]);

    // Format product titles
    const language = getLanguage(req);
    const formattedBills = populatedBills.map(bill => ({
      ...bill,
      sales: bill.sales.map(sale => ({
        ...sale,
        product: sale.product ? {
          ...sale.product,
          id: sale.product._id || sale.product.id,
          title: formatProductTitle(sale.product, language),
        } : sale.product,
      })),
    }));

    res.json({
      success: true,
      data: {
        bills: formattedBills,
      },
    });
  } catch (error) {
    console.error('Get approved bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching approved bills',
      error: error.message,
    });
  }
});

// Approve bill (Dealer only)
router.put('/bills/:invoiceNo/approve', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { invoiceNo } = req.params;

    const sales = await Sale.find({
      invoiceNo,
      dealer: req.user._id,
      billStatus: 'pending',
    });

    if (sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found or already processed',
      });
    }

    // Update all sales in the bill
    await Sale.updateMany(
      { invoiceNo, dealer: req.user._id },
      {
        billStatus: 'approved',
        billApprovedBy: req.user._id,
        billApprovedAt: new Date(),
      }
    );

    res.json({
      success: true,
      message: 'Bill approved successfully',
      data: {
        invoiceNo,
        approvedCount: sales.length,
      },
    });
  } catch (error) {
    console.error('Approve bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving bill',
      error: error.message,
    });
  }
});

// Save bill name type choice (Salesman only)
router.put('/bills/:invoiceNo/save-pdf', verifyToken, async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const { nameType } = req.body;

    if (!nameType || (nameType !== 'company' && nameType !== 'personal')) {
      return res.status(400).json({
        success: false,
        message: 'Name type (company or personal) is required',
      });
    }

    // Verify that the salesman created this bill
    const sales = await Sale.find({
      invoiceNo,
      salesman: req.user._id,
    });

    if (sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found or you do not have permission',
      });
    }

    // Update all sales in the bill with name type choice
    await Sale.updateMany(
      { invoiceNo, salesman: req.user._id },
      {
        billNameType: nameType,
      }
    );

    res.json({
      success: true,
      message: 'Bill name type saved successfully',
      data: {
        invoiceNo,
        updatedCount: sales.length,
        nameType,
      },
    });
  } catch (error) {
    console.error('Save bill name type error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while saving bill name type',
      error: error.message,
    });
  }
});

// Reject bill (Dealer only)
router.put('/bills/:invoiceNo/reject', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const { reason } = req.body;

    const sales = await Sale.find({
      invoiceNo,
      dealer: req.user._id,
      billStatus: 'pending',
    });

    if (sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found or already processed',
      });
    }

    // Update all sales in the bill
    await Sale.updateMany(
      { invoiceNo, dealer: req.user._id },
      {
        billStatus: 'rejected',
        billApprovedBy: req.user._id,
        billApprovedAt: new Date(),
        billRejectionReason: reason || '',
      }
    );

    res.json({
      success: true,
      message: 'Bill rejected successfully',
      data: {
        invoiceNo,
        rejectedCount: sales.length,
      },
    });
  } catch (error) {
    console.error('Reject bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting bill',
      error: error.message,
    });
  }
});

module.exports = router;

