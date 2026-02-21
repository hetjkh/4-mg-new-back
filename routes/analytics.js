const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DealerRequest = require('../models/DealerRequest');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const LocationAllocation = require('../models/LocationAllocation');
const Product = require('../models/Product');
const User = require('../models/User');
const Sale = require('../models/Sale');
const { getLanguage } = require('../middleware/translateMessages');
const { cacheConfigs, invalidateCache } = require('../middleware/cacheMiddleware');

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

// Mount dealer analytics routes
router.use('/dealer', verifyToken, require('./dealerAnalytics'));

// Helper function to format product title
const formatProductTitle = (product, language = 'en') => {
  if (!product || !product.title) {
    return '';
  }
  if (typeof product.title === 'string') {
    return product.title;
  }
  return product.title[language] || product.title.en || product.title.gu || '';
};

// Helper function to get date range
const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(0); // All time
  }

  return { startDate, endDate: now };
};

// 1. Revenue Analytics Dashboard
router.get('/revenue', verifyToken, verifyAdmin, cacheConfigs.revenue, async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get all approved sales (bills) in date range - these are actual sales to shopkeepers
    const sales = await Sale.find({
      billStatus: 'approved',
      saleDate: { $gte: startDate, $lte: endDate }
    })
    .populate('product', 'title packetPrice packetsPerStrip')
    .populate('dealer', 'name email')
    .populate('salesman', 'name email')
    .lean()
    .sort({ saleDate: 1 });

    // Calculate revenue by date
    const revenueByDate = {};
    let totalRevenue = 0;
    let totalStrips = 0;

    sales.forEach(sale => {
      const date = new Date(sale.saleDate).toISOString().split('T')[0];
      const revenue = sale.totalAmount; // Use actual sale amount
      
      if (!revenueByDate[date]) {
        revenueByDate[date] = { date, revenue: 0, strips: 0, count: 0 };
      }
      
      revenueByDate[date].revenue += revenue;
      revenueByDate[date].strips += sale.strips;
      revenueByDate[date].count += 1;
      
      totalRevenue += revenue;
      totalStrips += sale.strips;
    });

    const revenueData = Object.values(revenueByDate).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    res.json({
      success: true,
      data: {
        period,
        totalRevenue,
        totalStrips,
        totalRequests: sales.length,
        revenueByDate: revenueData,
        summary: {
          averageDailyRevenue: revenueData.length > 0 ? totalRevenue / revenueData.length : 0,
          averageOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0,
        }
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching revenue analytics',
      error: error.message 
    });
  }
});

