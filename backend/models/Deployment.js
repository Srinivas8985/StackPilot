const mongoose = require('mongoose');

const logEntrySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  message: String,
  type: { type: String, enum: ['info', 'error', 'success', 'warning'], default: 'info' }
}, { _id: false });

const redeployHistorySchema = new mongoose.Schema({
  triggeredAt: { type: Date, default: Date.now },
  trigger: { type: String, enum: ['manual', 'auto', 'jenkins', 'admin'], default: 'manual' },
  commitSha: { type: String, default: null },
  status: { type: String, enum: ['queued', 'building', 'success', 'failed'], default: 'queued' },
  jenkinsBuildNumber: { type: Number, default: null },
  duration: { type: Number, default: null }
}, { _id: false });

const envVarSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: String, required: true }
}, { _id: false });

const deploymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  repoUrl: {
    type: String,
    required: true,
    trim: true
  },
  branch: {
    type: String,
    default: 'main',
    trim: true
  },
  status: {
    type: String,
    enum: ['queued', 'analyzing', 'cloning', 'generating', 'building', 'deploying', 'running', 'stopped', 'failed'],
    default: 'queued'
  },

  // === Advanced Configuration ===
  projectType: {
    type: String,
    enum: ['react-vite', 'nextjs', 'express', 'flask', 'django', 'spring-boot', 'static', 'custom', null],
    default: null
  },
  deployFolder: {
    type: String,
    default: '.',
    trim: true
  },
  envVars: [envVarSchema],
  buildConfig: {
    installCommand: { type: String, default: null },
    buildCommand: { type: String, default: null },
    startCommand: { type: String, default: null },
    exposedPort: { type: Number, default: 3000 },
    nodeVersion: { type: String, default: '20' }
  },

  // === AI Dockerfile ===
  generatedDockerfile: {
    type: String,
    default: null
  },
  useCustomDockerfile: {
    type: Boolean,
    default: false
  },

  // === Repo Analysis ===
  repoAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // === Container Metadata ===
  containerId: {
    type: String,
    default: null
  },
  imageId: {
    type: String,
    default: null
  },
  port: {
    type: Number,
    default: null
  },
  deploymentUrl: {
    type: String,
    default: null
  },
  logs: [logEntrySchema],
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'development'
  },
  cpu: {
    type: String,
    default: '0%'
  },
  memory: {
    type: String,
    default: '0MB'
  },
  lastHealthCheck: {
    type: Date,
    default: null
  },

  // === CI/CD & GitHub Polling ===
  autoDeployEnabled: {
    type: Boolean,
    default: false
  },
  lastCommitSha: {
    type: String,
    default: null
  },
  lastCheckedAt: {
    type: Date,
    default: null
  },
  pollingInterval: {
    type: Number,
    default: 90000 // 90 seconds
  },
  redeployCount: {
    type: Number,
    default: 0
  },
  redeployHistory: [redeployHistorySchema],

  // === Jenkins ===
  jenkinsBuildNumber: {
    type: Number,
    default: null
  },
  jenkinsBuildStatus: {
    type: String,
    enum: ['idle', 'queued', 'building', 'success', 'failed', null],
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Deployment', deploymentSchema);
