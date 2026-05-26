require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const deploymentsRoutes = require('./routes/deployments');
const adminRoutes = require('./routes/admin');
const { startCleanupScheduler } = require('./services/cleanup');
const { startPolling } = require('./services/pollingService');

// Prometheus Metrics Instrumentation
const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10]
});
register.registerMetric(httpRequestDurationSeconds);

const app = express();

// Metrics Middleware
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const time = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    // Exclude /metrics endpoints from spamming metrics stats
    if (!route.includes('/metrics')) {
      httpRequestDurationSeconds
        .labels(req.method, route, res.statusCode)
        .observe(time);
    }
  });
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Metrics routes (supports both formats for high compatibility)
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});
app.get('/api/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// MongoDB connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stackpilot';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Start the cleanup scheduler for temp repos and stale containers
      startCleanupScheduler();
      // Start GitHub commit polling service
      startPolling();
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });
