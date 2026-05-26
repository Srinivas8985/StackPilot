const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const auth = require('../middleware/auth');
const deploymentController = require('../controllers/deploymentController');

// =============== WIZARD ENDPOINTS ===============

// @route   POST api/deployments/analyze
// @desc    Clone + analyze a repo (wizard step 1)
// @access  Private
router.post('/analyze', auth, [
  check('repoUrl', 'Repository URL is required').not().isEmpty()
], deploymentController.analyzeRepo);

// @route   POST api/deployments/generate-dockerfile
// @desc    Generate AI-powered Dockerfile (wizard step 2)
// @access  Private
router.post('/generate-dockerfile', auth, [
  check('repoUrl', 'Repository URL is required').not().isEmpty()
], deploymentController.generateDockerfileEndpoint);

// =============== STATS (must be before /:id) ===============

// @route   GET api/deployments/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', auth, deploymentController.getStats);

// =============== CRUD ===============

// @route   GET api/deployments
// @desc    Get all deployments for user
// @access  Private
router.get('/', auth, deploymentController.getDeployments);

// @route   GET api/deployments/:id
// @desc    Get single deployment
// @access  Private
router.get('/:id', auth, deploymentController.getDeployment);

// @route   GET api/deployments/:id/logs
// @desc    Get deployment logs
// @access  Private
router.get('/:id/logs', auth, deploymentController.getDeploymentLogs);

// @route   POST api/deployments
// @desc    Create & trigger deployment (wizard final step)
// @access  Private
router.post('/', auth, [
  check('name', 'Deployment name is required').not().isEmpty(),
  check('repoUrl', 'Repository URL is required').not().isEmpty()
], deploymentController.createDeployment);

// @route   POST api/deployments/:id/stop
// @desc    Stop a running deployment
// @access  Private
router.post('/:id/stop', auth, deploymentController.stopDeployment);

// @route   POST api/deployments/:id/start
// @desc    Start a stopped deployment without rebuilding
// @access  Private
router.post('/:id/start', auth, deploymentController.startDeployment);

// @route   POST api/deployments/:id/redeploy
// @desc    Redeploy an existing deployment
// @access  Private
router.post('/:id/redeploy', auth, deploymentController.redeployDeployment);

// @route   DELETE api/deployments/:id
// @desc    Delete a deployment
// @access  Private
router.delete('/:id', auth, deploymentController.deleteDeployment);

// =============== CI/CD ENDPOINTS ===============

// @route   POST api/deployments/:id/auto-deploy
// @desc    Toggle auto-deploy for a deployment
// @access  Private
router.post('/:id/auto-deploy', auth, deploymentController.toggleAutoDeploy);

// @route   POST api/deployments/:id/force-check
// @desc    Force check for new commits
// @access  Private
router.post('/:id/force-check', auth, deploymentController.forceCheck);

// @route   POST api/deployments/update-runtime
// @desc    Update runtime information from Jenkins CI/CD
// @access  Public (from Jenkins)
router.post('/update-runtime', deploymentController.updateRuntime);

module.exports = router;
