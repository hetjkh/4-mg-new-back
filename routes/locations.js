const express = require('express');
const fs = require('fs');
const path = require('path');

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

// Get all districts with talukas
router.get('/districts', (req, res) => {
  try {
    const data = getLocationData();
    
    if (!data) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    res.json({
      success: true,
      data: {
        state: data.state,
        districts: data.districts
      }
    });
  } catch (error) {
    console.error('Get districts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching districts',
      error: error.message
    });
  }
});

// Get all districts (names only)
router.get('/districts/list', (req, res) => {
  try {
    const data = getLocationData();
    
    if (!data) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const districtsList = data.districts.map(district => ({
      code: district.districtCode,
      name: district.districtName
    }));

    res.json({
      success: true,
      data: {
        districts: districtsList
      }
    });
  } catch (error) {
    console.error('Get districts list error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching districts list',
      error: error.message
    });
  }
});

// Get talukas for a specific district
router.get('/districts/:districtCode/talukas', (req, res) => {
  try {
    const { districtCode } = req.params;
    const data = getLocationData();
    
    if (!data) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const district = data.districts.find(
      d => d.districtCode === districtCode || d.districtName.toLowerCase() === districtCode.toLowerCase()
    );

    if (!district) {
      return res.status(404).json({
        success: false,
        message: 'District not found'
      });
    }

    res.json({
      success: true,
      data: {
        districtCode: district.districtCode,
        districtName: district.districtName,
        talukas: district.talukas
      }
    });
  } catch (error) {
    console.error('Get talukas error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching talukas',
      error: error.message
    });
  }
});

// Get a specific district with talukas
router.get('/districts/:districtCode', (req, res) => {
  try {
    const { districtCode } = req.params;
    const data = getLocationData();
    
    if (!data) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const district = data.districts.find(
      d => d.districtCode === districtCode || d.districtName.toLowerCase() === districtCode.toLowerCase()
    );

    if (!district) {
      return res.status(404).json({
        success: false,
        message: 'District not found'
      });
    }

    res.json({
      success: true,
      data: {
        district
      }
    });
  } catch (error) {
    console.error('Get district error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching district',
      error: error.message
    });
  }
});

// Search districts or talukas
router.get('/search', (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const data = getLocationData();
    
    if (!data) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load location data'
      });
    }

    const searchTerm = query.toLowerCase().trim();
    const results = {
      districts: [],
      talukas: []
    };

    data.districts.forEach(district => {
      // Search in district names
      if (district.districtName.toLowerCase().includes(searchTerm)) {
        results.districts.push({
          code: district.districtCode,
          name: district.districtName,
          talukas: district.talukas
        });
      }

      // Search in talukas
      district.talukas.forEach(taluka => {
        if (taluka.toLowerCase().includes(searchTerm)) {
          results.talukas.push({
            taluka,
            districtCode: district.districtCode,
            districtName: district.districtName
          });
        }
      });
    });

    res.json({
      success: true,
      data: {
        query: searchTerm,
        results
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching',
      error: error.message
    });
  }
});

module.exports = router;

