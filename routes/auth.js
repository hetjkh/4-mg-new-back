const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production', {
    expiresIn: '7d',
  });
};

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

// Middleware to verify admin token
const verifyAdmin = async (req, res, next) => {
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

    if (user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin privileges required.' 
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

// Helper function to check if user can register a specific role
const canRegisterRole = (userRole, targetRole) => {
  // Admin can register any role
  if (userRole === 'admin') {
    return true;
  }
  // Stalkist can only register Dellear
  if (userRole === 'stalkist' && targetRole === 'dellear') {
    return true;
  }
  // Dellear can only register Salesman
  if (userRole === 'dellear' && targetRole === 'salesman') {
    return true;
  }
  return false;
};

// Role-based Register new user (Admin, Stalkist, or Dellear can register based on their role)
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const currentUser = req.user;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide all fields (name, email, password, role)' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Validate role
    const validRoles = ['admin', 'stalkist', 'dellear', 'salesman'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Must be one of: admin, stalkist, dellear, salesman' 
      });
    }

    // Check if current user can register this role
    if (!canRegisterRole(currentUser.role, role)) {
      let errorMessage = 'You do not have permission to register this role.';
      if (currentUser.role === 'stalkist') {
        errorMessage = 'Stalkist can only register Dellear users.';
      } else if (currentUser.role === 'dellear') {
        errorMessage = 'Dellear can only register Salesman users.';
      } else if (currentUser.role === 'salesman') {
        errorMessage = 'Salesman cannot register users.';
      }
      return res.status(403).json({ 
        success: false, 
        message: errorMessage 
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

    // Create new user
    const userData = { name, email, password, role };
    
    // Set createdBy based on who is creating and what role
    if (currentUser.role === 'admin') {
      // Admin can create any role, set createdBy to admin
      if (role === 'stalkist' || role === 'dealer' || role === 'dellear' || role === 'salesman') {
        userData.createdBy = currentUser._id;
      }
    } else if (currentUser.role === 'dellear' && role === 'salesman') {
      // Dealer creating salesman
      userData.createdBy = currentUser._id;
    } else if (currentUser.role === 'stalkist' && role === 'dellear') {
      // Stalkist creating dellear
      userData.createdBy = currentUser._id;
    }
    
    const user = new User(userData);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // Check if it's a MongoDB connection error
    if (error.message?.includes('MongoServerError') || error.message?.includes('connection')) {
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Please check MongoDB connection.',
        error: error.message 
      });
    }
    
    // Check if it's a duplicate key error
    if (error.code === 11000 || error.message?.includes('duplicate')) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists',
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during registration',
      error: error.message 
    });
  }
});

// Generate admin password
router.get('/admin/password', (req, res) => {
  // Generate a random admin password
  const adminPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#';
  res.json({
    success: true,
    message: 'Admin password generated',
    data: {
      password: adminPassword,
      note: 'Save this password securely. It will not be shown again.',
    },
  });
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validation
    if (!email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email, password, and role' 
      });
    }

    // Validate role
    const validRoles = ['admin', 'stalkist', 'dellear', 'salesman'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role selected' 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Check if user role matches
    if (user.role !== role) {
      return res.status(401).json({ 
        success: false, 
        message: 'Role does not match your account' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      error: error.message 
    });
  }
});

// Get allowed roles for current user
router.get('/allowed-roles', verifyToken, (req, res) => {
  try {
    const userRole = req.user.role;
    let allowedRoles = [];

    if (userRole === 'admin') {
      allowedRoles = ['admin', 'stalkist', 'dellear', 'salesman'];
    } else if (userRole === 'stalkist') {
      allowedRoles = ['dellear'];
    } else if (userRole === 'dellear') {
      allowedRoles = ['salesman'];
    }

    res.json({
      success: true,
      data: {
        allowedRoles,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching allowed roles',
      error: error.message 
    });
  }
});

// Get user counts by role (Admin only)
router.get('/user-counts', verifyToken, async (req, res) => {
  try {
    // Only admin can access this
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin privileges required.' 
      });
    }

    const stalkistCount = await User.countDocuments({ role: 'stalkist' });
    const dellearCount = await User.countDocuments({ role: 'dellear' });
    const salesmanCount = await User.countDocuments({ role: 'salesman' });
    const adminCount = await User.countDocuments({ role: 'admin' });

    res.json({
      success: true,
      data: {
        stalkist: stalkistCount,
        dellear: dellearCount,
        salesman: salesmanCount,
        admin: adminCount,
        total: stalkistCount + dellearCount + salesmanCount + adminCount,
      },
    });
  } catch (error) {
    console.error('Get user counts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user counts',
      error: error.message 
    });
  }
});

// Verify Token Route (optional - for protected routes)
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
});

module.exports = router;

