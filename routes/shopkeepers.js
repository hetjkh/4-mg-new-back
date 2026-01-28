const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const Shopkeeper = require('../models/Shopkeeper');

const router = express.Router();

// Middleware to verify token and get user
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
    );
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

const verifySalesman = (req, res, next) => {
  if (req.user.role !== 'salesman') {
    return res.status(403).json({
      success: false,
      message: 'Salesman access required',
    });
  }
  next();
};

// Create shopkeeper (salesman only)
router.post('/', verifyToken, verifySalesman, async (req, res) => {
  try {
    const { name, phone, email, location, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone are required',
      });
    }

    const dealer = await User.findById(req.user.createdBy);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dealer association',
      });
    }

    const shopkeeper = new Shopkeeper({
      salesman: req.user._id,
      dealer: dealer._id,
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').toLowerCase().trim(),
      location: location || {},
      notes: notes || '',
    });

    await shopkeeper.save();

    res.status(201).json({
      success: true,
      message: 'Shopkeeper created successfully',
      data: { shopkeeper: shopkeeper.toJSON() },
    });
  } catch (error) {
    // Handle duplicate key error for unique index
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A shopkeeper with this phone already exists',
      });
    }
    console.error('Create shopkeeper error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating shopkeeper',
      error: error.message,
    });
  }
});

// List shopkeepers (salesman only)
router.get('/', verifyToken, verifySalesman, async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const query = { salesman: req.user._id };

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'location.district': { $regex: search, $options: 'i' } },
        { 'location.taluka': { $regex: search, $options: 'i' } },
        { 'location.village': { $regex: search, $options: 'i' } },
      ];
    }

    const shopkeepers = await Shopkeeper.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        shopkeepers: shopkeepers.map((s) => (s.toJSON ? s.toJSON() : s)),
      },
    });
  } catch (error) {
    console.error('List shopkeepers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shopkeepers',
      error: error.message,
    });
  }
});

// Get single shopkeeper (salesman only)
router.get('/:id', verifyToken, verifySalesman, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shopkeeper ID format' });
    }

    const shopkeeper = await Shopkeeper.findOne({
      _id: req.params.id,
      salesman: req.user._id,
    });

    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: 'Shopkeeper not found' });
    }

    res.json({
      success: true,
      data: { shopkeeper: shopkeeper.toJSON() },
    });
  } catch (error) {
    console.error('Get shopkeeper error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shopkeeper',
      error: error.message,
    });
  }
});

// Update shopkeeper (salesman only)
router.put('/:id', verifyToken, verifySalesman, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shopkeeper ID format' });
    }

    const shopkeeper = await Shopkeeper.findOne({
      _id: req.params.id,
      salesman: req.user._id,
    });

    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: 'Shopkeeper not found' });
    }

    const { name, phone, email, location, notes, isActive } = req.body;

    if (name !== undefined) shopkeeper.name = name.trim();
    if (phone !== undefined) shopkeeper.phone = phone.trim();
    if (email !== undefined) shopkeeper.email = (email || '').toLowerCase().trim();
    if (location !== undefined) shopkeeper.location = location || {};
    if (notes !== undefined) shopkeeper.notes = notes || '';
    if (isActive !== undefined) shopkeeper.isActive = !!isActive;

    await shopkeeper.save();

    res.json({
      success: true,
      message: 'Shopkeeper updated successfully',
      data: { shopkeeper: shopkeeper.toJSON() },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A shopkeeper with this phone already exists',
      });
    }
    console.error('Update shopkeeper error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating shopkeeper',
      error: error.message,
    });
  }
});

// Delete shopkeeper (salesman only)
router.delete('/:id', verifyToken, verifySalesman, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shopkeeper ID format' });
    }

    const deleted = await Shopkeeper.findOneAndDelete({
      _id: req.params.id,
      salesman: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Shopkeeper not found' });
    }

    res.json({
      success: true,
      message: 'Shopkeeper deleted successfully',
    });
  } catch (error) {
    console.error('Delete shopkeeper error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting shopkeeper',
      error: error.message,
    });
  }
});

module.exports = router;


