const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const infrastructureController = require('../controllers/infrastructureController');

// @route   GET /api/infrastructure/system-status
// @desc    Check host Terraform & AWS preflight status
// @access  Private
router.get('/system-status', auth, infrastructureController.getSystemStatus);

// @route   POST /api/infrastructure/provision
// @desc    Provision dedicated AWS EC2 infrastructure using Terraform
// @access  Private
router.post('/provision', auth, infrastructureController.provisionInfrastructure);

// @route   GET /api/infrastructure
// @desc    List all dedicated infrastructure for logged-in user
// @access  Private
router.get('/', auth, infrastructureController.getInfrastructureList);

// @route   GET /api/infrastructure/by-deployment/:deploymentId
// @desc    Get dedicated infrastructure for a specific deployment
// @access  Private
router.get('/by-deployment/:deploymentId', auth, infrastructureController.getInfrastructureByDeployment);

// @route   GET /api/infrastructure/:id
// @desc    Get dedicated infrastructure details by ID
// @access  Private
router.get('/:id', auth, infrastructureController.getInfrastructureById);

// @route   POST /api/infrastructure/:id/destroy
// @desc    Destroy dedicated infrastructure for a deployment
// @access  Private
router.post('/:id/destroy', auth, infrastructureController.destroyInfrastructure);

// @route   POST /api/infrastructure/:id/retry
// @desc    Retry provisioning for failed infrastructure
// @access  Private
router.post('/:id/retry', auth, infrastructureController.retryInfrastructure);

// =============== ANSIBLE CONFIGURATION ROUTES ===============

// @route   POST /api/infrastructure/:id/configure
// @desc    Trigger automated Ansible configuration on dedicated infrastructure
// @access  Private
router.post('/:id/configure', auth, infrastructureController.startAnsibleConfiguration);

// @route   GET /api/infrastructure/:id/configuration-status
// @desc    Get Ansible configuration status
// @access  Private
router.get('/:id/configuration-status', auth, infrastructureController.getConfigurationStatus);

// @route   GET /api/infrastructure/:id/configuration-logs
// @desc    Get Ansible execution logs
// @access  Private
router.get('/:id/configuration-logs', auth, infrastructureController.getConfigurationLogs);

// @route   POST /api/infrastructure/:id/retry-configuration
// @desc    Retry failed Ansible configuration
// @access  Private
router.post('/:id/retry-configuration', auth, infrastructureController.retryAnsibleConfigurationEndpoint);

// =============== PUPPET CONFIGURATION MANAGEMENT ROUTES ===============

// @route   POST /api/infrastructure/:id/puppet/apply
// @desc    Trigger Puppet desired-state enforcement
// @access  Private
router.post('/:id/puppet/apply', auth, infrastructureController.applyPuppet);

// @route   GET /api/infrastructure/:id/puppet/status
// @desc    Get Puppet execution status
// @access  Private
router.get('/:id/puppet/status', auth, infrastructureController.getPuppetStatus);

// @route   GET /api/infrastructure/:id/puppet/logs
// @desc    Get Puppet execution logs
// @access  Private
router.get('/:id/puppet/logs', auth, infrastructureController.getPuppetLogs);

// @route   POST /api/infrastructure/:id/puppet/retry
// @desc    Retry failed Puppet enforcement
// @access  Private
router.post('/:id/puppet/retry', auth, infrastructureController.retryPuppetEndpoint);

// @route   POST /api/infrastructure/:id/puppet/simulate-drift
// @desc    Simulate controlled configuration drift and remediate
// @access  Private
router.post('/:id/puppet/simulate-drift', auth, infrastructureController.simulatePuppetDriftEndpoint);

// =============== NAGIOS MONITORING ROUTES ===============

// @route   POST /api/infrastructure/:id/monitoring/register
// @desc    Register dedicated infrastructure with Nagios Core
// @access  Private
router.post('/:id/monitoring/register', auth, infrastructureController.registerMonitoring);

// @route   GET /api/infrastructure/:id/monitoring/status
// @desc    Get Nagios monitoring status and overall host health
// @access  Private
router.get('/:id/monitoring/status', auth, infrastructureController.getMonitoringStatus);

// @route   GET /api/infrastructure/:id/monitoring/services
// @desc    Get Nagios service checks breakdown
// @access  Private
router.get('/:id/monitoring/services', auth, infrastructureController.getMonitoringServices);

// @route   POST /api/infrastructure/:id/monitoring/deregister
// @desc    Deregister host from Nagios monitoring and remove configuration
// @access  Private
router.post('/:id/monitoring/deregister', auth, infrastructureController.deregisterMonitoring);

module.exports = router;

