const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DealerRequest = require('../models/DealerRequest');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const LocationAllocation = require('../models/LocationAllocation');
const Product = require('../models/Product');
const User = require('../models/User');
const { getLanguage } = require('../middleware/translateMessages');

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
router.get('/revenue', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get all approved requests in date range
    const requests = await DealerRequest.find({
      status: 'approved',
      processedAt: { $gte: startDate, $lte: endDate }
    })
    .populate('product', 'title packetPrice packetsPerStrip')
    .populate('dealer', 'name email')
    .sort({ processedAt: 1 });

    // Calculate revenue by date
    const revenueByDate = {};
    let totalRevenue = 0;
    let totalStrips = 0;

    requests.forEach(request => {
      const date = new Date(request.processedAt).toISOString().split('T')[0];
      const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;
      
      if (!revenueByDate[date]) {
        revenueByDate[date] = { date, revenue: 0, strips: 0, count: 0 };
      }
      
      revenueByDate[date].revenue += revenue;
      revenueByDate[date].strips += request.strips;
      revenueByDate[date].count += 1;
      
      totalRevenue += revenue;
      totalStrips += request.strips;
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
        totalRequests: requests.length,
        revenueByDate: revenueData,
        summary: {
          averageDailyRevenue: revenueData.length > 0 ? totalRevenue / revenueData.length : 0,
          averageOrderValue: requests.length > 0 ? totalRevenue / requests.length : 0,
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
router.get('/products', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { period = 'all', sortBy = 'revenue' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get all approved requests
    const requests = await DealerRequest.find({
      status: 'approved',
      processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('product', 'title packetPrice packetsPerStrip image stock')
    .populate('dealer', 'name email');

    // Aggregate by product
    const productStats = {};

    requests.forEach(request => {
      const productId = request.product._id.toString();
      const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;

      if (!productStats[productId]) {
        productStats[productId] = {
          product: {
            id: productId,
            title: formatProductTitle(request.product, language),
            packetPrice: request.product.packetPrice,
            packetsPerStrip: request.product.packetsPerStrip,
            image: request.product.image,
            stock: request.product.stock,
          },
          totalRevenue: 0,
          totalStrips: 0,
          totalRequests: 0,
          uniqueDealers: new Set(),
        };
      }

      productStats[productId].totalRevenue += revenue;
      productStats[productId].totalStrips += request.strips;
      productStats[productId].totalRequests += 1;
      productStats[productId].uniqueDealers.add(request.dealer._id.toString());
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

    // Get best and worst sellers
    const bestSellers = products.slice(0, 10);
    const worstSellers = products.slice(-10).reverse();

    res.json({
      success: true,
      data: {
        period,
        totalProducts: products.length,
        products,
        bestSellers,
        worstSellers: worstSellers,
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
router.get('/dealers', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { period = 'all', sortBy = 'revenue' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all approved requests
    const requests = await DealerRequest.find({
      status: 'approved',
      processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('product', 'title packetPrice packetsPerStrip')
    .populate('dealer', 'name email')
    .populate('paymentVerifiedBy', 'name');

    // Aggregate by dealer
    const dealerStats = {};

    requests.forEach(request => {
      const dealerId = request.dealer._id.toString();
      const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;

      if (!dealerStats[dealerId]) {
        dealerStats[dealerId] = {
          dealer: {
            id: dealerId,
            name: request.dealer.name,
            email: request.dealer.email,
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
      dealerStats[dealerId].totalStrips += request.strips;
      dealerStats[dealerId].totalRequests += 1;
      dealerStats[dealerId].approvedRequests += 1;

      if (request.paymentStatus === 'verified') {
        dealerStats[dealerId].paymentHistory.verified += 1;
      } else if (request.paymentStatus === 'rejected') {
        dealerStats[dealerId].paymentHistory.rejected += 1;
      } else {
        dealerStats[dealerId].paymentHistory.pending += 1;
      }

      if (!dealerStats[dealerId].lastOrderDate || 
          new Date(request.processedAt) > new Date(dealerStats[dealerId].lastOrderDate)) {
        dealerStats[dealerId].lastOrderDate = request.processedAt;
      }
    });

    // Get all dealers to include those with no orders
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

    // Get pending and cancelled requests
    const allRequests = await DealerRequest.find({
      processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('dealer', 'name email');

    allRequests.forEach(request => {
      const dealerId = request.dealer._id.toString();
      if (dealerStats[dealerId]) {
        if (request.status === 'pending') {
          dealerStats[dealerId].pendingRequests += 1;
        } else if (request.status === 'cancelled') {
          dealerStats[dealerId].cancelledRequests += 1;
        }
      }
    });

    // Convert to array and calculate payment success rate
    let dealers = Object.values(dealerStats).map(stat => {
      const totalPayments = stat.paymentHistory.verified + stat.paymentHistory.rejected;
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

    res.json({
      success: true,
      data: {
        period,
        totalDealers: dealers.length,
        dealers,
        topPerformers: dealers.slice(0, 10),
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
router.get('/salesmen', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dealerId, period = 'all' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Build query
    const query = {};
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

    // Get stock allocations
    const allocations = await StockAllocation.find({
      ...query,
      createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('salesman', 'name email')
    .populate('dealer', 'name email')
    .populate('product', 'title packetPrice packetsPerStrip')
    .sort({ createdAt: -1 });

    // Aggregate by salesman
    const salesmanStats = {};

    allocations.forEach(allocation => {
      const salesmanId = allocation.salesman._id.toString();
      const value = allocation.strips * allocation.product.packetsPerStrip * allocation.product.packetPrice;

      if (!salesmanStats[salesmanId]) {
        salesmanStats[salesmanId] = {
          salesman: {
            id: salesmanId,
            name: allocation.salesman.name,
            email: allocation.salesman.email,
          },
          dealer: {
            id: allocation.dealer._id.toString(),
            name: allocation.dealer.name,
            email: allocation.dealer.email,
          },
          totalStrips: 0,
          totalValue: 0,
          totalAllocations: 0,
          products: new Set(),
        };
      }

      salesmanStats[salesmanId].totalStrips += allocation.strips;
      salesmanStats[salesmanId].totalValue += value;
      salesmanStats[salesmanId].totalAllocations += 1;
      salesmanStats[salesmanId].products.add(allocation.product._id.toString());
    });

    // Convert to array
    let salesmen = Object.values(salesmanStats).map(stat => ({
      ...stat,
      uniqueProducts: stat.products.size,
      averageAllocationValue: stat.totalAllocations > 0 ? stat.totalValue / stat.totalAllocations : 0,
    }));

    // Sort by total value
    salesmen.sort((a, b) => b.totalValue - a.totalValue);

    res.json({
      success: true,
      data: {
        period,
        dealerId: dealerId || null,
        totalSalesmen: salesmen.length,
        salesmen,
        topPerformers: salesmen.slice(0, 10),
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
router.get('/stock-movement', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { period = 'all', productId } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get stock in (approved requests)
    const stockInQuery = {
      status: 'approved',
      processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    };
    if (productId) {
      stockInQuery.product = productId;
    }

    const stockIn = await DealerRequest.find(stockInQuery)
      .populate('product', 'title packetPrice packetsPerStrip')
      .populate('dealer', 'name email')
      .sort({ processedAt: -1 });

    // Get stock out (allocations to salesmen)
    const stockOutQuery = {
      createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    };
    if (productId) {
      stockOutQuery.product = productId;
    }

    const stockOut = await StockAllocation.find(stockOutQuery)
      .populate('product', 'title packetPrice packetsPerStrip')
      .populate('dealer', 'name email')
      .populate('salesman', 'name email')
      .sort({ createdAt: -1 });

    // Calculate totals
    const totalStockIn = stockIn.reduce((sum, r) => sum + r.strips, 0);
    const totalStockOut = stockOut.reduce((sum, a) => sum + a.strips, 0);
    const turnover = totalStockIn > 0 ? (totalStockOut / totalStockIn) * 100 : 0;

    // Group by product
    const productMovement = {};

    stockIn.forEach(request => {
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

    res.json({
      success: true,
      data: {
        period,
        productId: productId || null,
        totalStockIn,
        totalStockOut,
        netMovement: totalStockIn - totalStockOut,
        turnover,
        movements,
        stockInRecords: stockIn.slice(0, 50), // Limit records
        stockOutRecords: stockOut.slice(0, 50),
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
router.get('/locations', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all location allocations
    const allocations = await LocationAllocation.find({
      status: 'active',
      createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('allocatedTo', 'name email role')
    .populate('allocatedBy', 'name email');

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

    // Get dealer requests by location (through dealer)
    const dealerRequests = await DealerRequest.find({
      status: 'approved',
      processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
    })
    .populate('dealer', 'name email')
    .populate('product', 'title packetPrice packetsPerStrip');

    // Aggregate by district
    const districtStats = {};

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

    // Calculate revenue by district (through dealers)
    dealerRequests.forEach(request => {
      const dealerId = request.dealer._id.toString();
      const dealerData = Object.values(dealersWithLocations).find(d => d.dealer.id === dealerId);
      
      if (dealerData) {
        dealerData.districts.forEach(district => {
          if (districtStats[district]) {
            const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;
            districtStats[district].totalRevenue += revenue;
            districtStats[district].totalStrips += request.strips;
            districtStats[district].totalRequests += 1;
          }
        });
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

    res.json({
      success: true,
      data: {
        period,
        totalDistricts: locations.length,
        locations,
        topDistricts: locations.slice(0, 10),
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
        const requests = await DealerRequest.find({
          status: 'approved',
          processedAt: { $gte: startDate, $lte: endDate }
        })
        .populate('product', 'title packetPrice packetsPerStrip')
        .populate('dealer', 'name email')
        .sort({ processedAt: 1 });

        const revenueByDate = {};
        let totalRevenue = 0;
        let totalStrips = 0;

        requests.forEach(request => {
          const date = new Date(request.processedAt).toISOString().split('T')[0];
          const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;
          
          if (!revenueByDate[date]) {
            revenueByDate[date] = { date, revenue: 0, strips: 0, count: 0 };
          }
          
          revenueByDate[date].revenue += revenue;
          revenueByDate[date].strips += request.strips;
          revenueByDate[date].count += 1;
          
          totalRevenue += revenue;
          totalStrips += request.strips;
        });

        data = {
          period,
          totalRevenue,
          totalStrips,
          totalRequests: requests.length,
          revenueByDate: Object.values(revenueByDate).sort((a, b) => new Date(a.date) - new Date(b.date)),
        };
        break;
      }
      case 'products': {
        const { startDate, endDate } = getDateRange(period);
        const requests = await DealerRequest.find({
          status: 'approved',
          processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('product', 'title packetPrice packetsPerStrip image stock')
        .populate('dealer', 'name email');

        const productStats = {};
        requests.forEach(request => {
          const productId = request.product._id.toString();
          const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;

          if (!productStats[productId]) {
            productStats[productId] = {
              product: {
                id: productId,
                title: formatProductTitle(request.product, language),
                packetPrice: request.product.packetPrice,
                packetsPerStrip: request.product.packetsPerStrip,
              },
              totalRevenue: 0,
              totalStrips: 0,
              totalRequests: 0,
            };
          }
          productStats[productId].totalRevenue += revenue;
          productStats[productId].totalStrips += request.strips;
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
        const requests = await DealerRequest.find({
          status: 'approved',
          processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('product', 'title packetPrice packetsPerStrip')
        .populate('dealer', 'name email');

        const dealerStats = {};
        requests.forEach(request => {
          const dealerId = request.dealer._id.toString();
          const revenue = request.strips * request.product.packetsPerStrip * request.product.packetPrice;

          if (!dealerStats[dealerId]) {
            dealerStats[dealerId] = {
              dealer: {
                id: dealerId,
                name: request.dealer.name,
                email: request.dealer.email,
              },
              totalRevenue: 0,
              totalStrips: 0,
              totalRequests: 0,
            };
          }
          dealerStats[dealerId].totalRevenue += revenue;
          dealerStats[dealerId].totalStrips += request.strips;
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
        const allocations = await StockAllocation.find({
          createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('salesman', 'name email')
        .populate('dealer', 'name email')
        .populate('product', 'title packetPrice packetsPerStrip');

        const salesmanStats = {};
        allocations.forEach(allocation => {
          const salesmanId = allocation.salesman._id.toString();
          const value = allocation.strips * allocation.product.packetsPerStrip * allocation.product.packetPrice;

          if (!salesmanStats[salesmanId]) {
            salesmanStats[salesmanId] = {
              salesman: {
                id: salesmanId,
                name: allocation.salesman.name,
                email: allocation.salesman.email,
              },
              dealer: {
                id: allocation.dealer._id.toString(),
                name: allocation.dealer.name,
                email: allocation.dealer.email,
              },
              totalStrips: 0,
              totalValue: 0,
              totalAllocations: 0,
            };
          }
          salesmanStats[salesmanId].totalStrips += allocation.strips;
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
        const stockIn = await DealerRequest.find({
          status: 'approved',
          processedAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('product', 'title packetPrice packetsPerStrip');

        const stockOut = await StockAllocation.find({
          createdAt: period !== 'all' ? { $gte: startDate, $lte: endDate } : {}
        })
        .populate('product', 'title packetPrice packetsPerStrip');

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
        .populate('allocatedTo', 'name email role');

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

