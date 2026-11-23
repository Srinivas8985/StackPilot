const Infrastructure = require('../models/Infrastructure');
const Deployment = require('../models/Deployment');
const {
  provisionDedicatedInfrastructure,
  destroyDedicatedInfrastructure,
  isTerraformAvailable
} = require('../services/terraformService');
const {
  isAnsibleAvailable,
  configureDedicatedInfrastructure,
  retryAnsibleConfiguration
} = require('../services/ansibleService');
const {
  isPuppetAvailable,
  applyPuppetConfiguration,
  retryPuppetConfiguration,
  simulateDriftAndRemediate
} = require('../services/puppetService');
const nagiosService = require('../services/nagiosService');

// @route   GET /api/infrastructure/system-status
// @desc    Check host Terraform, Ansible, Puppet & AWS preflight status
// @access  Private
exports.getSystemStatus = async (req, res) => {
  try {
    const [tfStatus, ansibleStatus, puppetStatus] = await Promise.all([
      isTerraformAvailable(),
      isAnsibleAvailable(),
      isPuppetAvailable()
    ]);
    res.json({
      terraform: tfStatus,
      ansible: ansibleStatus,
      puppet: puppetStatus,
      awsConfigured: Boolean(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_ACCESS_KEY_ID)
    });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to inspect system status', error: err.message });
  }
};

