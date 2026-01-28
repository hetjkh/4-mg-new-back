const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
// Add database name to connection string if not present
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/myapp?appName=Cluster0';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log('Database:', mongoose.connection.name);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('Full error:', err);
});

// MongoDB connection event handlers
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/dealer-requests', require('./routes/dealerRequests'));
app.use('/api/salesmen', require('./routes/salesmen'));
app.use('/api/dealers', require('./routes/dealers'));
app.use('/api/admin/dealers', require('./routes/adminDealers'));
app.use('/api/admin/users', require('./routes/adminUsers'));
app.use('/api/stalkists', require('./routes/stalkists'));
app.use('/api/stock-allocation', require('./routes/stockAllocation'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/location-allocation', require('./routes/locationAllocation'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/shopkeepers', require('./routes/shopkeepers'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Simple test API
app.get('/api/test', (req, res) => {
  res.json({ message: 'api is working' });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://10.228.242.192:${PORT}`);
});