// 2. Product Performance Reports
router.get('/products', verifyToken, verifyAdmin, cacheConfigs.products, async (req, res) => {
  try {
    const { period = 'all', sortBy = 'revenue', page = 1, limit = 50 } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get all approved sales (bills) - these are actual product sales to shopkeepers
    const salesQuery = {
      billStatus: 'approved'
    };
    if (period !== 'all') {
      salesQuery.saleDate = { $gte: startDate, $lte: endDate };
    }
    const sales = await Sale.find(salesQuery)
    .populate('product', 'title packetPrice packetsPerStrip image stock')
    .populate('dealer', 'name email')
    .lean();

    // Aggregate by product
    const productStats = {};

    sales.forEach(sale => {
      const productId = sale.product._id.toString();
      const revenue = sale.totalAmount; // Use actual sale amount

      if (!productStats[productId]) {
        productStats[productId] = {
          product: {
            id: productId,
            title: formatProductTitle(sale.product, language),
            packetPrice: sale.product.packetPrice,
            packetsPerStrip: sale.product.packetsPerStrip,
            image: sale.product.image,
            stock: sale.product.stock,
          },
          totalRevenue: 0,
          totalStrips: 0,
          totalRequests: 0,
          uniqueDealers: new Set(),
        };
      }

      productStats[productId].totalRevenue += revenue;
      productStats[productId].totalStrips += sale.strips;
      productStats[productId].totalRequests += 1;
      productStats[productId].uniqueDealers.add(sale.dealer._id.toString());
    });

    // Convert to array and calculate metrics
    let products = Object.values(productStats).map(stat => ({
      ...stat,
      uniqueDealers: stat.uniqueDealers.size,
      averageOrderValue: stat.totalRequests > 0 ? stat.totalRevenue / stat.totalRequests : 0,
      averageStripsPerOrder: stat.totalRequests > 0 ? stat.totalStrips / stat.totalRequests : 0,
    }));

    // Sort products
    products.sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.totalRevenue - a.totalRevenue;
        case 'strips':
          return b.totalStrips - a.totalStrips;
        case 'requests':
          return b.totalRequests - a.totalRequests;
        default:
          return b.totalRevenue - a.totalRevenue;
      }
    });

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedProducts = products.slice(skip, skip + parseInt(limit));

    // Get best and worst sellers (top 10)
    const bestSellers = products.slice(0, 10);
    const worstSellers = products.slice(-10).reverse();

    res.json({
      success: true,
      data: {
        period,
        totalProducts: products.length,
        products: paginatedProducts,
        bestSellers,
        worstSellers: worstSellers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: products.length,
          pages: Math.ceil(products.length / parseInt(limit)),
        },
        summary: {
          totalRevenue: products.reduce((sum, p) => sum + p.totalRevenue, 0),
          totalStrips: products.reduce((sum, p) => sum + p.totalStrips, 0),
          totalRequests: products.reduce((sum, p) => sum + p.totalRequests, 0),
        }
      }
    });
  } catch (error) {
    console.error('Product performance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching product performance',
      error: error.message 
    });
  }
});

