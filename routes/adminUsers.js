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

// Delete Stalkist (with option to cascade delete dealers and salesmen)
router.delete('/stalkist/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { cascadeDelete } = req.query; // 'true' or 'false'

    const stalkist = await User.findById(id);
    if (!stalkist || stalkist.role !== 'stalkist') {
      return res.status(404).json({ 
        success: false, 
        message: 'Stalkist not found' 
      });
    }

    let deletedCount = 0;
    let deletedDealers = [];
    let deletedSalesmen = [];

    // If cascade delete is enabled
    if (cascadeDelete === 'true') {
      // Get all dealers created by this stalkist
      const dealers = await User.find({
        createdBy: stalkist._id,
        role: { $in: ['dealer', 'dellear'] }
      });

      // For each dealer, delete their salesmen if cascade delete
      for (const dealer of dealers) {
        const salesmen = await User.find({
          createdBy: dealer._id,
          role: 'salesman'
        });
        
        // Delete salesmen
        for (const salesman of salesmen) {
          await User.findByIdAndDelete(salesman._id);
          deletedSalesmen.push(salesman._id.toString());
          deletedCount++;
        }

        // Delete dealer
        await User.findByIdAndDelete(dealer._id);
        deletedDealers.push(dealer._id.toString());
        deletedCount++;
      }
    }

    // Delete the stalkist
    await User.findByIdAndDelete(id);
    deletedCount++;

    res.json({
      success: true,
      message: `Stalkist deleted successfully${cascadeDelete === 'true' ? ` along with ${deletedDealers.length} dealers and ${deletedSalesmen.length} salesmen` : ''}`,
      data: {
        deletedCount,
        deletedDealers: deletedDealers.length,
        deletedSalesmen: deletedSalesmen.length,
      },
    });
  } catch (error) {
    console.error('Delete stalkist error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during stalkist deletion',
      error: error.message 
    });
  }
});

// Delete Dealer (with option to cascade delete salesmen)
router.delete('/dealer/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { cascadeDelete } = req.query; // 'true' or 'false'

    const dealer = await User.findById(id);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found' 
      });
    }

    let deletedCount = 0;
    let deletedSalesmen = [];

    // If cascade delete is enabled
    if (cascadeDelete === 'true') {
      // Get all salesmen created by this dealer
      const salesmen = await User.find({
        createdBy: dealer._id,
        role: 'salesman'
      });

      // Delete all salesmen
      for (const salesman of salesmen) {
        await User.findByIdAndDelete(salesman._id);
        deletedSalesmen.push(salesman._id.toString());
        deletedCount++;
      }
    }

    // Delete the dealer
    await User.findByIdAndDelete(id);
    deletedCount++;

    res.json({
      success: true,
      message: `Dealer deleted successfully${cascadeDelete === 'true' ? ` along with ${deletedSalesmen.length} salesmen` : ''}`,
      data: {
        deletedCount,
        deletedSalesmen: deletedSalesmen.length,
      },
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

// Delete Salesman
router.delete('/salesman/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const salesman = await User.findById(id);
    if (!salesman || salesman.role !== 'salesman') {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found' 
      });
    }

    await User.findByIdAndDelete(id);

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

