const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const User = require('../models/User');
const Product = require('../models/Product');

const router = express.Router();

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

// Middleware to verify salesman
const verifySalesman = (req, res, next) => {
  if (req.user.role !== 'salesman') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Salesman privileges required.' 
    });
  }
  next();
};

// Get Dealer Stock (Dealer only - view their available stock)
router.get('/dealer/stock', verifyToken, verifyDealer, async (req, res) => {
  try {
    const dealerStocks = await DealerStock.find({ dealer: req.user._id })
      .populate('product', 'title packetPrice packetsPerStrip image')
      .populate('sourceRequest', 'strips requestedAt')
      .sort({ createdAt: -1 });

    // Group by product
    const stockByProduct = {};
    dealerStocks.forEach(stock => {
      const productId = stock.product._id.toString();
      if (!stockByProduct[productId]) {
        stockByProduct[productId] = {
          product: {
            id: stock.product._id,
            title: stock.product.title,
            packetPrice: stock.product.packetPrice,
            packetsPerStrip: stock.product.packetsPerStrip,
            image: stock.product.image,
          },
          totalStrips: 0,
          allocatedStrips: 0,
          availableStrips: 0,
          sources: [],
        };
      }
      stockByProduct[productId].totalStrips += stock.totalStrips;
      stockByProduct[productId].allocatedStrips += stock.allocatedStrips;
      stockByProduct[productId].availableStrips += stock.availableStrips;
      stockByProduct[productId].sources.push({
        id: stock._id,
        strips: stock.totalStrips,
        allocated: stock.allocatedStrips,
        available: stock.availableStrips,
        sourceRequest: stock.sourceRequest,
        createdAt: stock.createdAt,
      });
    });

    const stockList = Object.values(stockByProduct);

    res.json({
      success: true,
      data: { stocks: stockList },
    });
  } catch (error) {
    console.error('Get dealer stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer stock',
      error: error.message 
    });
  }
});

// Get Salesmen for Allocation (Dealer only - get their salesmen)
router.get('/dealer/salesmen', verifyToken, verifyDealer, async (req, res) => {
  try {
    const salesmen = await User.find({
      createdBy: req.user._id,
      role: 'salesman',
    }).select('-password').sort({ name: 1 });

    const salesmenList = salesmen.map(salesman => ({
      id: salesman._id,
      name: salesman.name,
      email: salesman.email,
      createdAt: salesman.createdAt,
    }));

    res.json({
      success: true,
      data: { salesmen: salesmenList },
    });
  } catch (error) {
    console.error('Get salesmen error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching salesmen',
      error: error.message 
    });
  }
});

