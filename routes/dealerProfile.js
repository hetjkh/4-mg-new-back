const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DealerProfile = require('../models/DealerProfile');

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

// Get dealer profile (Dealer only - their own profile)
router.get('/my-profile', verifyToken, verifyDealer, async (req, res) => {
  try {
    let profile = await DealerProfile.findOne({ dealer: req.user._id })
      .populate('dealer', 'name email');

    // If profile doesn't exist, create a basic one
    if (!profile) {
      profile = new DealerProfile({
        dealer: req.user._id,
        name: req.user.name,
        personalEmail: req.user.email,
      });
      await profile.save();
      await profile.populate('dealer', 'name email');
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Get dealer profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch profile',
      error: error.message,
    });
  }
});

// Update dealer profile (Dealer only)
router.put('/my-profile', verifyToken, verifyDealer, async (req, res) => {
  try {
    const updateData = req.body;

    // Find or create profile
    let profile = await DealerProfile.findOne({ dealer: req.user._id });

    if (!profile) {
      profile = new DealerProfile({
        dealer: req.user._id,
        name: req.user.name,
        personalEmail: req.user.email,
      });
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        profile[key] = updateData[key];
      }
    });

    await profile.save();
    await profile.populate('dealer', 'name email');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile,
    });
  } catch (error) {
    console.error('Update dealer profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile',
      error: error.message,
    });
  }
});

// Get dealer profile by ID (Admin and Salesman - view any dealer's profile)
router.get('/:dealerId', verifyToken, async (req, res) => {
  try {
    // Check if user is admin or salesman
    if (req.user.role !== 'admin' && req.user.role !== 'salesman') {
      return res.status(403).json({
        success: false,
        message: 'Only admins and salesmen can view dealer profiles',
      });
    }

    const { dealerId } = req.params;

    const profile = await DealerProfile.findOne({ dealer: dealerId })
      .populate('dealer', 'name email');

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Get dealer profile by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch profile',
      error: error.message,
    });
  }
});

module.exports = router;

