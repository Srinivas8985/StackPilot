require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const deploymentsRoutes = require('./routes/deployments');
const { startCleanupScheduler } = require('./services/cleanup');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deployments', deploymentsRoutes);

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
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });
