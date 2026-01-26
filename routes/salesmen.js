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

// Get All Salesmen (Dealer can only see salesmen they created)
router.get('/', verifyToken, verifyDealer, async (req, res) => {
  try {
    const salesmen = await User.find({ 
      role: 'salesman',
      createdBy: req.user._id 
    })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        salesmen: salesmen.map(salesman => ({
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          role: salesman.role,
          createdAt: salesman.createdAt,
          updatedAt: salesman.updatedAt,
        })),
      },
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

// Get Single Salesman
router.get('/:id', verifyToken, verifyDealer, async (req, res) => {
  try {
    const salesman = await User.findOne({
      _id: req.params.id,
      role: 'salesman',
      createdBy: req.user._id
    }).select('-password');

    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: {
        salesman: {
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          role: salesman.role,
          createdAt: salesman.createdAt,
          updatedAt: salesman.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Get salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching salesman',
      error: error.message 
    });
  }
});

// Create Salesman (Dealer only)
router.post('/', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide name, email, and password' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
    }

    // Create new salesman
    const salesman = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'salesman',
      createdBy: req.user._id,
    });

    await salesman.save();

    res.status(201).json({
      success: true,
      message: 'Salesman created successfully',
      data: {
        salesman: {
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          role: salesman.role,
          createdAt: salesman.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Create salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during salesman creation',
      error: error.message 
    });
  }
});

// Update Salesman (Dealer only - can only update their own salesmen)
router.put('/:id', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const salesman = await User.findOne({
      _id: req.params.id,
      role: 'salesman',
      createdBy: req.user._id
    });

    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found or access denied' 
      });
    }

    // Update fields
    if (name !== undefined) salesman.name = name.trim();
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: salesman._id }
      });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is already taken by another user' 
        });
      }
      salesman.email = email.toLowerCase().trim();
    }
    if (password !== undefined) {
      if (password.length < 6) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password must be at least 6 characters' 
        });
      }
      salesman.password = password;
    }

    await salesman.save();

    res.json({
      success: true,
      message: 'Salesman updated successfully',
      data: {
        salesman: {
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          role: salesman.role,
          createdAt: salesman.createdAt,
          updatedAt: salesman.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during salesman update',
      error: error.message 
    });
  }
});

// Delete Salesman (Dealer only - can only delete their own salesmen)
router.delete('/:id', verifyToken, verifyDealer, async (req, res) => {
  try {
    const salesman = await User.findOne({
      _id: req.params.id,
      role: 'salesman',
      createdBy: req.user._id
    });

    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found or access denied' 
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Salesman deleted successfully',
    });
  } catch (error) {
    console.error('Delete salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during salesman deletion',
      error: error.message 
    });
  }
});

module.exports = router;

