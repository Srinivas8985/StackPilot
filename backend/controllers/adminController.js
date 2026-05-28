const Docker = require('dockerode');
const Deployment = require('../models/Deployment');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { isJenkinsAvailable, getRecentBuilds } = require('../services/jenkinsService');
const { startPolling, stopPolling, restartPolling, pollOnce } = require('../services/pollingService');
const { runCleanupCycle } = require('../services/cleanup');

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

// ============================================================
// GET /api/admin/stats — Platform-wide statistics
// ============================================================
exports.getAdminStats = async (req, res) => {
  try {
    const [
      totalDeployments, runningCount, failedCount, stoppedCount,
      autoDeployCount, totalUsers
    ] = await Promise.all([
      Deployment.countDocuments(),
      Deployment.countDocuments({ status: 'running' }),
      Deployment.countDocuments({ status: 'failed' }),
      Deployment.countDocuments({ status: 'stopped' }),
      Deployment.countDocuments({ autoDeployEnabled: true }),
      User.countDocuments()
    ]);

    // Docker system info
    let dockerInfo = { containers: 0, images: 0, memoryUsage: '0MB', cpuUsage: '0%' };
    try {
      const info = await docker.info();
      dockerInfo = {
        containers: info.ContainersRunning || 0,
        images: info.Images || 0,
        memoryUsage: `${Math.round((info.MemTotal || 0) / 1024 / 1024)}MB total`,
        cpuUsage: `${info.NCPU || 0} CPUs`
      };
    } catch (_) {}

    // Jenkins status
    const jenkinsOnline = await isJenkinsAvailable();
    let recentBuilds = [];
    if (jenkinsOnline) {
      recentBuilds = await getRecentBuilds(5);
    }

    // Recent deployments
    const recentDeployments = await Deployment.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name status repoUrl branch createdAt autoDeployEnabled lastCommitSha jenkinsBuildStatus user')
      .populate('user', 'name email');

    // Deployment timeline (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const timeline = await Deployment.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          successes: { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
          failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const config = await SystemConfig.getConfig();

    res.json({
      deployments: { total: totalDeployments, running: runningCount, failed: failedCount, stopped: stoppedCount, autoDeploy: autoDeployCount },
      users: { total: totalUsers },
      docker: dockerInfo,
      jenkins: { online: jenkinsOnline, recentBuilds },
      polling: { enabled: config.globalPollingEnabled, interval: config.defaultPollingIntervalMs, cicdPaused: config.cicdPaused },
      recentDeployments,
      timeline
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET /api/admin/config — Get system config
// ============================================================
exports.getConfig = async (req, res) => {
  try {
    const config = await SystemConfig.getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// PUT /api/admin/config — Update system config
// ============================================================
exports.updateConfig = async (req, res) => {
  try {
    const config = await SystemConfig.getConfig();
    const { globalPollingEnabled, defaultPollingIntervalMs, maxDeploymentsPerUser, cicdPaused } = req.body;

    if (globalPollingEnabled !== undefined) config.globalPollingEnabled = globalPollingEnabled;
    if (defaultPollingIntervalMs !== undefined) config.defaultPollingIntervalMs = Math.max(10000, defaultPollingIntervalMs);
    if (maxDeploymentsPerUser !== undefined) config.maxDeploymentsPerUser = maxDeploymentsPerUser;
    if (cicdPaused !== undefined) config.cicdPaused = cicdPaused;

    await config.save();

    // Restart polling with new interval if enabled
    if (config.globalPollingEnabled && !config.cicdPaused) {
      await restartPolling();
    } else {
      stopPolling();
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// POST /api/admin/polling/trigger — Force a polling cycle
// ============================================================
exports.triggerPolling = async (req, res) => {
  try {
    await pollOnce();
    res.json({ msg: 'Polling cycle triggered' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// POST /api/admin/cleanup — Run cleanup cycle
// ============================================================
exports.runCleanup = async (req, res) => {
  try {
    await runCleanupCycle();
    res.json({ msg: 'Cleanup cycle completed' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET /api/admin/users — List all users
// ============================================================
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// PUT /api/admin/users/:id/role — Update user role
// ============================================================
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ msg: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET /api/admin/deployments — All deployments (admin view)
// ============================================================
exports.getAllDeployments = async (req, res) => {
  try {
    const deployments = await Deployment.find()
      .sort({ createdAt: -1 })
      .populate('user', 'name email');
    res.json(deployments);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// POST /api/admin/deployments/:id/redeploy — Admin force redeploy
// ============================================================
exports.adminRedeploy = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });

    deployment.redeployHistory.push({
      triggeredAt: new Date(),
      trigger: 'admin',
      status: 'queued'
    });
    deployment.status = 'queued';
    deployment.containerId = null;
    deployment.port = null;
    deployment.deploymentUrl = null;
    deployment.logs = [];
    await deployment.save();

    // Try removing old container
    try {
      const { execFileSync } = require('child_process');
      execFileSync('docker', ['rm', '-f', `sp-${deployment._id}`], { stdio: 'ignore' });
    } catch (_) {}

    const { triggerInternalRedeploy } = require('./deploymentController');
    if (typeof triggerInternalRedeploy === 'function') {
      triggerInternalRedeploy(deployment._id.toString());
    }

    res.json({ msg: 'Redeploy triggered', deployment });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// DELETE /api/admin/deployments/:id — Admin delete deployment
// ============================================================
exports.adminDelete = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });

    const { execFileSync } = require('child_process');
    try { execFileSync('docker', ['rm', '-f', `sp-${deployment._id}`], { stdio: 'ignore' }); } catch (_) {}
    if (deployment.containerId) {
      try { execFileSync('docker', ['rm', '-f', deployment.containerId], { stdio: 'ignore' }); } catch (_) {}
    }
    try {
      const imageName = `stackpilot-${deployment._id}`.toLowerCase();
      execFileSync('docker', ['rmi', '-f', imageName], { stdio: 'ignore' });
    } catch (_) {}

    await Deployment.findByIdAndDelete(deployment._id);
    res.json({ msg: 'Deployment deleted by admin' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// POST /api/admin/docker/prune — Prune Docker system
// ============================================================
exports.dockerPrune = async (req, res) => {
  try {
    const result = {};
    try {
      const containerPrune = await docker.pruneContainers();
      result.containers = containerPrune;
    } catch (_) {}
    try {
      const imagePrune = await docker.pruneImages();
      result.images = imagePrune;
    } catch (_) {}
    try {
      const volumePrune = await docker.pruneVolumes();
      result.volumes = volumePrune;
    } catch (_) {}

    res.json({ msg: 'Docker prune completed', result });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
