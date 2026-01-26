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

// Get All Dealers (Stalkist can only see dealers they created)
router.get('/', verifyToken, verifyStalkist, async (req, res) => {
  try {
    const dealers = await User.find({ 
      role: { $in: ['dealer', 'dellear'] },
      createdBy: req.user._id 
    })
      .select('-password')
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

// Get Single Dealer
router.get('/:id', verifyToken, verifyStalkist, async (req, res) => {
  try {
    const dealer = await User.findOne({
      _id: req.params.id,
      role: { $in: ['dealer', 'dellear'] },
      createdBy: req.user._id
    }).select('-password');

    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: {
        dealer: {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          createdAt: dealer.createdAt,
          updatedAt: dealer.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Get dealer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer',
      error: error.message 
    });
  }
});

// Update Dealer (Stalkist only - can only update their own dealers)
router.put('/:id', verifyToken, verifyStalkist, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const dealer = await User.findOne({
      _id: req.params.id,
      role: { $in: ['dealer', 'dellear'] },
      createdBy: req.user._id
    });

    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found or access denied' 
      });
    }

    // Update fields
    if (name !== undefined) dealer.name = name.trim();
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: dealer._id }
      });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is already taken by another user' 
        });
      }
      dealer.email = email.toLowerCase().trim();
    }
    if (password !== undefined) {
      if (password.length < 6) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password must be at least 6 characters' 
        });
      }
      dealer.password = password;
    }

    await dealer.save();

    res.json({
      success: true,
      message: 'Dealer updated successfully',
      data: {
        dealer: {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          createdAt: dealer.createdAt,
          updatedAt: dealer.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update dealer error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during dealer update',
      error: error.message 
    });
  }
});

// Delete Dealer (Stalkist only - can only delete their own dealers)
router.delete('/:id', verifyToken, verifyStalkist, async (req, res) => {
  try {
    const dealer = await User.findOne({
      _id: req.params.id,
      role: { $in: ['dealer', 'dellear'] },
      createdBy: req.user._id
    });

    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found or access denied' 
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Dealer deleted successfully',
    });
  } catch (error) {
    console.error('Delete dealer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during dealer deletion',
      error: error.message 
    });
  }
});

module.exports = router;

