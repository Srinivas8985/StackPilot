const mongoose = require('mongoose');

const infraLogEntrySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success'],
    default: 'info'
  }
}, { _id: false });

const monitoringServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['OK', 'WARNING', 'CRITICAL', 'UNKNOWN', 'PENDING'],
    default: 'PENDING'
  },
  output: {
    type: String,
    default: null
  },
  lastCheck: {
    type: Date,
    default: null
  },
  perfData: {
    type: String,
    default: null
  }
}, { _id: false });

const infrastructureSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deployment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deployment',
    required: true,
    index: true
  },
  infrastructureType: {
    type: String,
    enum: ['ec2-dedicated'],
    default: 'ec2-dedicated'
  },
  terraformWorkspace: {
    type: String,
    default: 'default',
    trim: true
  },
  stateIdentifier: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  awsRegion: {
    type: String,
    required: true,
    default: 'us-east-1',
    trim: true
  },
  instanceType: {
    type: String,
    default: 't3.micro',
    trim: true
  },
  amiOs: {
    type: String,
    enum: ['ubuntu', 'amazon-linux'],
    default: 'ubuntu'
  },
  ec2InstanceId: {
    type: String,
    default: null,
    trim: true
  },
  publicIp: {
    type: String,
    default: null,
    trim: true
  },
  privateIp: {
    type: String,
    default: null,
    trim: true
  },
  availabilityZone: {
    type: String,
    default: null,
    trim: true
  },
  securityGroupId: {
    type: String,
    default: null,
    trim: true
  },
  sshKeyName: {
    type: String,
    default: null,
    trim: true
  },
  sshAllowedCidr: {
    type: String,
    default: '0.0.0.0/0',
    trim: true
  },
  appAllowedCidr: {
    type: String,
    default: '0.0.0.0/0',
    trim: true
  },
  applicationPort: {
    type: Number,
    default: 3000
  },
  applicationUrl: {
    type: String,
    default: null,
    trim: true
  },
  status: {
    type: String,
    enum: [
      'PENDING',
      'INITIALIZING',
      'PLANNING',
      'PROVISIONING',
      'PROVISIONED',
      'FAILED',
      'DESTROYING',
      'DESTROYED'
    ],
    default: 'PENDING',
    index: true
  },
  provisioningStartedAt: {
    type: Date,
    default: null
  },
  provisioningCompletedAt: {
    type: Date,
    default: null
  },
  destroyedAt: {
    type: Date,
    default: null
  },
  errorDetails: {
    type: String,
    default: null
  },
  logs: [infraLogEntrySchema],
  resourceTags: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  outputs: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  terraformWorkingDir: {
    type: String,
    default: null
  },
  ansibleHandoff: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // === Ansible Automated Configuration Tracking ===
  configurationStatus: {
    type: String,
    enum: ['pending', 'configuring', 'configured', 'failed'],
    default: 'pending',
    index: true
  },
  configurationLogs: [infraLogEntrySchema],
  configurationStartedAt: {
    type: Date,
    default: null
  },
  configurationCompletedAt: {
    type: Date,
    default: null
  },
  configurationError: {
    type: String,
    default: null
  },
  ansibleVersion: {
    type: String,
    default: null
  },
  ansiblePlaybook: {
    type: String,
    default: 'playbooks/configure-ec2.yml'
  },

  // === Puppet Configuration Management & Drift Control Tracking ===
  puppetStatus: {
    type: String,
    enum: ['pending', 'applying', 'applied', 'failed'],
    default: 'pending',
    index: true
  },
  puppetLogs: [infraLogEntrySchema],
  puppetStartedAt: {
    type: Date,
    default: null
  },
  puppetCompletedAt: {
    type: Date,
    default: null
  },
  puppetLastRunAt: {
    type: Date,
    default: null
  },
  puppetError: {
    type: String,
    default: null
  },
  puppetVersion: {
    type: String,
    default: null
  },
  puppetManifest: {
    type: String,
    default: 'manifests/site.pp'
  },

  // === Nagios Central Infrastructure & Application Monitoring ===
  monitoringStatus: {
    type: String,
    enum: ['pending', 'registered', 'healthy', 'warning', 'critical', 'unavailable'],
    default: 'pending',
    index: true
  },
  nagiosHostName: {
    type: String,
    default: null,
    trim: true
  },
  monitoringRegisteredAt: {
    type: Date,
    default: null
  },
  lastMonitoringCheck: {
    type: Date,
    default: null
  },
  monitoringError: {
    type: String,
    default: null
  },
  monitoringServices: [monitoringServiceSchema]
}, { timestamps: true });

// Helper to push a log entry
infrastructureSchema.methods.pushLog = async function(message, type = 'info') {
  this.logs.push({ message, type, timestamp: new Date() });
  return this.save();
};

// Helper to push an Ansible configuration log entry
infrastructureSchema.methods.pushConfigurationLog = async function(message, type = 'info') {
  this.configurationLogs.push({ message, type, timestamp: new Date() });
  return this.save();
};

// Helper to push a Puppet configuration log entry
infrastructureSchema.methods.pushPuppetLog = async function(message, type = 'info') {
  this.puppetLogs.push({ message, type, timestamp: new Date() });
  return this.save();
};

// Helper to update Nagios monitoring status
infrastructureSchema.methods.updateMonitoringStatus = async function(status, error = null) {
  this.monitoringStatus = status;
  this.monitoringError = error;
  this.lastMonitoringCheck = new Date();
  return this.save();
};

// Helper to update Nagios monitoring service results
infrastructureSchema.methods.setMonitoringServices = async function(services = []) {
  this.monitoringServices = services;
  this.lastMonitoringCheck = new Date();
  return this.save();
};

module.exports = mongoose.model('Infrastructure', infrastructureSchema);