// 3. Dealer Performance Rankings
router.get('/dealers', verifyToken, verifyAdmin, cacheConfigs.dealers, async (req, res) => {
  try {
    const { period = 'all', sortBy = 'revenue', page = 1, limit = 50 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all approved sales (bills) - these are actual sales through dealers' salesmen
    const salesQuery = {
      billStatus: 'approved'
    };
    if (period !== 'all') {
      salesQuery.saleDate = { $gte: startDate, $lte: endDate };
    }
    const sales = await Sale.find(salesQuery)
    .populate('product', 'title packetPrice packetsPerStrip')
    .populate('dealer', 'name email')
    .populate('salesman', 'name email')
    .lean();

    // Aggregate by dealer
    const dealerStats = {};

    sales.forEach(sale => {
      const dealerId = sale.dealer._id.toString();
      const revenue = sale.totalAmount; // Use actual sale amount

      if (!dealerStats[dealerId]) {
        dealerStats[dealerId] = {
          dealer: {
            id: dealerId,
            name: sale.dealer.name,
            email: sale.dealer.email,
          },
          totalRevenue: 0,
          totalStrips: 0,
          totalRequests: 0,
          approvedRequests: 0,
          pendingRequests: 0,
          cancelledRequests: 0,
          paymentHistory: {
            verified: 0,
            rejected: 0,
            pending: 0,
          },
          lastOrderDate: null,
        };
      }

      dealerStats[dealerId].totalRevenue += revenue;
      dealerStats[dealerId].totalStrips += sale.strips;
      dealerStats[dealerId].totalRequests += 1;
      dealerStats[dealerId].approvedRequests += 1;

      // Track payment status from sales
      if (sale.paymentStatus === 'completed') {
        dealerStats[dealerId].paymentHistory.verified += 1;
      } else if (sale.paymentStatus === 'partial') {
        dealerStats[dealerId].paymentHistory.pending += 1;
      } else {
        dealerStats[dealerId].paymentHistory.pending += 1;
      }

      if (!dealerStats[dealerId].lastOrderDate || 
          new Date(sale.saleDate) > new Date(dealerStats[dealerId].lastOrderDate)) {
        dealerStats[dealerId].lastOrderDate = sale.saleDate;
      }
    });

    // Get all dealers to include those with no sales
    const allDealers = await User.find({ role: { $in: ['dealer', 'dellear'] } })
      .select('name email');

    allDealers.forEach(dealer => {
      const dealerId = dealer._id.toString();
      if (!dealerStats[dealerId]) {
        dealerStats[dealerId] = {
          dealer: {
            id: dealerId,
            name: dealer.name,
            email: dealer.email,
          },
          totalRevenue: 0,
          totalStrips: 0,
          totalRequests: 0,
          approvedRequests: 0,
          pendingRequests: 0,
          cancelledRequests: 0,
          paymentHistory: {
            verified: 0,
            rejected: 0,
            pending: 0,
          },
          lastOrderDate: null,
        };
      }
    });

    // Get pending and rejected bills for dealers
    const pendingQuery = { billStatus: 'pending' };
    if (period !== 'all') {
      pendingQuery.saleDate = { $gte: startDate, $lte: endDate };
    }
    const pendingSales = await Sale.find(pendingQuery)
    .populate('dealer', 'name email')
    .lean();

    const rejectedQuery = { billStatus: 'rejected' };
    if (period !== 'all') {
      rejectedQuery.saleDate = { $gte: startDate, $lte: endDate };
    }
    const rejectedSales = await Sale.find(rejectedQuery)
    .populate('dealer', 'name email')
    .lean();

    pendingSales.forEach(sale => {
      const dealerId = sale.dealer._id.toString();
      if (dealerStats[dealerId]) {
        dealerStats[dealerId].pendingRequests += 1;
      }
    });

    rejectedSales.forEach(sale => {
      const dealerId = sale.dealer._id.toString();
      if (dealerStats[dealerId]) {
        dealerStats[dealerId].cancelledRequests += 1;
      }
    });

    // Convert to array and calculate payment success rate
    let dealers = Object.values(dealerStats).map(stat => {
      const totalPayments = stat.paymentHistory.verified + stat.paymentHistory.rejected + stat.paymentHistory.pending;
      return {
        ...stat,
        averageOrderValue: stat.approvedRequests > 0 ? stat.totalRevenue / stat.approvedRequests : 0,
        paymentSuccessRate: totalPayments > 0 
          ? (stat.paymentHistory.verified / totalPayments) * 100 
          : 0,
      };
    });

    // Sort dealers
    dealers.sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.totalRevenue - a.totalRevenue;
        case 'strips':
          return b.totalStrips - a.totalStrips;
        case 'requests':
          return b.totalRequests - a.totalRequests;
        case 'paymentRate':
          return b.paymentSuccessRate - a.paymentSuccessRate;
        default:
          return b.totalRevenue - a.totalRevenue;
      }
    });

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedDealers = dealers.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        totalDealers: dealers.length,
        dealers: paginatedDealers,
        topPerformers: dealers.slice(0, 10),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: dealers.length,
          pages: Math.ceil(dealers.length / parseInt(limit)),
        },
        summary: {
          totalRevenue: dealers.reduce((sum, d) => sum + d.totalRevenue, 0),
          totalStrips: dealers.reduce((sum, d) => sum + d.totalStrips, 0),
          totalRequests: dealers.reduce((sum, d) => sum + d.totalRequests, 0),
        }
      }
    });
  } catch (error) {
    console.error('Dealer performance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer performance',
      error: error.message 
    });
  }
});

