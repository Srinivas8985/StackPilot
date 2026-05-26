const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  // Singleton document key
  key: {
    type: String,
    default: 'global',
    unique: true
  },

  // === Polling ===
  globalPollingEnabled: {
    type: Boolean,
    default: true
  },
  defaultPollingIntervalMs: {
    type: Number,
    default: 90000 // 90 seconds
  },

  // === Deployment Limits ===
  maxDeploymentsPerUser: {
    type: Number,
    default: 20
  },

  // === CI/CD ===
  cicdPaused: {
    type: Boolean,
    default: false
  },

  // === Jenkins ===
  jenkinsUrl: {
    type: String,
    default: 'http://localhost:8080'
  },
  jenkinsJobName: {
    type: String,
    default: 'stackpilot-redeploy'
  }
}, { timestamps: true });

// Always return the singleton
systemConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne({ key: 'global' });
  if (!config) {
    config = await this.create({ key: 'global' });
  }
  return config;
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
