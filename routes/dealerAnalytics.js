const express = require('express');
const mongoose = require('mongoose');
const DealerRequest = require('../models/DealerRequest');
const DealerStock = require('../models/DealerStock');
const StockAllocation = require('../models/StockAllocation');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const User = require('../models/User');
const { getLanguage } = require('../middleware/translateMessages');

const router = express.Router({ mergeParams: true });

// Middleware to verify dealer (expects req.user from parent)
const verifyDealer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Not authenticated' 
    });
  }
  if (req.user.role !== 'dealer' && req.user.role !== 'dellear') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Dealer privileges required.' 
    });
  }
  next();
};

// Apply dealer verification to all routes
router.use(verifyDealer);

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

// Get Dealer Sales Performance Metrics
router.get('/performance', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    // Get approved requests in period
    const approvedRequests = await DealerRequest.find({
      dealer: req.user._id,
      status: 'approved',
      processedAt: { $gte: startDate, $lte: endDate },
    }).populate('product', 'title packetPrice packetsPerStrip');

    // Calculate metrics
    const totalRevenue = approvedRequests.reduce((sum, req) => {
      return sum + (req.strips * req.product.packetPrice * req.product.packetsPerStrip);
    }, 0);

    const totalStrips = approvedRequests.reduce((sum, req) => sum + req.strips, 0);
    const totalOrders = approvedRequests.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    const prevEndDate = new Date(startDate);
    const periodDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    prevStartDate.setDate(prevStartDate.getDate() - periodDays);
    prevEndDate.setTime(startDate.getTime() - 1);

    const prevApprovedRequests = await DealerRequest.find({
      dealer: req.user._id,
      status: 'approved',
      processedAt: { $gte: prevStartDate, $lte: prevEndDate },
    }).populate('product', 'title packetPrice packetsPerStrip');

    const prevTotalRevenue = prevApprovedRequests.reduce((sum, req) => {
      return sum + (req.strips * req.product.packetPrice * req.product.packetsPerStrip);
    }, 0);

    const revenueGrowth = prevTotalRevenue > 0 
      ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1)
      : totalRevenue > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        period,
        metrics: {
          totalRevenue,
          totalStrips,
          totalOrders,
          averageOrderValue,
          revenueGrowth: parseFloat(revenueGrowth),
        },
        comparison: {
          previousRevenue: prevTotalRevenue,
          revenueChange: totalRevenue - prevTotalRevenue,
        },
      },
    });
  } catch (error) {
    console.error('Get dealer performance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dealer performance',
      error: error.message 
    });
  }
});

// Get Dealer Revenue Trends
router.get('/revenue-trends', async (req, res) => {
  try {
    const { period = 'monthly', groupBy = 'day' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    const approvedRequests = await DealerRequest.find({
      dealer: req.user._id,
      status: 'approved',
      processedAt: { $gte: startDate, $lte: endDate },
    }).populate('product', 'title packetPrice packetsPerStrip').sort({ processedAt: 1 });

    // Group by date
    const revenueByDate = {};
    approvedRequests.forEach(request => {
      const date = new Date(request.processedAt);
      let key;
      
      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!revenueByDate[key]) {
        revenueByDate[key] = {
          date: key,
          revenue: 0,
          strips: 0,
          orders: 0,
        };
      }

      const revenue = request.strips * request.product.packetPrice * request.product.packetsPerStrip;
      revenueByDate[key].revenue += revenue;
      revenueByDate[key].strips += request.strips;
      revenueByDate[key].orders += 1;
    });

    const trends = Object.values(revenueByDate).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    res.json({
      success: true,
      data: {
        period,
        groupBy,
        trends,
      },
    });
  } catch (error) {
    console.error('Get dealer revenue trends error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching revenue trends',
      error: error.message 
    });
  }
});

// Get Top Selling Products for Dealer
router.get('/top-products', async (req, res) => {
  try {
    const { period = 'monthly', limit = 10 } = req.query;
    const { startDate, endDate } = getDateRange(period);
    const language = getLanguage(req);

    const approvedRequests = await DealerRequest.find({
      dealer: req.user._id,
      status: 'approved',
      processedAt: { $gte: startDate, $lte: endDate },
    }).populate('product', 'title packetPrice packetsPerStrip image');

    // Group by product
    const productStats = {};
    approvedRequests.forEach(request => {
      const productId = request.product._id.toString();
      if (!productStats[productId]) {
        productStats[productId] = {
          product: {
            id: request.product._id,
            title: formatProductTitle(request.product, language),
            packetPrice: request.product.packetPrice,
            packetsPerStrip: request.product.packetsPerStrip,
            image: request.product.image,
          },
          totalStrips: 0,
          totalRevenue: 0,
          orderCount: 0,
        };
      }
      productStats[productId].totalStrips += request.strips;
      productStats[productId].totalRevenue += 
        request.strips * request.product.packetPrice * request.product.packetsPerStrip;
      productStats[productId].orderCount += 1;
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        products: topProducts,
      },
    });
  } catch (error) {
    console.error('Get top products error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching top products',
      error: error.message 
    });
  }
});

// Get Salesman Performance Comparison
router.get('/salesman-performance', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all salesmen for this dealer
    const salesmen = await User.find({
      createdBy: req.user._id,
      role: 'salesman',
    }).select('name email');

    // Get stock allocations in period
    const allocations = await StockAllocation.find({
      dealer: req.user._id,
      createdAt: { $gte: startDate, $lte: endDate },
    }).populate('product', 'title packetPrice packetsPerStrip')
      .populate('salesman', 'name email');

    // Group by salesman
    const salesmanStats = {};
    salesmen.forEach(salesman => {
      salesmanStats[salesman._id.toString()] = {
        salesman: {
          id: salesman._id,
          name: salesman.name,
          email: salesman.email,
        },
        totalStripsAllocated: 0,
        totalRevenue: 0,
        allocationCount: 0,
        products: new Set(),
      };
    });

    allocations.forEach(allocation => {
      const salesmanId = allocation.salesman._id.toString();
      if (salesmanStats[salesmanId]) {
        salesmanStats[salesmanId].totalStripsAllocated += allocation.strips;
        salesmanStats[salesmanId].totalRevenue += 
          allocation.strips * allocation.product.packetPrice * allocation.product.packetsPerStrip;
        salesmanStats[salesmanId].allocationCount += 1;
        salesmanStats[salesmanId].products.add(allocation.product._id.toString());
      }
    });

    // Convert to array and calculate unique products
    const performance = Object.values(salesmanStats).map(stat => ({
      ...stat,
      uniqueProducts: stat.products.size,
      products: undefined, // Remove Set from response
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      success: true,
      data: {
        period,
        performance,
      },
    });
  } catch (error) {
    console.error('Get salesman performance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching salesman performance',
      error: error.message 
    });
  }
});

// Get Payment Status Overview
router.get('/payment-status', async (req, res) => {
  try {
    // Get all requests with payment status
    const requests = await DealerRequest.find({
      dealer: req.user._id,
    }).select('status paymentStatus strips').populate('product', 'packetPrice packetsPerStrip');

    const statusCounts = {
      pending: { count: 0, value: 0 },
      paid: { count: 0, value: 0 },
      verified: { count: 0, value: 0 },
      rejected: { count: 0, value: 0 },
    };

    requests.forEach(request => {
      const value = request.strips * request.product.packetPrice * request.product.packetsPerStrip;
      if (request.paymentStatus === 'pending') {
        statusCounts.pending.count += 1;
        statusCounts.pending.value += value;
      } else if (request.paymentStatus === 'paid') {
        statusCounts.paid.count += 1;
        statusCounts.paid.value += value;
      } else if (request.paymentStatus === 'verified') {
        statusCounts.verified.count += 1;
        statusCounts.verified.value += value;
      } else if (request.paymentStatus === 'rejected') {
        statusCounts.rejected.count += 1;
        statusCounts.rejected.value += value;
      }
    });

    // Get payments from Payment model
    const payments = await Payment.find({
      dealer: req.user._id,
      type: 'payment',
    });

    const paymentStats = {
      totalPayments: payments.length,
      completedPayments: payments.filter(p => p.status === 'completed').length,
      pendingPayments: payments.filter(p => p.status === 'pending').length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      completedAmount: payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
    };

    res.json({
      success: true,
      data: {
        requestPaymentStatus: statusCounts,
        paymentStats,
      },
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment status',
      error: error.message 
    });
  }
});

// Get Stock Level Alerts
router.get('/stock-alerts', async (req, res) => {
  try {
    const { threshold = 10 } = req.query; // Default threshold: 10 strips

    const dealerStocks = await DealerStock.find({
      dealer: req.user._id,
    }).populate('product', 'title packetPrice packetsPerStrip image');

    const alerts = [];
    dealerStocks.forEach(stock => {
      const percentage = stock.totalStrips > 0 
        ? (stock.availableStrips / stock.totalStrips) * 100 
        : 0;

      if (stock.availableStrips <= parseInt(threshold) || percentage <= 20) {
        alerts.push({
          product: {
            id: stock.product._id,
            title: typeof stock.product.title === 'string' 
              ? stock.product.title 
              : stock.product.title?.en || stock.product.title?.gu || 'Unknown',
            image: stock.product.image,
          },
          stock: {
            total: stock.totalStrips,
            available: stock.availableStrips,
            allocated: stock.allocatedStrips,
            percentage: percentage.toFixed(1),
          },
          alertLevel: stock.availableStrips === 0 ? 'critical' 
            : stock.availableStrips <= parseInt(threshold) / 2 ? 'high' 
            : 'medium',
        });
      }
    });

    // Sort by alert level and available stock
    alerts.sort((a, b) => {
      const levelOrder = { critical: 0, high: 1, medium: 2 };
      if (levelOrder[a.alertLevel] !== levelOrder[b.alertLevel]) {
        return levelOrder[a.alertLevel] - levelOrder[b.alertLevel];
      }
      return a.stock.available - b.stock.available;
    });

    res.json({
      success: true,
      data: {
        alerts,
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.alertLevel === 'critical').length,
        highAlerts: alerts.filter(a => a.alertLevel === 'high').length,
      },
    });
  } catch (error) {
    console.error('Get stock alerts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching stock alerts',
      error: error.message 
    });
  }
});

module.exports = router;

