const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

// Get All Dealers (Admin - all dealers including admin-created ones)
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const dealers = await User.find({ 
      role: { $in: ['dealer', 'dellear'] }
    })
      .select('-password')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        dealers: dealers.map(dealer => ({
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          createdAt: dealer.createdAt,
          updatedAt: dealer.updatedAt,
          createdBy: dealer.createdBy ? {
            id: dealer.createdBy._id,
            name: dealer.createdBy.name,
            email: dealer.createdBy.email,
            role: dealer.createdBy.role,
          } : null,
        })),
      },
    });
  } catch (error) {
    console.error('Get dealers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealers',
      error: error.message 
    });
  }
});

// Get Dealer with Salesmen (Admin - can view any dealer)
router.get('/:dealerId/salesmen', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealer = await User.findById(dealerId).select('-password');
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found' 
      });
    }

    // Get all salesmen created by this dealer
    const salesmen = await User.find({
      createdBy: dealer._id,
      role: 'salesman'
    }).select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        dealer: {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          createdAt: dealer.createdAt,
        },
        salesmen: salesmen.map(salesman => ({
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          role: salesman.role,
          createdAt: salesman.createdAt,
        })),
        totalSalesmen: salesmen.length,
      },
    });
  } catch (error) {
    console.error('Get dealer salesmen error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer salesmen',
      error: error.message 
    });
  }
});

module.exports = router;