// 4. Salesman Performance Tracking
router.get('/salesmen', verifyToken, verifyAdmin, cacheConfigs.salesmen, async (req, res) => {
  try {
    const { dealerId, period = 'all', page = 1, limit = 50 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Build query for approved sales (bills)
    const query = {
      billStatus: 'approved'
    };
    if (period !== 'all') {
      query.saleDate = { $gte: startDate, $lte: endDate };
    }
    if (dealerId) {
      const dealer = await User.findById(dealerId);
      if (!dealer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Dealer not found' 
        });
      }
      query.dealer = dealerId;
    }

    // Get approved sales - these are actual sales made by salesmen to shopkeepers
    const sales = await Sale.find(query)
    .populate('salesman', 'name email')
    .populate('dealer', 'name email')
    .populate('product', 'title packetPrice packetsPerStrip')
    .lean()
    .sort({ saleDate: -1 });

    // Aggregate by salesman
    const salesmanStats = {};

    sales.forEach(sale => {
      const salesmanId = sale.salesman._id.toString();
      const value = sale.totalAmount; // Use actual sale amount

      if (!salesmanStats[salesmanId]) {
        salesmanStats[salesmanId] = {
          salesman: {
            id: salesmanId,
            name: sale.salesman.name,
            email: sale.salesman.email,
          },
          dealer: {
            id: sale.dealer._id.toString(),
            name: sale.dealer.name,
            email: sale.dealer.email,
          },
          totalStrips: 0,
          totalValue: 0,
          totalAllocations: 0,
          products: new Set(),
        };
      }

      salesmanStats[salesmanId].totalStrips += sale.strips;
      salesmanStats[salesmanId].totalValue += value;
      salesmanStats[salesmanId].totalAllocations += 1;
      salesmanStats[salesmanId].products.add(sale.product._id.toString());
    });

    // Convert to array
    let salesmen = Object.values(salesmanStats).map(stat => ({
      ...stat,
      uniqueProducts: stat.products.size,
      averageAllocationValue: stat.totalAllocations > 0 ? stat.totalValue / stat.totalAllocations : 0,
    }));

    // Sort by total value
    salesmen.sort((a, b) => b.totalValue - a.totalValue);

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedSalesmen = salesmen.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        dealerId: dealerId || null,
        totalSalesmen: salesmen.length,
        salesmen: paginatedSalesmen,
        topPerformers: salesmen.slice(0, 10),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: salesmen.length,
          pages: Math.ceil(salesmen.length / parseInt(limit)),
        },
        summary: {
          totalStrips: salesmen.reduce((sum, s) => sum + s.totalStrips, 0),
          totalValue: salesmen.reduce((sum, s) => sum + s.totalValue, 0),
          totalAllocations: salesmen.reduce((sum, s) => sum + s.totalAllocations, 0),
        }
      }
    });
  } catch (error) {
    console.error('Salesman performance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching salesman performance',
      error: error.message 
    });
  }
});