// @route   POST /api/infrastructure/provision
// @desc    Request or re-trigger dedicated infrastructure provisioning
// @access  Private
exports.provisionInfrastructure = async (req, res) => {
  try {
    const {
      deploymentId,
      awsRegion = 'us-east-1',
      instanceType = 't3.micro',
      amiOs = 'ubuntu',
      sshAllowedCidr = '0.0.0.0/0',
      appAllowedCidr = '0.0.0.0/0',
      sshKeyName = '',
      applicationPort = 3000
    } = req.body;

    if (!deploymentId) {
      return res.status(400).json({ msg: 'deploymentId is required' });
    }

    // Verify deployment ownership
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      return res.status(404).json({ msg: 'Deployment not found' });
    }

    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to manage infrastructure for this deployment' });
    }

    // Check if infrastructure already exists for this deployment
    let infra = await Infrastructure.findOne({ deployment: deployment._id });

    if (infra) {
      // Prevent duplicate provisioning if already running
      if (['INITIALIZING', 'PLANNING', 'PROVISIONING'].includes(infra.status)) {
        return res.status(409).json({
          msg: 'Infrastructure provisioning is already in progress for this deployment',
          infrastructure: infra
        });
      }

      // If already active and provisioned, user should explicitly destroy first
      if (infra.status === 'PROVISIONED') {
        return res.status(400).json({
          msg: 'Dedicated infrastructure is already PROVISIONED. Destroy it first if you wish to re-provision.',
          infrastructure: infra
        });
      }

      // Re-provisioning an existing (FAILED or DESTROYED) record
      infra.status = 'PENDING';
      infra.awsRegion = awsRegion;
      infra.instanceType = instanceType;
      infra.amiOs = amiOs;
      infra.sshAllowedCidr = sshAllowedCidr;
      infra.appAllowedCidr = appAllowedCidr;
      infra.sshKeyName = sshKeyName;
      infra.applicationPort = applicationPort;
      infra.errorDetails = null;
      await infra.save();
    } else {
      // Create new Infrastructure document
      const stateIdentifier = `deploy-${deployment._id}-${Date.now()}`;
      infra = new Infrastructure({
        user: req.user.id,
        deployment: deployment._id,
        stateIdentifier,
        awsRegion,
        instanceType,
        amiOs,
        sshAllowedCidr,
        appAllowedCidr,
        sshKeyName,
        applicationPort,
        status: 'PENDING'
      });
      await infra.save();

      // Link to deployment
      deployment.deploymentMode = 'dedicated';
      deployment.infrastructure = infra._id;
      await deployment.save();
    }

    // Start asynchronous provisioning (non-blocking HTTP response)
    setImmediate(() => {
      provisionDedicatedInfrastructure(infra._id).catch(err => {
        console.error(`[InfrastructureController] Background provisioning error:`, err);
      });
    });

    res.status(202).json({
      msg: 'Dedicated infrastructure provisioning initiated',
      infrastructure: infra
    });

  } catch (err) {
    console.error('[InfrastructureController] Provision error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure
// @desc    Get all dedicated infrastructure for logged-in user
// @access  Private
exports.getInfrastructureList = async (req, res) => {
  try {
    const list = await Infrastructure.find({ user: req.user.id })
      .populate('deployment', 'name repoUrl branch environment status')
      .sort({ createdAt: -1 });

    res.json(list);
  } catch (err) {
    console.error('[InfrastructureController] Get list error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure/:id
// @desc    Get dedicated infrastructure details by ID
// @access  Private
exports.getInfrastructureById = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id)
      .populate('deployment', 'name repoUrl branch environment status deploymentUrl');

    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to inspect this infrastructure' });
    }

    res.json(infra);
  } catch (err) {
    console.error('[InfrastructureController] Get by ID error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure/by-deployment/:deploymentId
// @desc    Get dedicated infrastructure for a deployment
// @access  Private
exports.getInfrastructureByDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ msg: 'Deployment not found' });
    }

    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const infra = await Infrastructure.findOne({ deployment: deployment._id });
    if (!infra) {
      return res.status(404).json({ msg: 'No dedicated infrastructure linked to this deployment' });
    }

    res.json(infra);
  } catch (err) {
    console.error('[InfrastructureController] Get by deployment error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   POST /api/infrastructure/:id/destroy
// @desc    Destroy dedicated infrastructure for a deployment
// @access  Private
exports.destroyInfrastructure = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to destroy this infrastructure' });
    }

    if (infra.status === 'DESTROYED') {
      return res.status(400).json({ msg: 'Infrastructure is already DESTROYED' });
    }

    if (infra.status === 'DESTROYING') {
      return res.status(409).json({ msg: 'Infrastructure destruction is already in progress' });
    }

    // Trigger asynchronous destruction
    setImmediate(() => {
      destroyDedicatedInfrastructure(infra._id).catch(err => {
        console.error(`[InfrastructureController] Background destruction error:`, err);
      });
    });

    res.status(202).json({
      msg: 'Dedicated infrastructure destruction initiated',
      infrastructureId: infra._id,
      status: 'DESTROYING'
    });

  } catch (err) {
    console.error('[InfrastructureController] Destroy error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   POST /api/infrastructure/:id/retry
// @desc    Retry provisioning for failed infrastructure
// @access  Private
exports.retryInfrastructure = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    if (infra.status !== 'FAILED') {
      return res.status(400).json({
        msg: `Cannot retry infrastructure in status ${infra.status}. Only FAILED state can be retried.`
      });
    }

    infra.status = 'PENDING';
    infra.errorDetails = null;
    await infra.save();

    setImmediate(() => {
      provisionDedicatedInfrastructure(infra._id).catch(err => {
        console.error(`[InfrastructureController] Background retry error:`, err);
      });
    });

    res.status(202).json({
      msg: 'Dedicated infrastructure provisioning retry initiated',
      infrastructure: infra
    });

  } catch (err) {
    console.error('[InfrastructureController] Retry error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// ============================================================
// ANSIBLE CONFIGURATION CONTROLLERS
// ============================================================

// @route   POST /api/infrastructure/:id/configure
// @desc    Trigger automated Ansible configuration on dedicated infrastructure
// @access  Private
exports.startAnsibleConfiguration = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to configure this infrastructure' });
    }

    if (infra.status !== 'PROVISIONED') {
      return res.status(400).json({
        msg: `Cannot run Ansible configuration. Terraform provisioning must be PROVISIONED first (current: ${infra.status}).`
      });
    }

    if (infra.configurationStatus === 'configuring') {
      return res.status(409).json({
        msg: 'Ansible configuration is already in progress for this infrastructure.',
        infrastructure: infra
      });
    }

    // Trigger asynchronous Ansible configuration
    setImmediate(() => {
      configureDedicatedInfrastructure(infra._id, req.user.id).catch(err => {
        console.error(`[InfrastructureController] Background Ansible error:`, err);
      });
    });

    infra.configurationStatus = 'configuring';
    await infra.save();

    res.status(202).json({
      msg: 'Ansible automated configuration initiated',
      infrastructureId: infra._id,
      configurationStatus: 'configuring'
    });

  } catch (err) {
    console.error('[InfrastructureController] Start Ansible error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure/:id/configuration-status
// @desc    Get Ansible configuration status for dedicated infrastructure
// @access  Private
exports.getConfigurationStatus = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id)
      .select('configurationStatus configurationStartedAt configurationCompletedAt configurationError ansibleVersion ansiblePlaybook');

    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    res.json({
      configurationStatus: infra.configurationStatus,
      configurationStartedAt: infra.configurationStartedAt,
      configurationCompletedAt: infra.configurationCompletedAt,
      configurationError: infra.configurationError,
      ansibleVersion: infra.ansibleVersion,
      ansiblePlaybook: infra.ansiblePlaybook
    });
  } catch (err) {
    console.error('[InfrastructureController] Get config status error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure/:id/configuration-logs
// @desc    Get Ansible execution logs
// @access  Private
exports.getConfigurationLogs = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id)
      .select('user configurationLogs configurationStatus');

    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to inspect these logs' });
    }

    res.json({
      status: infra.configurationStatus,
      logs: infra.configurationLogs || []
    });
  } catch (err) {
    console.error('[InfrastructureController] Get config logs error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   POST /api/infrastructure/:id/retry-configuration
// @desc    Retry failed Ansible configuration
// @access  Private
exports.retryAnsibleConfigurationEndpoint = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    await retryAnsibleConfiguration(infra._id, req.user.id);

    res.status(202).json({
      msg: 'Ansible configuration retry initiated',
      infrastructureId: infra._id,
      configurationStatus: 'pending'
    });
  } catch (err) {
    console.error('[InfrastructureController] Retry configuration error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// ============================================================
// PUPPET CONFIGURATION MANAGEMENT ENDPOINTS
// ============================================================

// @route   POST /api/infrastructure/:id/puppet/apply
// @desc    Trigger Puppet desired-state enforcement on dedicated infrastructure
// @access  Private
exports.applyPuppet = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    // Verify ownership
    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to manage this infrastructure' });
    }

    // Verify prerequisites: Terraform PROVISIONED and Ansible configured
    if (infra.status !== 'PROVISIONED') {
      return res.status(400).json({
        msg: `Cannot apply Puppet on infrastructure in status ${infra.status}. Terraform provisioning must be PROVISIONED first.`
      });
    }

    if (infra.configurationStatus !== 'configured') {
      return res.status(400).json({
        msg: `Host configuration is ${infra.configurationStatus}. Ansible setup must be completed before enforcing Puppet desired state.`
      });
    }

    if (infra.puppetStatus === 'applying') {
      return res.status(409).json({
        msg: 'Puppet configuration enforcement is already in progress for this infrastructure.'
      });
    }

    // Trigger asynchronous execution so request responds promptly
    applyPuppetConfiguration(infra._id, req.user.id).catch((err) => {
      console.error(`[InfrastructureController] Background Puppet apply failed for ${infra._id}:`, err.message);
    });

    res.status(202).json({
      msg: 'Puppet desired-state enforcement initiated',
      infrastructureId: infra._id,
      puppetStatus: 'applying'
    });
  } catch (err) {
    console.error('[InfrastructureController] Apply Puppet error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// @route   GET /api/infrastructure/:id/puppet/status
// @desc    Get Puppet configuration status
// @access  Private
exports.getPuppetStatus = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id)
      .select('user puppetStatus puppetStartedAt puppetCompletedAt puppetLastRunAt puppetError puppetVersion puppetManifest');

    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to inspect this status' });
    }

    res.json({
      puppetStatus: infra.puppetStatus,
      puppetStartedAt: infra.puppetStartedAt,
      puppetCompletedAt: infra.puppetCompletedAt,
      puppetLastRunAt: infra.puppetLastRunAt,
      puppetError: infra.puppetError,
      puppetVersion: infra.puppetVersion,
      puppetManifest: infra.puppetManifest
    });
  } catch (err) {
    console.error('[InfrastructureController] Get puppet status error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   GET /api/infrastructure/:id/puppet/logs
// @desc    Get Puppet execution logs
// @access  Private
exports.getPuppetLogs = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id)
      .select('user puppetLogs puppetStatus');

    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to inspect these logs' });
    }

    res.json({
      status: infra.puppetStatus,
      logs: infra.puppetLogs || []
    });
  } catch (err) {
    console.error('[InfrastructureController] Get puppet logs error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @route   POST /api/infrastructure/:id/puppet/retry
// @desc    Retry failed Puppet enforcement
// @access  Private
exports.retryPuppetEndpoint = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    retryPuppetConfiguration(infra._id, req.user.id).catch((err) => {
      console.error(`[InfrastructureController] Background Puppet retry failed for ${infra._id}:`, err.message);
    });

    res.status(202).json({
      msg: 'Puppet configuration retry initiated',
      infrastructureId: infra._id,
      puppetStatus: 'pending'
    });
  } catch (err) {
    console.error('[InfrastructureController] Retry Puppet error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// @route   POST /api/infrastructure/:id/puppet/simulate-drift
// @desc    Simulate controlled configuration drift and trigger remediation
// @access  Private
exports.simulatePuppetDriftEndpoint = async (req, res) => {
  try {
    const infra = await Infrastructure.findById(req.params.id);
    if (!infra) {
      return res.status(404).json({ msg: 'Infrastructure resource not found' });
    }

    if (infra.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    simulateDriftAndRemediate(infra._id, req.user.id).catch((err) => {
      console.error(`[InfrastructureController] Background drift simulation failed for ${infra._id}:`, err.message);
    });

    res.status(202).json({
      msg: 'Configuration drift simulation and automated remediation initiated',
      infrastructureId: infra._id
    });
  } catch (err) {
    console.error('[InfrastructureController] Drift simulation error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// =============== NAGIOS MONITORING CONTROLLERS ===============

// @route   POST /api/infrastructure/:id/monitoring/register
// @desc    Register dedicated infrastructure with Nagios Core monitoring
// @access  Private
exports.registerMonitoring = async (req, res) => {
  try {
    const result = await nagiosService.registerHost(req.params.id, req.user.id);
    res.status(200).json({
      msg: 'Dedicated host registered for Nagios monitoring successfully',
      ...result
    });
  } catch (err) {
    console.error('[InfrastructureController] Register monitoring error:', err);
    const statusCode = err.message.includes('Unauthorized') ? 403 :
                       err.message.includes('not found') ? 404 :
                       err.message.includes('already in progress') ? 409 : 400;
    res.status(statusCode).json({ msg: err.message });
  }
};

// @route   GET /api/infrastructure/:id/monitoring/status
// @desc    Get Nagios monitoring status and overall host health
// @access  Private
exports.getMonitoringStatus = async (req, res) => {
  try {
    const result = await nagiosService.getMonitoringStatus(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('[InfrastructureController] Get monitoring status error:', err);
    const statusCode = err.message.includes('Unauthorized') ? 403 :
                       err.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ msg: err.message });
  }
};

// @route   GET /api/infrastructure/:id/monitoring/services
// @desc    Get Nagios service checks breakdown
// @access  Private
exports.getMonitoringServices = async (req, res) => {
  try {
    const result = await nagiosService.getMonitoringServices(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('[InfrastructureController] Get monitoring services error:', err);
    const statusCode = err.message.includes('Unauthorized') ? 403 :
                       err.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ msg: err.message });
  }
};

// @route   POST /api/infrastructure/:id/monitoring/deregister
// @desc    Deregister host from Nagios monitoring and remove configuration
// @access  Private
exports.deregisterMonitoring = async (req, res) => {
  try {
    const result = await nagiosService.deregisterHost(req.params.id, req.user.id);
    res.json({
      msg: 'Host deregistered from Nagios monitoring',
      ...result
    });
  } catch (err) {
    console.error('[InfrastructureController] Deregister monitoring error:', err);
    const statusCode = err.message.includes('Unauthorized') ? 403 :
                       err.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ msg: err.message });
  }
};

