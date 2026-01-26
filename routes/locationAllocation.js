const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const LocationAllocation = require('../models/LocationAllocation');

const router = express.Router();

// Path to the JSON data file
const DATA_FILE = path.join(__dirname, '../data/gujarat-districts.json');

// Helper function to read and parse JSON file
const getLocationData = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading location data:', error);
    return null;
  }
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

// ========== ADMIN ROUTES - Allocate to Dealers ==========

// Admin: Allocate district/talukas to dealer
router.post('/admin/allocate-to-dealer', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId, districtCode, allocationScope, talukas } = req.body;

    // Validation
    if (!dealerId || !districtCode || !allocationScope) {
      return res.status(400).json({
        success: false,
        message: 'Please provide dealerId, districtCode, and allocationScope'
      });
    }

    if (!['full-district', 'specific-talukas'].includes(allocationScope)) {
      return res.status(400).json({
        success: false,
        message: 'allocationScope must be either "full-district" or "specific-talukas"'
      });
    }

    if (allocationScope === 'specific-talukas' && (!talukas || !Array.isArray(talukas) || talukas.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide talukas array when allocationScope is "specific-talukas"'
      });
    }

    // Verify dealer exists
    const dealer = await User.findById(dealerId);
    if (!dealer || (dealer.role !== 'dealer' && dealer.role !== 'dellear')) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Get district data
    const locationData = getLocationData();
    if (!locationData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const district = locationData.districts.find(d => d.districtCode === districtCode);
    if (!district) {
      return res.status(404).json({
        success: false,
        message: 'District not found'
      });
    }

    // Validate talukas if specific-talukas
    if (allocationScope === 'specific-talukas') {
      const invalidTalukas = talukas.filter(t => !district.talukas.includes(t));
      if (invalidTalukas.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid talukas: ${invalidTalukas.join(', ')}`
        });
      }
    }

    // Check if allocation already exists
    const existingAllocation = await LocationAllocation.findOne({
      allocatedTo: dealerId,
      districtCode,
      allocationScope,
      status: 'active'
    });

    if (existingAllocation) {
      // Update existing allocation
      existingAllocation.talukas = allocationScope === 'full-district' ? [] : talukas;
      await existingAllocation.save();

      return res.json({
        success: true,
        message: 'Location allocation updated successfully',
        data: { allocation: existingAllocation }
      });
    }

    // Create new allocation
    const allocation = new LocationAllocation({
      allocatedTo: dealerId,
      allocatedBy: req.user._id,
      allocationType: 'admin-to-dealer',
      districtCode,
      districtName: district.districtName,
      allocationScope,
      talukas: allocationScope === 'full-district' ? [] : talukas,
      status: 'active'
    });

    await allocation.save();

    res.status(201).json({
      success: true,
      message: 'Location allocated to dealer successfully',
      data: { allocation }
    });
  } catch (error) {
    console.error('Allocate to dealer error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This allocation already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error during allocation',
      error: error.message
    });
  }
});

// Admin: Get all allocations for a dealer
router.get('/admin/dealer/:dealerId/allocations', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId } = req.params;

    const allocations = await LocationAllocation.find({
      allocatedTo: dealerId,
      allocationType: 'admin-to-dealer',
      status: 'active'
    })
      .populate('allocatedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { allocations }
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

// Admin: Get all dealers with their allocations
router.get('/admin/dealers-allocations', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const dealers = await User.find({
      role: { $in: ['dealer', 'dellear'] }
    }).select('-password');

    const dealersWithAllocations = await Promise.all(
      dealers.map(async (dealer) => {
        const allocations = await LocationAllocation.find({
          allocatedTo: dealer._id,
          allocationType: 'admin-to-dealer',
          status: 'active'
        });

        return {
          id: dealer._id,
          name: dealer.name,
          email: dealer.email,
          role: dealer.role,
          allocations: allocations.map(a => ({
            id: a._id,
            districtCode: a.districtCode,
            districtName: a.districtName,
            allocationScope: a.allocationScope,
            talukas: a.talukas,
            createdAt: a.createdAt
          })),
          totalAllocations: allocations.length
        };
      })
    );

    res.json({
      success: true,
      data: { dealers: dealersWithAllocations }
    });
  } catch (error) {
    console.error('Get dealers allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dealers allocations',
      error: error.message
    });
  }
});

// Admin: Remove allocation from dealer
router.delete('/admin/allocation/:allocationId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { allocationId } = req.params;

    const allocation = await LocationAllocation.findById(allocationId);
    if (!allocation || allocation.allocationType !== 'admin-to-dealer') {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    // Also delete any dealer-to-salesman allocations for this district
    await LocationAllocation.deleteMany({
      allocatedBy: allocation.allocatedTo,
      districtCode: allocation.districtCode,
      allocationType: 'dealer-to-salesman'
    });

    await LocationAllocation.findByIdAndDelete(allocationId);

    res.json({
      success: true,
      message: 'Allocation removed successfully'
    });
  } catch (error) {
    console.error('Remove allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during allocation removal',
      error: error.message
    });
  }
});

// ========== DEALER ROUTES - Allocate to Salesmen ==========

// Dealer: Get my allocations (what admin allocated to me)
router.get('/dealer/my-allocations', verifyToken, verifyDealer, async (req, res) => {
  try {
    const allocations = await LocationAllocation.find({
      allocatedTo: req.user._id,
      allocationType: 'admin-to-dealer',
      status: 'active'
    }).sort({ createdAt: -1 });

    // Get full district data for each allocation
    const locationData = getLocationData();
    const allocationsWithData = allocations.map(allocation => {
      const district = locationData?.districts.find(d => d.districtCode === allocation.districtCode);
      return {
        id: allocation._id,
        districtCode: allocation.districtCode,
        districtName: allocation.districtName,
        allocationScope: allocation.allocationScope,
        talukas: allocation.allocationScope === 'full-district' 
          ? (district?.talukas || [])
          : allocation.talukas,
        allTalukas: district?.talukas || [],
        createdAt: allocation.createdAt
      };
    });

    res.json({
      success: true,
      data: { allocations: allocationsWithData }
    });
  } catch (error) {
    console.error('Get my allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching allocations',
      error: error.message
    });
  }
});

// Dealer: Allocate district/talukas to salesman
router.post('/dealer/allocate-to-salesman', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { salesmanId, districtCode, allocationScope, talukas } = req.body;

    // Validation
    if (!salesmanId || !districtCode || !allocationScope) {
      return res.status(400).json({
        success: false,
        message: 'Please provide salesmanId, districtCode, and allocationScope'
      });
    }

    if (!['full-district', 'specific-talukas'].includes(allocationScope)) {
      return res.status(400).json({
        success: false,
        message: 'allocationScope must be either "full-district" or "specific-talukas"'
      });
    }

    if (allocationScope === 'specific-talukas' && (!talukas || !Array.isArray(talukas) || talukas.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide talukas array when allocationScope is "specific-talukas"'
      });
    }

    // Verify salesman exists and was created by this dealer
    const salesman = await User.findOne({
      _id: salesmanId,
      role: 'salesman',
      createdBy: req.user._id
    });

    if (!salesman) {
      return res.status(404).json({
        success: false,
        message: 'Salesman not found or access denied'
      });
    }

    // Check if dealer has allocation for this district
    const dealerAllocation = await LocationAllocation.findOne({
      allocatedTo: req.user._id,
      districtCode,
      allocationType: 'admin-to-dealer',
      status: 'active'
    });

    if (!dealerAllocation) {
      return res.status(403).json({
        success: false,
        message: 'You do not have allocation for this district'
      });
    }

    // Get district data
    const locationData = getLocationData();
    if (!locationData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const district = locationData.districts.find(d => d.districtCode === districtCode);
    if (!district) {
      return res.status(404).json({
        success: false,
        message: 'District not found'
      });
    }

    // Validate talukas based on dealer's allocation
    let allowedTalukas = [];
    if (dealerAllocation.allocationScope === 'full-district') {
      allowedTalukas = district.talukas;
    } else {
      allowedTalukas = dealerAllocation.talukas;
    }

    if (allocationScope === 'specific-talukas') {
      const invalidTalukas = talukas.filter(t => !allowedTalukas.includes(t));
      if (invalidTalukas.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid talukas. You can only allocate: ${allowedTalukas.join(', ')}`
        });
      }
    }

    // Check if allocation already exists
    const existingAllocation = await LocationAllocation.findOne({
      allocatedTo: salesmanId,
      districtCode,
      allocationScope,
      allocationType: 'dealer-to-salesman',
      status: 'active'
    });

    if (existingAllocation) {
      // Update existing allocation
      existingAllocation.talukas = allocationScope === 'full-district' ? [] : talukas;
      await existingAllocation.save();

      return res.json({
        success: true,
        message: 'Location allocation updated successfully',
        data: { allocation: existingAllocation }
      });
    }

    // Create new allocation
    const allocation = new LocationAllocation({
      allocatedTo: salesmanId,
      allocatedBy: req.user._id,
      allocationType: 'dealer-to-salesman',
      districtCode,
      districtName: district.districtName,
      allocationScope,
      talukas: allocationScope === 'full-district' ? [] : talukas,
      status: 'active'
    });

    await allocation.save();

    res.status(201).json({
      success: true,
      message: 'Location allocated to salesman successfully',
      data: { allocation }
    });
  } catch (error) {
    console.error('Allocate to salesman error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This allocation already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error during allocation',
      error: error.message
    });
  }
});

