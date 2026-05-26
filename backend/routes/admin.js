const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const adminController = require('../controllers/adminController');

// All admin routes require auth + admin role
router.use(auth, admin);

// @route   GET api/admin/stats
// @desc    Platform-wide statistics
router.get('/stats', adminController.getAdminStats);

// @route   GET api/admin/config
// @desc    Get system configuration
router.get('/config', adminController.getConfig);

// @route   PUT api/admin/config
// @desc    Update system configuration
router.put('/config', adminController.updateConfig);

// @route   POST api/admin/polling/trigger
// @desc    Force a polling cycle
router.post('/polling/trigger', adminController.triggerPolling);

// @route   POST api/admin/cleanup
// @desc    Run cleanup cycle
router.post('/cleanup', adminController.runCleanup);

// @route   GET api/admin/users
// @desc    List all users
router.get('/users', adminController.getUsers);

// @route   PUT api/admin/users/:id/role
// @desc    Update user role
router.put('/users/:id/role', adminController.updateUserRole);

// @route   GET api/admin/deployments
// @desc    Get all deployments (admin view)
router.get('/deployments', adminController.getAllDeployments);

// @route   POST api/admin/deployments/:id/redeploy
// @desc    Admin force redeploy
router.post('/deployments/:id/redeploy', adminController.adminRedeploy);

// @route   DELETE api/admin/deployments/:id
// @desc    Admin delete deployment
router.delete('/deployments/:id', adminController.adminDelete);

// @route   POST api/admin/docker/prune
// @desc    Prune Docker system
router.post('/docker/prune', adminController.dockerPrune);

module.exports = router;
