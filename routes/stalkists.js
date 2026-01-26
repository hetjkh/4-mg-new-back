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

// Get All Stalkists (Admin only)
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stalkists = await User.find({ 
      role: 'stalkist'
    })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        stalkists: stalkists.map(stalkist => ({
          id: stalkist._id,
          name: stalkist.name,
          email: stalkist.email,
          role: stalkist.role,
          createdAt: stalkist.createdAt,
          updatedAt: stalkist.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get stalkists error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching stalkists',
      error: error.message 
    });
  }
});

// Get Stalkist with Dealers and Salesmen Statistics
router.get('/:id/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const stalkist = await User.findById(id).select('-password');
    if (!stalkist || stalkist.role !== 'stalkist') {
      return res.status(404).json({ 
        success: false, 
        message: 'Stalkist not found' 
      });
    }

    // Get all dealers created by this stalkist
    const dealers = await User.find({
      createdBy: stalkist._id,
      role: { $in: ['dealer', 'dellear'] }
    }).select('-password');

    // Get salesmen count for each dealer
    const dealersWithStats = await Promise.all(
      dealers.map(async (dealer) => {
        const salesmenCount = await User.countDocuments({
          createdBy: dealer._id,
          role: 'salesman'
        });
        return {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          createdAt: dealer.createdAt,
          salesmenCount,
        };
      })
    );

    res.json({
      success: true,
      data: {
        stalkist: {
          id: stalkist._id,
          name: stalkist.name,
          email: stalkist.email,
          role: stalkist.role,
          createdAt: stalkist.createdAt,
        },
        dealers: dealersWithStats,
        totalDealers: dealersWithStats.length,
        totalSalesmen: dealersWithStats.reduce((sum, d) => sum + d.salesmenCount, 0),
      },
    });
  } catch (error) {
    console.error('Get stalkist stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching stalkist statistics',
      error: error.message 
    });
  }
});

// Get Dealer with Salesmen
router.get('/dealer/:dealerId/salesmen', verifyToken, verifyAdmin, async (req, res) => {
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