// Dealer: Get all allocations for a salesman
router.get('/dealer/salesman/:salesmanId/allocations', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { salesmanId } = req.params;

    // Verify salesman was created by this dealer
    const salesman = await User.findOne({
      _id: salesmanId,
      role: 'salesman',
      createdBy: req.user._id
    });

    if (!salesman) {
      return res.status(404).json({
        success: false,
        message: 'Salesman not found or access denied'
      });
    }

    const allocations = await LocationAllocation.find({
      allocatedTo: salesmanId,
      allocationType: 'dealer-to-salesman',
      status: 'active'
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { allocations }
    });
  } catch (error) {
    console.error('Get salesman allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching allocations',
      error: error.message
    });
  }
});

// Dealer: Get all salesmen with their allocations
router.get('/dealer/salesmen-allocations', verifyToken, verifyDealer, async (req, res) => {
  try {
    const salesmen = await User.find({
      role: 'salesman',
      createdBy: req.user._id
    }).select('-password');

    const salesmenWithAllocations = await Promise.all(
      salesmen.map(async (salesman) => {
        const allocations = await LocationAllocation.find({
          allocatedTo: salesman._id,
          allocationType: 'dealer-to-salesman',
          status: 'active'
        });

        return {
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
          allocations: allocations.map(a => ({
            id: a._id,
            districtCode: a.districtCode,
            districtName: a.districtName,
            allocationScope: a.allocationScope,
            talukas: a.talukas,
            createdAt: a.createdAt
          })),
          totalAllocations: allocations.length
        };
      })
    );

    res.json({
      success: true,
      data: { salesmen: salesmenWithAllocations }
    });
  } catch (error) {
    console.error('Get salesmen allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching salesmen allocations',
      error: error.message
    });
  }
});

