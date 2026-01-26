const express = require('express');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const User = require('../models/User');
const { translateMessage, getLanguage } = require('../middleware/translateMessages');

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

// Helper function to format product for response
const formatProduct = (product, language = 'en') => {
  // Handle both old format (string) and new format (object)
  const title = typeof product.title === 'string' 
    ? product.title 
    : (product.title[language] || product.title.en || product.title.gu || '');
  
  const description = typeof product.description === 'string'
    ? product.description
    : (product.description[language] || product.description.en || product.description.gu || '');

  return {
    id: product._id,
    title,
    description,
    packetPrice: product.packetPrice,
    packetsPerStrip: product.packetsPerStrip,
    image: product.image,
    stock: product.stock,
    createdBy: product.createdBy,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

// Create Product (Admin only)
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { title, description, packetPrice, packetsPerStrip, image, stock, titleGu, descriptionGu } = req.body;
    const language = getLanguage(req);

    // Validation - title can be string (English) or object
    const titleEn = typeof title === 'string' ? title.trim() : (title?.en || title);
    if (!titleEn || packetPrice === undefined || packetsPerStrip === undefined || !image || stock === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: translateMessage(req, 'product.titleRequired', 'Please provide title, packetPrice, packetsPerStrip, image, and stock')
      });
    }

    if (typeof packetPrice !== 'number' || packetPrice < 0) {
      return res.status(400).json({ 
        success: false, 
        message: translateMessage(req, 'product.priceInvalid', 'Packet price must be a positive number')
      });
    }

    if (typeof packetsPerStrip !== 'number' || packetsPerStrip < 1) {
      return res.status(400).json({ 
        success: false, 
        message: translateMessage(req, 'product.packetsInvalid', 'Packets per strip must be at least 1')
      });
    }

    if (typeof stock !== 'number' || stock < 0) {
      return res.status(400).json({ 
        success: false, 
        message: translateMessage(req, 'product.stockInvalid', 'Stock must be a positive number (in strips)')
      });
    }

    // Create product with multilingual schema
    const product = new Product({
      title: {
        en: titleEn,
        gu: titleGu?.trim() || (typeof description === 'object' && description.gu ? description.gu : ''),
      },
      description: {
        en: (typeof description === 'string' ? description?.trim() : description?.en) || '',
        gu: descriptionGu?.trim() || (typeof description === 'object' && description.gu ? description.gu : ''),
      },
      packetPrice,
      packetsPerStrip,
      image: image.trim(),
      stock,
      createdBy: req.user._id,
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: translateMessage(req, 'product.created', 'Product created successfully'),
      data: {
        product: formatProduct(product, language),
      },
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ 
      success: false, 
      message: translateMessage(req, 'product.createError', error.message || 'Server error during product creation'),
      error: error.message 
    });
  }
});

// Get All Products
router.get('/', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    const products = await Product.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        products: products.map(product => formatProduct(product, language)),
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ 
      success: false, 
      message: translateMessage(req, 'product.fetchError', 'Server error while fetching products'),
      error: error.message 
    });
  }
});

// Get Single Product
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const language = getLanguage(req);
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: translateMessage(req, 'product.notFound', 'Product not found')
      });
    }

    res.json({
      success: true,
      data: {
        product: formatProduct(product, language),
      },
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ 
      success: false, 
      message: translateMessage(req, 'product.fetchSingleError', 'Server error while fetching product'),
      error: error.message 
    });
  }
});

// Update Product (Admin only)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { title, description, packetPrice, packetsPerStrip, image, stock, titleGu, descriptionGu } = req.body;
    const language = getLanguage(req);

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: translateMessage(req, 'product.notFound', 'Product not found')
      });
    }

    // Update fields - handle multilingual schema
    if (title !== undefined) {
      if (typeof title === 'string') {
        // Single string - update English only
        if (!product.title || typeof product.title === 'string') {
          product.title = { en: title.trim(), gu: product.title?.gu || '' };
        } else {
          product.title.en = title.trim();
        }
      } else if (typeof title === 'object') {
        // Object format
        product.title = {
          en: title.en?.trim() || product.title?.en || '',
          gu: title.gu?.trim() || product.title?.gu || '',
        };
      }
    }
    if (titleGu !== undefined && typeof product.title === 'object') {
      product.title.gu = titleGu.trim();
    }

    if (description !== undefined) {
      if (typeof description === 'string') {
        // Single string - update English only
        if (!product.description || typeof product.description === 'string') {
          product.description = { en: description.trim(), gu: product.description?.gu || '' };
        } else {
          product.description.en = description.trim();
        }
      } else if (typeof description === 'object') {
        // Object format
        product.description = {
          en: description.en?.trim() || product.description?.en || '',
          gu: description.gu?.trim() || product.description?.gu || '',
        };
      }
    }
    if (descriptionGu !== undefined && typeof product.description === 'object') {
      product.description.gu = descriptionGu.trim();
    }

    if (packetPrice !== undefined) {
      if (typeof packetPrice !== 'number' || packetPrice < 0) {
        return res.status(400).json({ 
          success: false, 
          message: translateMessage(req, 'product.priceInvalid', 'Packet price must be a positive number')
        });
      }
      product.packetPrice = packetPrice;
    }
    if (packetsPerStrip !== undefined) {
      if (typeof packetsPerStrip !== 'number' || packetsPerStrip < 1) {
        return res.status(400).json({ 
          success: false, 
          message: translateMessage(req, 'product.packetsInvalid', 'Packets per strip must be at least 1')
        });
      }
      product.packetsPerStrip = packetsPerStrip;
    }
    if (image !== undefined) product.image = image.trim();
    if (stock !== undefined) {
      if (typeof stock !== 'number' || stock < 0) {
        return res.status(400).json({ 
          success: false, 
          message: translateMessage(req, 'product.stockInvalid', 'Stock must be a positive number (in strips)')
        });
      }
      product.stock = stock;
    }

    await product.save();

    res.json({
      success: true,
      message: translateMessage(req, 'product.updated', 'Product updated successfully'),
      data: {
        product: formatProduct(product, language),
      },
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ 
      success: false, 
      message: translateMessage(req, 'product.updateError', error.message || 'Server error during product update'),
      error: error.message 
    });
  }
});

// Delete Product (Admin only)
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: translateMessage(req, 'product.notFound', 'Product not found')
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: translateMessage(req, 'product.deleted', 'Product deleted successfully'),
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ 
      success: false, 
      message: translateMessage(req, 'product.deleteError', 'Server error during product deletion'),
      error: error.message 
    });
  }
});

module.exports = router;