// 5. Stock Movement Reports
router.get('/stock-movement', verifyToken, verifyAdmin, cacheConfigs.stockMovement, async (req, res) => {
  try {
    const { period = 'all', productId, page = 1, limit = 50 } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get stock in (approved requests)
    const stockInQuery = {
      status: 'approved'
    };
    if (period !== 'all') {
      stockInQuery.processedAt = { $gte: startDate, $lte: endDate };
    }
    if (productId) {
      stockInQuery.product = productId;
    }

    const stockIn = await DealerRequest.find(stockInQuery)
      .populate('product', 'title packetPrice packetsPerStrip')
      .populate('dealer', 'name email')
      .lean()
      .sort({ processedAt: -1 });

    // Get stock out (allocations to salesmen)
    const stockOutQuery = {};
    if (period !== 'all') {
      stockOutQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    if (productId) {
      stockOutQuery.product = productId;
    }

    const stockOut = await StockAllocation.find(stockOutQuery)
      .populate('product', 'title packetPrice packetsPerStrip')
      .populate('dealer', 'name email')
      .populate('salesman', 'name email')
      .lean()
      .sort({ createdAt: -1 });

    // Calculate totals
    const totalStockIn = stockIn.reduce((sum, r) => sum + r.strips, 0);
    const totalStockOut = stockOut.reduce((sum, a) => sum + a.strips, 0);
    const turnover = totalStockIn > 0 ? (totalStockOut / totalStockIn) * 100 : 0;

    // Group by product
    const productMovement = {};

    stockIn.forEach(request => {
      // Skip if product is null (deleted product)
      if (!request.product || !request.product._id) {
        return;
      }
      const productId = request.product._id.toString();
      if (!productMovement[productId]) {
        productMovement[productId] = {
          product: {
            id: productId,
            title: formatProductTitle(request.product, language),
            packetPrice: request.product.packetPrice,
            packetsPerStrip: request.product.packetsPerStrip,
          },
          stockIn: 0,
          stockOut: 0,
          currentStock: 0,
        };
      }
      productMovement[productId].stockIn += request.strips;
    });

    stockOut.forEach(allocation => {
      // Skip if product is null (deleted product)
      if (!allocation.product || !allocation.product._id) {
        return;
      }
      const productId = allocation.product._id.toString();
      if (!productMovement[productId]) {
        productMovement[productId] = {
          product: {
            id: productId,
            title: formatProductTitle(allocation.product, language),
            packetPrice: allocation.product.packetPrice,
            packetsPerStrip: allocation.product.packetsPerStrip,
          },
          stockIn: 0,
          stockOut: 0,
          currentStock: 0,
        };
      }
      productMovement[productId].stockOut += allocation.strips;
    });

    // Get current stock from products
    const products = await Product.find(productId ? { _id: productId } : {});
    products.forEach(product => {
      const productId = product._id.toString();
      if (productMovement[productId]) {
        productMovement[productId].currentStock = product.stock;
      }
    });

    // Convert to array and calculate turnover
    const movements = Object.values(productMovement).map(m => ({
      ...m,
      turnover: m.stockIn > 0 ? (m.stockOut / m.stockIn) * 100 : 0,
      netMovement: m.stockIn - m.stockOut,
    }));

    movements.sort((a, b) => b.stockIn - a.stockIn);

    // Apply pagination to movements
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedMovements = movements.slice(skip, skip + parseInt(limit));

    // Paginate stock records
    const stockInSkip = (parseInt(page) - 1) * parseInt(limit);
    const stockOutSkip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedStockIn = stockIn.slice(stockInSkip, stockInSkip + parseInt(limit));
    const paginatedStockOut = stockOut.slice(stockOutSkip, stockOutSkip + parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        productId: productId || null,
        totalStockIn,
        totalStockOut,
        netMovement: totalStockIn - totalStockOut,
        turnover,
        movements: paginatedMovements,
        stockInRecords: paginatedStockIn,
        stockOutRecords: paginatedStockOut,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: movements.length,
          pages: Math.ceil(movements.length / parseInt(limit)),
        },
      }
    });
  } catch (error) {
    console.error('Stock movement error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching stock movement',
      error: error.message 
    });
  }
});

// 6. Location-based Sales Analytics
router.get('/locations', verifyToken, verifyAdmin, cacheConfigs.locations, async (req, res) => {
  try {
    const { period = 'all', page = 1, limit = 50 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all location allocations
    const locationAllocationsQuery = {
      status: 'active'
    };
    if (period !== 'all') {
      locationAllocationsQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    const allocations = await LocationAllocation.find(locationAllocationsQuery)
    .populate('allocatedTo', 'name email role')
    .populate('allocatedBy', 'name email')
    .lean();

    // Get dealers with locations
    const dealersWithLocations = {};
    
    allocations.forEach(allocation => {
      if (allocation.allocationType === 'admin-to-dealer') {
        const dealerId = allocation.allocatedTo._id.toString();
        if (!dealersWithLocations[dealerId]) {
          dealersWithLocations[dealerId] = {
            dealer: {
              id: dealerId,
              name: allocation.allocatedTo.name,
              email: allocation.allocatedTo.email,
            },
            districts: new Set(),
            talukas: new Set(),
            totalLocations: 0,
          };
        }
        dealersWithLocations[dealerId].districts.add(allocation.districtName);
        allocation.talukas.forEach(taluka => {
          dealersWithLocations[dealerId].talukas.add(taluka);
        });
        dealersWithLocations[dealerId].totalLocations += 1;
      }
    });

    // Get salesmen with locations
    const salesmenWithLocations = {};
    
    allocations.forEach(allocation => {
      if (allocation.allocationType === 'dealer-to-salesman') {
        const salesmanId = allocation.allocatedTo._id.toString();
        if (!salesmenWithLocations[salesmanId]) {
          salesmenWithLocations[salesmanId] = {
            salesman: {
              id: salesmanId,
              name: allocation.allocatedTo.name,
              email: allocation.allocatedTo.email,
            },
            districts: new Set(),
            talukas: new Set(),
            totalLocations: 0,
          };
        }
        salesmenWithLocations[salesmanId].districts.add(allocation.districtName);
        allocation.talukas.forEach(taluka => {
          salesmenWithLocations[salesmanId].talukas.add(taluka);
        });
        salesmenWithLocations[salesmanId].totalLocations += 1;
      }
    });

    // Get approved sales (bills) by location - these are actual sales to shopkeepers
    const locationSalesQuery = {
      billStatus: 'approved',
      'location.district': { $exists: true, $ne: '' }
    };
    if (period !== 'all') {
      locationSalesQuery.saleDate = { $gte: startDate, $lte: endDate };
    }
    const sales = await Sale.find(locationSalesQuery)
    .populate('dealer', 'name email')
    .populate('salesman', 'name email')
    .populate('product', 'title packetPrice packetsPerStrip')
    .lean();

    // Aggregate by district from actual sales
    const districtStats = {};

    // First, add dealers and salesmen from location allocations
    Object.values(dealersWithLocations).forEach(dealerData => {
      dealerData.districts.forEach(district => {
        if (!districtStats[district]) {
          districtStats[district] = {
            district,
            dealers: new Set(),
            salesmen: new Set(),
            totalRevenue: 0,
            totalStrips: 0,
            totalRequests: 0,
          };
        }
        districtStats[district].dealers.add(dealerData.dealer.id);
      });
    });

    Object.values(salesmenWithLocations).forEach(salesmanData => {
      salesmanData.districts.forEach(district => {
        if (districtStats[district]) {
          districtStats[district].salesmen.add(salesmanData.salesman.id);
        }
      });
    });

    // Calculate revenue by district from actual sales
    sales.forEach(sale => {
      const district = sale.location?.district;
      if (district) {
        if (!districtStats[district]) {
          districtStats[district] = {
            district,
            dealers: new Set(),
            salesmen: new Set(),
            totalRevenue: 0,
            totalStrips: 0,
            totalRequests: 0,
          };
        }
        
        const revenue = sale.totalAmount; // Use actual sale amount
        districtStats[district].totalRevenue += revenue;
        districtStats[district].totalStrips += sale.strips;
        districtStats[district].totalRequests += 1;
        
        // Add dealer and salesman to the district
        if (sale.dealer) {
          districtStats[district].dealers.add(sale.dealer._id.toString());
        }
        if (sale.salesman) {
          districtStats[district].salesmen.add(sale.salesman._id.toString());
        }
      }
    });

    // Convert to array
    const locations = Object.values(districtStats).map(stat => ({
      district: stat.district,
      totalDealers: stat.dealers.size,
      totalSalesmen: stat.salesmen.size,
      totalRevenue: stat.totalRevenue,
      totalStrips: stat.totalStrips,
      totalRequests: stat.totalRequests,
      averageRevenuePerDealer: stat.dealers.size > 0 ? stat.totalRevenue / stat.dealers.size : 0,
    }));

    locations.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedLocations = locations.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        totalDistricts: locations.length,
        locations: paginatedLocations,
        topDistricts: locations.slice(0, 10),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: locations.length,
          pages: Math.ceil(locations.length / parseInt(limit)),
        },
        summary: {
          totalDealers: Object.keys(dealersWithLocations).length,
          totalSalesmen: Object.keys(salesmenWithLocations).length,
          totalRevenue: locations.reduce((sum, l) => sum + l.totalRevenue, 0),
          totalStrips: locations.reduce((sum, l) => sum + l.totalStrips, 0),
        }
      }
    });
  } catch (error) {
    console.error('Location analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching location analytics',
      error: error.message 
    });
  }
});

