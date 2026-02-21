const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
// CORS:
// - React Native often sends no `Origin` header (origin is undefined) -> allow it
// - Electron renderer can be `http://localhost:*` in dev, or `null` / `file://` in prod -> allow it
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (RN, curl, Postman)
    if (!origin) return callback(null, true);

    // Electron packaged apps can appear as "null" origin
    if (origin === 'null') return callback(null, true);

    // Allow localhost dev servers (Vite, Expo web, etc.)
    if (/^https?:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    if (/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true);

    // If you later host a web dashboard, add it here.
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// MongoDB Connection
// Add database name to connection string if not present
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/myapp?appName=Cluster0';

// Connection Pool Configuration
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Connection Pool Settings
  maxPoolSize: 50, // Maximum number of connections in the pool (default: 10)
  minPoolSize: 5, // Minimum number of connections to maintain (default: 0)
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  // Connection Timeout Settings
  connectTimeoutMS: 10000, // 10 seconds timeout for initial connection
  socketTimeoutMS: 45000, // 45 seconds timeout for socket operations
  serverSelectionTimeoutMS: 10000, // 10 seconds timeout for server selection
  // Retry Settings
  retryWrites: true,
  retryReads: true,
  // Heartbeat Settings
  heartbeatFrequencyMS: 10000, // Check server status every 10 seconds
};

mongoose.connect(MONGODB_URI, connectionOptions)
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log('Database:', mongoose.connection.name);
  logConnectionStats();
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('Full error:', err);
});

// Connection monitoring function
function logConnectionStats() {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  console.log('📊 Connection State:', states[state] || 'unknown');
  
  // Log pool statistics if available
  if (mongoose.connection.db && mongoose.connection.db.serverConfig) {
    const serverConfig = mongoose.connection.db.serverConfig;
    if (serverConfig.pool) {
      console.log('📊 Connection Pool Stats:', {
        size: serverConfig.pool.totalConnectionCount || 'N/A',
        available: serverConfig.pool.availableConnectionCount || 'N/A',
        waitQueueSize: serverConfig.pool.waitQueueSize || 'N/A'
      });
    }
  }
}

// MongoDB connection event handlers
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  logConnectionStats();
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
  logConnectionStats();
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
  logConnectionStats();
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected');
  logConnectionStats();
});

// Periodic connection health check (every 5 minutes)
setInterval(() => {
  if (mongoose.connection.readyState === 1) {
    logConnectionStats();
  } else {
    console.warn('⚠️ MongoDB connection is not ready. State:', mongoose.connection.readyState);
  }
}, 5 * 60 * 1000); // 5 minutes

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
app.use('/api/dealer-documents', require('./routes/dealerDocuments'));
app.use('/api/dealer-profile', require('./routes/dealerProfile'));

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

