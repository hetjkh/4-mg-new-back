const mongoose = require('mongoose');
require('dotenv').config();

// Main database connection (existing)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/myapp?appName=Cluster0';

// Archive database connection
const ARCHIVE_MONGODB_URI = process.env.ARCHIVE_MONGODB_URI || 'mongodb+srv://hetjani818_db_user:123@cluster0.6s5idrd.mongodb.net/archive?appName=Cluster0';

// Connection Pool Configuration
const connectionOptions = {
  // Connection Pool Settings
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  // Connection Timeout Settings
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 10000,
  // Retry Settings
  retryWrites: true,
  retryReads: true,
  // Heartbeat Settings
  heartbeatFrequencyMS: 10000,
};

// Main database connection (default mongoose connection)
let mainConnection = null;

// Archive database connection (separate connection)
let archiveConnection = null;

/**
 * Initialize main database connection
 */
async function connectMainDatabase() {
  try {
    if (!mainConnection || mainConnection.readyState === 0) {
      mainConnection = await mongoose.connect(MONGODB_URI, connectionOptions);
      console.log('✅ Main MongoDB Connected Successfully');
      console.log('Main Database:', mongoose.connection.name);
      logConnectionStats(mainConnection, 'Main');
    }
    return mainConnection;
  } catch (error) {
    console.error('❌ Main MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Initialize archive database connection
 */
async function connectArchiveDatabase() {
  try {
    if (!archiveConnection || archiveConnection.readyState === 0) {
      // Create a new connection for archive database
      archiveConnection = mongoose.createConnection(ARCHIVE_MONGODB_URI, connectionOptions);
      
      archiveConnection.on('connected', () => {
        console.log('✅ Archive MongoDB Connected Successfully');
        console.log('Archive Database:', archiveConnection.name);
        logConnectionStats(archiveConnection, 'Archive');
      });

      archiveConnection.on('error', (err) => {
        console.error('❌ Archive MongoDB connection error:', err);
      });

      archiveConnection.on('disconnected', () => {
        console.warn('⚠️ Archive MongoDB disconnected');
      });

      archiveConnection.on('reconnected', () => {
        console.log('✅ Archive MongoDB reconnected');
        logConnectionStats(archiveConnection, 'Archive');
      });

      await archiveConnection.asPromise();
    }
    return archiveConnection;
  } catch (error) {
    console.error('❌ Archive MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Initialize both database connections
 */
async function initializeDatabases() {
  try {
    await connectMainDatabase();
    await connectArchiveDatabase();
    console.log('✅ All database connections initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

/**
 * Get main database connection
 */
function getMainConnection() {
  return mongoose.connection;
}

/**
 * Get archive database connection
 */
function getArchiveConnection() {
  if (!archiveConnection) {
    throw new Error('Archive database not connected. Call connectArchiveDatabase() or initializeDatabases() first.');
  }
  if (archiveConnection.readyState === 0) {
    throw new Error('Archive database connection is not ready. State: ' + archiveConnection.readyState);
  }
  return archiveConnection;
}

/**
 * Log connection statistics
 */
function logConnectionStats(connection, label = '') {
  const state = connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  console.log(`📊 ${label} Connection State:`, states[state] || 'unknown');
  
  if (connection.db && connection.db.serverConfig) {
    const serverConfig = connection.db.serverConfig;
    if (serverConfig.pool) {
      console.log(`📊 ${label} Connection Pool Stats:`, {
        size: serverConfig.pool.totalConnectionCount || 'N/A',
        available: serverConfig.pool.availableConnectionCount || 'N/A',
        waitQueueSize: serverConfig.pool.waitQueueSize || 'N/A'
      });
    }
  }
}

/**
 * Close all database connections
 */
async function closeAllConnections() {
  try {
    if (archiveConnection && archiveConnection.readyState !== 0) {
      await archiveConnection.close();
      console.log('✅ Archive database connection closed');
    }
    if (mainConnection && mainConnection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('✅ Main database connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
    throw error;
  }
}

// Connection event handlers for main database
mongoose.connection.on('error', (err) => {
  console.error('❌ Main MongoDB connection error:', err);
  logConnectionStats(mongoose.connection, 'Main');
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Main MongoDB disconnected');
  logConnectionStats(mongoose.connection, 'Main');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ Main MongoDB reconnected');
  logConnectionStats(mongoose.connection, 'Main');
});

mongoose.connection.on('connected', () => {
  console.log('✅ Main MongoDB connected');
  logConnectionStats(mongoose.connection, 'Main');
});

// Periodic connection health check (every 5 minutes)
setInterval(() => {
  if (mongoose.connection.readyState === 1) {
    logConnectionStats(mongoose.connection, 'Main');
  } else {
    console.warn('⚠️ Main MongoDB connection is not ready. State:', mongoose.connection.readyState);
  }
  
  if (archiveConnection && archiveConnection.readyState === 1) {
    logConnectionStats(archiveConnection, 'Archive');
  } else if (archiveConnection) {
    console.warn('⚠️ Archive MongoDB connection is not ready. State:', archiveConnection.readyState);
  }
}, 5 * 60 * 1000); // 5 minutes

module.exports = {
  connectMainDatabase,
  connectArchiveDatabase,
  initializeDatabases,
  getMainConnection,
  getArchiveConnection,
  closeAllConnections,
  MONGODB_URI,
  ARCHIVE_MONGODB_URI,
};