// Allocate Stock to Salesman (Dealer only)
router.post('/allocate', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { salesmanId, productId, strips, notes } = req.body;

    if (!salesmanId || !productId || !strips) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide salesmanId, productId, and strips' 
      });
    }

    if (typeof strips !== 'number' || strips < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strips must be a positive number' 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(salesmanId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid salesman or product ID' 
      });
    }

    // Verify salesman belongs to this dealer
    const salesman = await User.findOne({
      _id: salesmanId,
      createdBy: req.user._id,
      role: 'salesman',
    });

    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found or access denied' 
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Find available dealer stock for this product
    const dealerStocks = await DealerStock.find({
      dealer: req.user._id,
      product: productId,
    }).sort({ createdAt: 1 }); // Allocate from oldest stock first

    let remainingToAllocate = strips;
    const allocations = [];
    const updatedStocks = [];

    for (const stock of dealerStocks) {
      if (remainingToAllocate <= 0) break;

      const available = stock.availableStrips;
      if (available > 0) {
        const toAllocate = Math.min(available, remainingToAllocate);
        
        // Create allocation
        const allocation = new StockAllocation({
          dealer: req.user._id,
          salesman: salesmanId,
          product: productId,
          strips: toAllocate,
          dealerStock: stock._id,
          notes: notes || '',
        });
        await allocation.save();
        allocations.push(allocation);

        // Update dealer stock
        stock.allocatedStrips += toAllocate;
        stock.availableStrips = stock.totalStrips - stock.allocatedStrips;
        await stock.save();
        updatedStocks.push(stock);

        remainingToAllocate -= toAllocate;
      }
    }

    if (remainingToAllocate > 0) {
      // Rollback allocations if insufficient stock
      await StockAllocation.deleteMany({ _id: { $in: allocations.map(a => a._id) } });
      for (const stock of updatedStocks) {
        stock.allocatedStrips -= (strips - remainingToAllocate);
        stock.availableStrips = stock.totalStrips - stock.allocatedStrips;
        await stock.save();
      }
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock. Available: ${strips - remainingToAllocate} strips, Requested: ${strips} strips` 
      });
    }

    // Populate allocation data
    await allocations[0].populate('product', 'title packetPrice packetsPerStrip image');
    await allocations[0].populate('salesman', 'name email');

    res.status(201).json({
      success: true,
      message: `Successfully allocated ${strips} strips to ${salesman.name}`,
      data: { 
        allocation: allocations[0],
        totalAllocated: strips,
      },
    });
  } catch (error) {
    console.error('Allocate stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during stock allocation',
      error: error.message 
    });
  }
});

// Get Allocations for Dealer (Dealer only - view all their allocations)
router.get('/dealer/allocations', verifyToken, verifyDealer, async (req, res) => {
  try {
    const allocations = await StockAllocation.find({ dealer: req.user._id })
      .populate('product', 'title packetPrice packetsPerStrip image')
      .populate('salesman', 'name email')
      .populate('dealerStock', 'totalStrips allocatedStrips availableStrips')
      .sort({ createdAt: -1 });

    // Group by salesman
    const allocationsBySalesman = {};
    allocations.forEach(allocation => {
      const salesmanId = allocation.salesman._id.toString();
      if (!allocationsBySalesman[salesmanId]) {
        allocationsBySalesman[salesmanId] = {
          salesman: {
            id: allocation.salesman._id,
            name: allocation.salesman.name,
            email: allocation.salesman.email,
          },
          allocations: [],
          totalStrips: 0,
        };
      }
      allocationsBySalesman[salesmanId].allocations.push({
        id: allocation._id,
        product: {
          id: allocation.product._id,
          title: allocation.product.title,
          packetPrice: allocation.product.packetPrice,
          packetsPerStrip: allocation.product.packetsPerStrip,
          image: allocation.product.image,
        },
        strips: allocation.strips,
        notes: allocation.notes,
        createdAt: allocation.createdAt,
      });
      allocationsBySalesman[salesmanId].totalStrips += allocation.strips;
    });

    res.json({
      success: true,
      data: { 
        allocations: Object.values(allocationsBySalesman),
        totalAllocations: allocations.length,
      },
    });
  } catch (error) {
    console.error('Get dealer allocations error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching allocations',
      error: error.message 
    });
  }
});

// Get Allocated Stock for Salesman (Salesman only - view their allocated stock)
router.get('/salesman/stock', verifyToken, verifySalesman, async (req, res) => {
  try {
    const allocations = await StockAllocation.find({ salesman: req.user._id })
      .populate('product', 'title packetPrice packetsPerStrip image')
      .populate('dealer', 'name email')
      .sort({ createdAt: -1 });

    // Group by product
    const stockByProduct = {};
    allocations.forEach(allocation => {
      const productId = allocation.product._id.toString();
      if (!stockByProduct[productId]) {
        stockByProduct[productId] = {
          product: {
            id: allocation.product._id,
            title: allocation.product.title,
            packetPrice: allocation.product.packetPrice,
            packetsPerStrip: allocation.product.packetsPerStrip,
            image: allocation.product.image,
          },
          totalStrips: 0,
          allocations: [],
        };
      }
      stockByProduct[productId].totalStrips += allocation.strips;
      stockByProduct[productId].allocations.push({
        id: allocation._id,
        strips: allocation.strips,
        dealer: {
          id: allocation.dealer._id,
          name: allocation.dealer.name,
          email: allocation.dealer.email,
        },
        notes: allocation.notes,
        allocatedAt: allocation.createdAt,
      });
    });

    const stockList = Object.values(stockByProduct);

    res.json({
      success: true,
      data: { stocks: stockList },
    });
  } catch (error) {
    console.error('Get salesman stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching salesman stock',
      error: error.message 
    });
  }
});

module.exports = router;