// 7. Export Reports (returns data in exportable format)
router.get('/export', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { type, period = 'all', format = 'json' } = req.query;
    const language = getLanguage(req);

    let data = {};

    // Call the appropriate analytics function directly
    switch (type) {
      case 'revenue': {
        const { startDate, endDate } = getDateRange(period);
        const sales = await Sale.find({
          billStatus: 'approved',
          saleDate: { $gte: startDate, $lte: endDate }
        })
        .populate('product', 'title packetPrice packetsPerStrip')
        .populate('dealer', 'name email')
        .lean()
        .sort({ saleDate: 1 });

        const revenueByDate = {};
        let totalRevenue = 0;
        let totalStrips = 0;

        sales.forEach(sale => {
          const date = new Date(sale.saleDate).toISOString().split('T')[0];
          const revenue = sale.totalAmount; // Use actual sale amount
          
          if (!revenueByDate[date]) {
            revenueByDate[date] = { date, revenue: 0, strips: 0, count: 0 };
          }
          
          revenueByDate[date].revenue += revenue;
          revenueByDate[date].strips += sale.strips;
          revenueByDate[date].count += 1;
          
          totalRevenue += revenue;
          totalStrips += sale.strips;
        });

        data = {
          period,
          totalRevenue,
          totalStrips,
          totalRequests: sales.length,
          revenueByDate: Object.values(revenueByDate).sort((a, b) => new Date(a.date) - new Date(b.date)),
        };
        break;
      }
      case 'products': {
        const { startDate, endDate } = getDateRange(period);
        const productsSalesQuery = {
          billStatus: 'approved'
        };
        if (period !== 'all') {
          productsSalesQuery.saleDate = { $gte: startDate, $lte: endDate };
        }
        const sales = await Sale.find(productsSalesQuery)
        .populate('product', 'title packetPrice packetsPerStrip image stock')
        .populate('dealer', 'name email')
        .lean();

        const productStats = {};
        sales.forEach(sale => {
          const productId = sale.product._id.toString();
          const revenue = sale.totalAmount; // Use actual sale amount

          if (!productStats[productId]) {
            productStats[productId] = {
              product: {
                id: productId,
                title: formatProductTitle(sale.product, language),
                packetPrice: sale.product.packetPrice,
                packetsPerStrip: sale.product.packetsPerStrip,
              },
              totalRevenue: 0,
              totalStrips: 0,
              totalRequests: 0,
            };
          }
          productStats[productId].totalRevenue += revenue;
          productStats[productId].totalStrips += sale.strips;
          productStats[productId].totalRequests += 1;
        });

        data = {
          period,
          products: Object.values(productStats),
        };
        break;
      }
      case 'dealers': {
        const { startDate, endDate } = getDateRange(period);
        const dealersSalesQuery = {
          billStatus: 'approved'
        };
        if (period !== 'all') {
          dealersSalesQuery.saleDate = { $gte: startDate, $lte: endDate };
        }
        const sales = await Sale.find(dealersSalesQuery)
        .populate('product', 'title packetPrice packetsPerStrip')
        .populate('dealer', 'name email')
        .lean();

        const dealerStats = {};
        sales.forEach(sale => {
          const dealerId = sale.dealer._id.toString();
          const revenue = sale.totalAmount; // Use actual sale amount

          if (!dealerStats[dealerId]) {
            dealerStats[dealerId] = {
              dealer: {
                id: dealerId,
                name: sale.dealer.name,
                email: sale.dealer.email,
              },
              totalRevenue: 0,
              totalStrips: 0,
              totalRequests: 0,
            };
          }
          dealerStats[dealerId].totalRevenue += revenue;
          dealerStats[dealerId].totalStrips += sale.strips;
          dealerStats[dealerId].totalRequests += 1;
        });

        data = {
          period,
          dealers: Object.values(dealerStats),
        };
        break;
      }
      case 'salesmen': {
        const { startDate, endDate } = getDateRange(period);
        const salesmenSalesQuery = {
          billStatus: 'approved'
        };
        if (period !== 'all') {
          salesmenSalesQuery.saleDate = { $gte: startDate, $lte: endDate };
        }
        const sales = await Sale.find(salesmenSalesQuery)
        .populate('salesman', 'name email')
        .populate('dealer', 'name email')
        .populate('product', 'title packetPrice packetsPerStrip')
        .lean();

        const salesmanStats = {};
        sales.forEach(sale => {
          const salesmanId = sale.salesman._id.toString();
          const value = sale.totalAmount; // Use actual sale amount

          if (!salesmanStats[salesmanId]) {
            salesmanStats[salesmanId] = {
              salesman: {
                id: salesmanId,
                name: sale.salesman.name,
                email: sale.salesman.email,
              },
              dealer: {
                id: sale.dealer._id.toString(),
                name: sale.dealer.name,
                email: sale.dealer.email,
              },
              totalStrips: 0,
              totalValue: 0,
              totalAllocations: 0,
            };
          }
          salesmanStats[salesmanId].totalStrips += sale.strips;
          salesmanStats[salesmanId].totalValue += value;
          salesmanStats[salesmanId].totalAllocations += 1;
        });

        data = {
          period,
          salesmen: Object.values(salesmanStats),
        };
        break;
      }
      case 'stock': {
        const { startDate, endDate } = getDateRange(period);
        const exportStockInQuery = {
          status: 'approved'
        };
        if (period !== 'all') {
          exportStockInQuery.processedAt = { $gte: startDate, $lte: endDate };
        }
        const stockIn = await DealerRequest.find(exportStockInQuery)
        .populate('product', 'title packetPrice packetsPerStrip')
        .lean();

        const exportStockOutQuery = {};
        if (period !== 'all') {
          exportStockOutQuery.createdAt = { $gte: startDate, $lte: endDate };
        }
        const stockOut = await StockAllocation.find(exportStockOutQuery)
        .populate('product', 'title packetPrice packetsPerStrip')
        .lean();

        const totalStockIn = stockIn.reduce((sum, r) => sum + r.strips, 0);
        const totalStockOut = stockOut.reduce((sum, a) => sum + a.strips, 0);

        data = {
          period,
          totalStockIn,
          totalStockOut,
          netMovement: totalStockIn - totalStockOut,
          turnover: totalStockIn > 0 ? (totalStockOut / totalStockIn) * 100 : 0,
        };
        break;
      }
      case 'locations': {
        const { startDate, endDate } = getDateRange(period);
        const allocations = await LocationAllocation.find({
          status: 'active',
          createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('allocatedTo', 'name email role')
        .lean();

        const districtStats = {};
        allocations.forEach(allocation => {
          if (allocation.allocationType === 'admin-to-dealer') {
            const district = allocation.districtName;
            if (!districtStats[district]) {
              districtStats[district] = {
                district,
                totalDealers: 0,
                totalSalesmen: 0,
              };
            }
            districtStats[district].totalDealers += 1;
          }
        });

        data = {
          period,
          locations: Object.values(districtStats),
        };
        break;
      }
      default:
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid export type' 
        });
    }

    if (format === 'csv') {
      // Convert to CSV format (simplified)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-${period}-${Date.now()}.csv"`);
      // CSV conversion would go here - for now return JSON
      res.send(JSON.stringify(data, null, 2));
    } else {
      res.json({
        success: true,
        data,
        exportedAt: new Date().toISOString(),
        period,
        type,
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while exporting data',
      error: error.message 
    });
  }
});

module.exports = router;