// Dealer: Remove allocation from salesman
router.delete('/dealer/allocation/:allocationId', verifyToken, verifyDealer, async (req, res) => {
  try {
    const { allocationId } = req.params;

    const allocation = await LocationAllocation.findById(allocationId);
    if (!allocation || allocation.allocationType !== 'dealer-to-salesman') {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    // Verify this allocation was made by this dealer
    if (allocation.allocatedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await LocationAllocation.findByIdAndDelete(allocationId);

    res.json({
      success: true,
      message: 'Allocation removed successfully'
    });
  } catch (error) {
    console.error('Remove allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during allocation removal',
      error: error.message
    });
  }
});

// ========== SALESMAN ROUTES - View my allocations ==========

// Salesman: Get my allocations
router.get('/salesman/my-allocations', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'salesman') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Salesman privileges required.'
      });
    }

    const allocations = await LocationAllocation.find({
      allocatedTo: req.user._id,
      allocationType: 'dealer-to-salesman',
      status: 'active'
    }).sort({ createdAt: -1 });

    // Get full district data for each allocation
    const locationData = getLocationData();
    const allocationsWithData = allocations.map(allocation => {
      const district = locationData?.districts.find(d => d.districtCode === allocation.districtCode);
      return {
        id: allocation._id,
        districtCode: allocation.districtCode,
        districtName: allocation.districtName,
        allocationScope: allocation.allocationScope,
        talukas: allocation.allocationScope === 'full-district' 
          ? (district?.talukas || [])
          : allocation.talukas,
        allTalukas: district?.talukas || [],
        createdAt: allocation.createdAt
      };
    });

    res.json({
      success: true,
      data: { allocations: allocationsWithData }
    });
  } catch (error) {
    console.error('Get my allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching allocations',
      error: error.message
    });
  }
});

module.exports = router;

