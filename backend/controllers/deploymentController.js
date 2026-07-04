const { execSync, execFileSync, exec, execFile } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);
const path = require('path');
const fs = require('fs');
const Docker = require('dockerode');
const Deployment = require('../models/Deployment');
const { analyzeRepository, getAIContext } = require('../services/repoAnalyzer');
const { generateDockerfile } = require('../services/dockerfileGenerator');
const { cleanupRepo } = require('../services/cleanup');
const { forceCheckDeployment } = require('../services/pollingService');
const githubService = require('../services/githubService');
const User = require('../models/User');
const jenkinsService = require('../services/jenkinsService');

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
const REPOS_DIR = '/tmp/stackpilot/repos';
const REPOS_TEMP_DIR = path.join(REPOS_DIR, 'temp');

// Port pool management
const PORT_RANGE_START = 4000;
const PORT_RANGE_END = 4999;
const MAX_ACTIVE_DEPLOYMENTS = 20;

const getAvailablePort = async () => {
  const usedPorts = await Deployment.find({ port: { $ne: null } }).distinct('port');
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.includes(port)) return port;
  }
  throw new Error('No available ports');
};

// Helper: push log entry
const pushLog = async (deploymentId, message, type = 'info') => {
  await Deployment.findByIdAndUpdate(deploymentId, {
    $push: { logs: { message, type, timestamp: new Date() } }
  });
};

// Validate GitHub URL
const isValidRepoUrl = (url) => {
  // Allow local paths (for testing) and GitHub/GitLab URLs
  if (fs.existsSync(url)) return true;
  const pattern = /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+\/.+/i;
  return pattern.test(url);
};

// Sanitize environment variable keys
const sanitizeEnvKey = (key) => {
  return key.replace(/[^A-Za-z0-9_]/g, '');
};

// ============================================================
// STEP 1: Clone + Analyze (wizard step)
// POST /api/deployments/analyze
// ============================================================
exports.analyzeRepo = async (req, res) => {
  const { repoUrl, branch = 'main' } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ msg: 'Repository URL is required' });
  }

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ msg: 'Invalid repository URL. Only GitHub, GitLab, and Bitbucket URLs are supported.' });
  }

  // Use a temporary ID for the analysis clone
  const tempId = `analyze-${Date.now()}`;
  const cloneDir = path.join(REPOS_TEMP_DIR, tempId);

  try {
    if (!fs.existsSync(REPOS_TEMP_DIR)) fs.mkdirSync(REPOS_TEMP_DIR, { recursive: true });
    if (fs.existsSync(cloneDir)) {
      try { await fs.promises.rm(cloneDir, { recursive: true, force: true }); } catch (_) { }
    }

    execFileSync('git', ['clone', '--depth', '1', '--branch', branch, repoUrl, cloneDir], {
      timeout: 60000
    });

    const analysis = analyzeRepository(cloneDir);

    // DO NOT clean up here. We keep the temp folder for the rest of the wizard and pipeline.
    res.json({ analysis, tempId });
  } catch (err) {
    // Cleanup on failure
    try { if (fs.existsSync(cloneDir)) fs.promises.rm(cloneDir, { recursive: true, force: true }).catch(() => { }); } catch (_) { }
    console.error('Analyze error:', err.message);
    res.status(400).json({ msg: `Failed to clone/analyze: ${err.message.substring(0, 200)}` });
  }
};

// ============================================================
// STEP 2: Generate Dockerfile (wizard step)
// POST /api/deployments/generate-dockerfile
// ============================================================
exports.generateDockerfileEndpoint = async (req, res) => {
  const { repoUrl, branch = 'main', projectType, deployFolder = '.', buildConfig = {}, workspaceId } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ msg: 'Repository URL is required' });
  }

  // Use existing workspace if provided, otherwise create a new one (fallback)
  const tempId = workspaceId || `dockerfile-${Date.now()}`;
  const cloneDir = path.join(REPOS_TEMP_DIR, tempId);

  try {
    if (!fs.existsSync(REPOS_TEMP_DIR)) fs.mkdirSync(REPOS_TEMP_DIR, { recursive: true });

    // Only clone if it doesn't already exist (i.e. not using a passed workspace)
    if (!fs.existsSync(cloneDir)) {
      execFileSync('git', ['clone', '--depth', '1', '--branch', branch, repoUrl, cloneDir], {
        timeout: 180000
      });
    }

    const aiContext = getAIContext(cloneDir, deployFolder);
    const exposedPort = buildConfig.exposedPort || 3000;

    const dockerfile = await generateDockerfile({
      projectType,
      aiContext,
      buildConfig,
      exposedPort
    });

    // DO NOT clean up. The pipeline will reuse or clean it up.
    res.json({ dockerfile, workspaceId: tempId });
  } catch (err) {
    try { if (fs.existsSync(cloneDir)) fs.promises.rm(cloneDir, { recursive: true, force: true }).catch(() => { }); } catch (_) { }
    console.error('Dockerfile generation error:', err.message);
    res.status(500).json({ msg: `Failed to generate Dockerfile: ${err.message.substring(0, 200)}` });
  }
};

// ============================================================
// STEP 3: Create + Deploy (wizard final step)
// POST /api/deployments
// ============================================================
exports.createDeployment = async (req, res) => {
  const {
    name, repoUrl, branch = 'main', environment = 'development',
    deployFolder = '.', envVars = [],
    buildConfig = {}, generatedDockerfile, useCustomDockerfile = false, workspaceId
  } = req.body;

  let { projectType } = req.body;
  if (projectType === '') projectType = null;

  if (!name || !repoUrl) {
    return res.status(400).json({ msg: 'Name and repository URL are required' });
  }

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ msg: 'Invalid repository URL' });
  }

  // Check active deployment limit
  const activeCount = await Deployment.countDocuments({ user: req.user.id, status: 'running' });
  if (activeCount >= MAX_ACTIVE_DEPLOYMENTS) {
    return res.status(400).json({ msg: `Maximum ${MAX_ACTIVE_DEPLOYMENTS} active deployments reached. Stop some before creating new ones.` });
  }

  // Sanitize env vars
  const sanitizedEnvVars = envVars
    .filter(e => e.key && e.value)
    .map(e => ({ key: sanitizeEnvKey(e.key), value: e.value }));

  try {
    const deployment = new Deployment({
      user: req.user.id,
      name,
      repoUrl,
      branch,
      environment,
      projectType,
      deployFolder,
      envVars: sanitizedEnvVars,
      buildConfig: {
        installCommand: buildConfig.installCommand || null,
        buildCommand: buildConfig.buildCommand || null,
        startCommand: buildConfig.startCommand || null,
        exposedPort: buildConfig.exposedPort || 3000,
        nodeVersion: buildConfig.nodeVersion || '20'
      },
      generatedDockerfile: generatedDockerfile || null,
      useCustomDockerfile: useCustomDockerfile || false,
      status: 'queued'
    });
    await deployment.save();

    // Start async deployment pipeline
    runDeploymentPipeline(deployment._id, workspaceId);

    res.status(201).json(deployment);

    // After responding, try to auto-create webhook if github is connected
    (async () => {
      try {
        const user = await User.findById(req.user.id);
        if (user && user.githubAccessToken && repoUrl.includes('github.com')) {
          const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
          if (match) {
            await githubService.createWebhook(match[1], match[2], user.githubAccessToken);
            console.log(`[Webhook] Auto-created for ${repoUrl}`);
          }
        }
      } catch (err) {
        console.error(`[Webhook] Auto-create failed:`, err.message);
      }
    })();

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// THE DEPLOYMENT PIPELINE — runs asynchronously
// ============================================================
async function runDeploymentPipeline(deploymentId, workspaceId) {
  if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });

  try {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) return;

    const cloneDir = path.join(REPOS_DIR, `${deployment._id}`);

    // ---------- STEP 1: Clone ----------
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'cloning' });

    try {
      if (fs.existsSync(cloneDir)) {
        await fs.promises.rm(cloneDir, { recursive: true, force: true });
      }

      const tempWorkspace = workspaceId ? path.join(REPOS_TEMP_DIR, workspaceId) : null;
      if (tempWorkspace && fs.existsSync(tempWorkspace)) {
        await pushLog(deploymentId, `Linking existing analyzed workspace`, 'info');
        fs.renameSync(tempWorkspace, cloneDir);
        await pushLog(deploymentId, 'Workspace linked successfully', 'success');
      } else {
        await pushLog(deploymentId, `Cloning repository: ${deployment.repoUrl}`, 'info');
        await execFilePromise('git', ['clone', '--depth', '1', '--branch', deployment.branch, deployment.repoUrl, cloneDir], {
          timeout: 180000
        });
        await pushLog(deploymentId, 'Repository cloned successfully', 'success');
      }
    } catch (cloneErr) {
      await pushLog(deploymentId, `Clone failed: ${cloneErr.message}`, 'error');
      await Deployment.findByIdAndUpdate(deploymentId, { status: 'failed' });
      return;
    }

    // ---------- STEP 2: Determine build context ----------
    const buildContextDir = path.join(cloneDir, deployment.deployFolder || '.');

    if (!fs.existsSync(buildContextDir)) {
      await pushLog(deploymentId, `Deploy folder "${deployment.deployFolder}" not found`, 'error');
      await Deployment.findByIdAndUpdate(deploymentId, { status: 'failed' });
      cleanupRepo(deploymentId);
      return;
    }

    // ---------- STEP 3: Ensure Dockerfile ----------
    let currentDep = await Deployment.findByIdAndUpdate(deploymentId, { status: 'generating' });
    if (!currentDep) { cleanupRepo(deploymentId); return; }

    const dockerfilePath = path.join(buildContextDir, 'Dockerfile');

    if (deployment.useCustomDockerfile && fs.existsSync(dockerfilePath)) {
      await pushLog(deploymentId, 'Using Existing Dockerfile', 'info');
    } else if (deployment.generatedDockerfile) {
      // Write the AI-generated or user-edited Dockerfile
      fs.writeFileSync(dockerfilePath, deployment.generatedDockerfile);
      await pushLog(deploymentId, 'Using Generated Dockerfile', 'success');
    } else if (!fs.existsSync(dockerfilePath)) {
      // Auto-generate via AI
      await pushLog(deploymentId, 'No Dockerfile found — generating with AI…', 'info');
      try {
        const aiContext = getAIContext(cloneDir, deployment.deployFolder || '.');
        const dockerfile = await generateDockerfile({
          projectType: deployment.projectType,
          aiContext,
          buildConfig: deployment.buildConfig || {},
          exposedPort: deployment.buildConfig?.exposedPort || 3000
        });
        fs.writeFileSync(dockerfilePath, dockerfile);
        await Deployment.findByIdAndUpdate(deploymentId, { generatedDockerfile: dockerfile });
        await pushLog(deploymentId, 'AI Dockerfile generated successfully', 'success');
      } catch (aiErr) {
        await pushLog(deploymentId, `AI generation failed, using fallback: ${aiErr.message}`, 'warning');
        const { generateFallbackDockerfile } = require('../services/dockerfileGenerator');
        const fallback = generateFallbackDockerfile({
          projectType: deployment.projectType || 'express',
          buildConfig: deployment.buildConfig || {},
          exposedPort: deployment.buildConfig?.exposedPort || 3000
        });
        fs.writeFileSync(dockerfilePath, fallback);
      }
    }

    // ---------- STEP 4: Build Docker image ----------
    currentDep = await Deployment.findByIdAndUpdate(deploymentId, { status: 'building' });
    if (!currentDep) { cleanupRepo(deploymentId); return; }

    await pushLog(deploymentId, 'Building Docker image…', 'info');

    const imageName = `stackpilot-${deployment._id}`.toLowerCase();

    try {
      await execPromise(`docker build -t ${imageName} "${buildContextDir}"`, { timeout: 300000 });
      await pushLog(deploymentId, `Image built: ${imageName}`, 'success');
    } catch (buildErr) {
      await pushLog(deploymentId, `Build failed: ${buildErr.message}`, 'error');
      await Deployment.findByIdAndUpdate(deploymentId, { status: 'failed' });
      cleanupRepo(deploymentId);
      return;
    }

    // ---------- STEP 5: Start container ----------
    currentDep = await Deployment.findByIdAndUpdate(deploymentId, { status: 'deploying' });
    if (!currentDep) {
      // It was deleted during build. Clean up the built image so it doesn't leak.
      try { await execPromise(`docker rmi -f ${imageName}`); } catch (_) { }
      cleanupRepo(deploymentId);
      return;
    }
    await pushLog(deploymentId, 'Starting container…', 'info');

    const exposedPort = deployment.buildConfig?.exposedPort || 3000;

    // Assign and reserve port immediately in DB to prevent race conditions
    const port = await getAvailablePort();
    await Deployment.findByIdAndUpdate(deploymentId, { port });

    // Build environment variables for the container
    const containerEnv = (deployment.envVars || []).map(e => `${e.key}=${e.value}`);
    containerEnv.push(`PORT=${exposedPort}`);

    // Remove any leftover container with the same name (handles orphan containers)
    const containerName = `sp-${deployment._id}`;
    try {
      await execPromise(`docker rm -f ${containerName}`);
      await pushLog(deploymentId, 'Removed leftover container', 'info');
    } catch (_) { /* no old container — fine */ }

    try {
      const container = await docker.createContainer({
        Image: imageName,
        name: containerName,
        ExposedPorts: { [`${exposedPort}/tcp`]: {} },
        Env: containerEnv,
        HostConfig: {
          PortBindings: { [`${exposedPort}/tcp`]: [{ HostPort: String(port) }] },
          Memory: 512 * 1024 * 1024, // 512MB limit
          CpuShares: 256
        }
      });
      await container.start();

      const HOST = process.env.DEPLOYMENT_URL || 'localhost';
      const deploymentUrl = `http://${HOST}:${port}`;

      await Deployment.findByIdAndUpdate(deploymentId, {
        status: 'running',
        containerId: container.id,
        imageId: imageName,
        deploymentUrl,
        lastHealthCheck: new Date()
      });

      await pushLog(deploymentId, `Container started on port ${port}`, 'success');
      await pushLog(deploymentId, `Deployment URL: ${deploymentUrl}`, 'success');
    } catch (containerErr) {
      await pushLog(deploymentId, `Container start failed: ${containerErr.message}`, 'error');
      await Deployment.findByIdAndUpdate(deploymentId, { status: 'failed' });
    }

    // ---------- STEP 6: Cleanup temp repo ----------
    cleanupRepo(deploymentId);
    await pushLog(deploymentId, 'Temporary files cleaned up', 'info');

  } catch (err) {
    console.error('Pipeline error:', err);
    await pushLog(deploymentId, `Pipeline error: ${err.message}`, 'error');
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'failed' });
    cleanupRepo(deploymentId);
  }
}

// ============================================================
// CRUD & MANAGEMENT ENDPOINTS
// ============================================================

// GET /api/deployments
exports.getDeployments = async (req, res) => {
  try {
    const deployments = await Deployment.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    res.json(deployments);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/deployments/:id
exports.getDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    res.json(deployment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/deployments/:id/stop
exports.stopDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Try removing by containerId first, then by name as fallback
    const idsToTry = [deployment.containerId, `sp-${deployment._id}`].filter(Boolean);
    for (const cid of idsToTry) {
      try {
        const container = docker.getContainer(cid);
        await container.stop().catch(() => { });
        await container.remove({ force: true });
        await pushLog(deployment._id, 'Container stopped and removed', 'info');
        break;
      } catch (dockerErr) {
        await pushLog(deployment._id, `Stop warning: ${dockerErr.message}`, 'warning');
      }
    }

    deployment.status = 'stopped';
    deployment.containerId = null;
    deployment.port = null;
    deployment.deploymentUrl = null;
    await deployment.save();

    res.json(deployment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/deployments/:id/start
exports.startDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    if (deployment.status === 'running') {
      return res.status(400).json({ msg: 'Deployment is already running' });
    }

    const imageName = `stackpilot-${deployment._id}`.toLowerCase();

    // Check if image exists locally
    try {
      execFileSync('docker', ['image', 'inspect', imageName], { stdio: 'ignore' });
    } catch (_) {
      return res.status(400).json({ msg: 'No Docker image found. Please Redeploy instead.' });
    }

    // Force-remove any existing leftover container by name
    const containerName = `sp-${deployment._id}`;
    try {
      await execFilePromise('docker', ['rm', '-f', containerName]);
    } catch (_) { }

    deployment.status = 'deploying';
    await deployment.save();
    await pushLog(deployment._id, 'Starting container from existing image…', 'info');

    const exposedPort = deployment.buildConfig?.exposedPort || 3000;
    const port = await getAvailablePort();

    const containerEnv = (deployment.envVars || []).map(e => `${e.key}=${e.value}`);
    containerEnv.push(`PORT=${exposedPort}`);

    try {
      const container = await docker.createContainer({
        Image: imageName,
        name: containerName,
        ExposedPorts: { [`${exposedPort}/tcp`]: {} },
        Env: containerEnv,
        HostConfig: {
          PortBindings: { [`${exposedPort}/tcp`]: [{ HostPort: String(port) }] },
          Memory: 512 * 1024 * 1024,
          CpuShares: 256
        }
      });
      await container.start();

      const HOST = process.env.HOST || 'localhost';
      const deploymentUrl = `http://${HOST}:${port}`;

      deployment.status = 'running';
      deployment.containerId = container.id;
      deployment.port = port;
      deployment.deploymentUrl = deploymentUrl;
      deployment.lastHealthCheck = new Date();
      await deployment.save();

      await pushLog(deployment._id, `Container started on port ${port}`, 'success');
      res.json(deployment);
    } catch (containerErr) {
      deployment.status = 'failed';
      await deployment.save();
      await pushLog(deployment._id, `Start failed: ${containerErr.message}`, 'error');
      res.status(500).json({ msg: `Failed to start container: ${containerErr.message}` });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/deployments/:id/redeploy
exports.redeployDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Force-remove existing container and image
    try {
      await execPromise(`docker rm -f sp-${deployment._id}`);
      if (deployment.containerId) {
        await execPromise(`docker rm -f ${deployment.containerId}`);
      }

      const imageName = `stackpilot-${deployment._id}`.toLowerCase();
      await execPromise(`docker rmi -f ${imageName}`);
      await pushLog(deployment._id, 'Old container and image removed', 'info');
    } catch (_) { /* may already be gone */ }

    deployment.status = 'queued';
    deployment.containerId = null;
    deployment.port = null;
    deployment.deploymentUrl = null;
    deployment.logs = [];
    await deployment.save();

    runDeploymentPipeline(deployment._id);
    res.json(deployment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// DELETE /api/deployments/:id
exports.deleteDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Cleanup container
    try {
      await execPromise(`docker rm -f sp-${deployment._id}`);
    } catch (_) { }
    if (deployment.containerId) {
      try {
        await execPromise(`docker rm -f ${deployment.containerId}`);
      } catch (_) { }
    }

    // Cleanup repo
    cleanupRepo(deployment._id);

    // Cleanup docker image
    try {
      const imageName = `stackpilot-${deployment._id}`.toLowerCase();
      await execPromise(`docker rmi -f ${imageName}`);
    } catch (_) { }

    await Deployment.findByIdAndDelete(deployment._id);
    res.json({ msg: 'Deployment deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/deployments/:id/logs
exports.getDeploymentLogs = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Copy pipeline logs
    let allLogs = [...deployment.logs];

    // If container exists, fetch its recent stdout/stderr
    if (deployment.containerId) {
      try {
        const container = docker.getContainer(deployment.containerId);
        const logStream = await container.logs({
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: 50
        });

        // Parse Docker multiplexed log stream (simplistic parsing for strings)
        // Docker attaches an 8-byte header to each line. We can clean it up for basic string viewing.
        const logString = logStream.toString('utf8');
        const logLines = logString.split('\n').filter(Boolean);

        if (logLines.length > 0) {
          allLogs.push({ message: '--- CONTAINER RUNTIME LOGS ---', type: 'info', timestamp: new Date() });
          for (const line of logLines) {
            // Remove the 8-byte Docker multiplex header (sometimes contains unprintable chars)
            const cleanLine = line.replace(/^[\u0000-\u001F\u007F-\u009F]+/, '').trim();
            if (cleanLine) {
              allLogs.push({ message: cleanLine, type: 'info', timestamp: new Date() });
            }
          }
        }
      } catch (containerLogErr) {
        // Ignore if we can't fetch container logs (e.g., container removed)
      }
    }

    res.json(allLogs);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/deployments/stats
exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const [total, running, failed, stopped] = await Promise.all([
      Deployment.countDocuments({ user: userId }),
      Deployment.countDocuments({ user: userId, status: 'running' }),
      Deployment.countDocuments({ user: userId, status: 'failed' }),
      Deployment.countDocuments({ user: userId, status: 'stopped' })
    ]);

    const recent = await Deployment.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(7)
      .select('name status createdAt');

    res.json({ total, running, failed, stopped, recent });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// CI/CD ENDPOINTS
// ============================================================

// POST /api/deployments/:id/auto-deploy — Toggle auto-deploy
exports.toggleAutoDeploy = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const { enabled } = req.body;
    deployment.autoDeployEnabled = enabled !== undefined ? enabled : !deployment.autoDeployEnabled;

    // If enabling for first time, fetch initial commit SHA
    if (deployment.autoDeployEnabled && !deployment.lastCommitSha && deployment.repoUrl.includes('github.com')) {
      const { fetchLatestCommit } = require('../services/pollingService');
      const commit = await fetchLatestCommit(deployment.repoUrl, deployment.branch);
      if (commit) {
        deployment.lastCommitSha = commit.sha;
        deployment.lastCheckedAt = new Date();
      }
    }

    await deployment.save();
    await pushLog(deployment._id, `Auto-deploy ${deployment.autoDeployEnabled ? 'enabled' : 'disabled'}`, 'info');
    res.json(deployment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/deployments/:id/force-check — Force check for new commits
exports.forceCheck = async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ msg: 'Deployment not found' });
    if (deployment.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const result = await forceCheckDeployment(req.params.id);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// INTERNAL: Trigger redeploy (used by polling service)
// ============================================================
exports.triggerInternalRedeploy = function (deploymentId) {
  // Same logic as the redeploy endpoint but without auth check
  (async () => {
    try {
      const deployment = await Deployment.findById(deploymentId);
      if (!deployment) return;

      // Remove old container
      try {
        await execPromise(`docker rm -f sp-${deployment._id}`);
        if (deployment.containerId) {
          await execPromise(`docker rm -f ${deployment.containerId}`);
        }
        const imageName = `stackpilot-${deployment._id}`.toLowerCase();
        await execPromise(`docker rmi -f ${imageName}`);
      } catch (_) { }

      deployment.status = 'queued';
      deployment.containerId = null;
      deployment.port = null;
      deployment.deploymentUrl = null;
      deployment.logs = [];
      await deployment.save();

      runDeploymentPipeline(deployment._id);
    } catch (err) {
      console.error(`[Internal Redeploy] Error for ${deploymentId}:`, err.message);
    }
  })();
};

// ============================================================
// API: Update runtime info from Jenkins CI/CD
// ============================================================
exports.updateRuntime = async (req, res) => {
  try {
    const {
      deploymentId,
      containerName,
      imageName,
      status,
      port,
      lastCommitSha,
      buildStatus,
      redeployedAt
    } = req.body;

    if (!deploymentId) {
      return res.status(400).json({ msg: 'Deployment ID is required' });
    }

    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      return res.status(404).json({ msg: 'Deployment not found' });
    }

    // Update runtime metadata
    if (containerName) deployment.containerId = containerName;
    if (imageName) deployment.imageId = imageName;
    if (status) deployment.status = status;
    if (port) {
      let hostStr = 'localhost';
      if (process.env.PUBLIC_API_URL) {
        try { hostStr = new URL(process.env.PUBLIC_API_URL).hostname; } catch(e) {}
      }
      const host = process.env.HOST || hostStr;
      deployment.port = port;
      deployment.deploymentUrl = `http://${host}:${port}`;
    }
    if (lastCommitSha) deployment.lastCommitSha = lastCommitSha;
    if (buildStatus) deployment.jenkinsBuildStatus = buildStatus;

    // Create redeploy history entry
    deployment.redeployCount = (deployment.redeployCount || 0) + 1;
    deployment.redeployHistory.push({
      triggeredAt: redeployedAt || new Date(),
      trigger: 'jenkins',
      commitSha: lastCommitSha || deployment.lastCommitSha,
      status: buildStatus === 'success' ? 'success' : 'failed'
    });

    await deployment.save();

    res.json(deployment);
  } catch (err) {
    console.error('[Update Runtime API Error]', err.message);
    res.status(500).json({ msg: 'Server error updating runtime' });
  }
};

// ============================================================
// API: Handle GitHub Webhook (Push Events)
// ============================================================
exports.handleGitHubWebhook = async (req, res) => {
  try {
    // 1. Verify signature
    if (!githubService.verifyWebhookSignature(req)) {
      return res.status(401).json({ msg: 'Invalid webhook signature' });
    }

    const event = req.headers['x-github-event'];

    // Only care about push events
    if (event !== 'push') {
      return res.status(200).json({ msg: 'Ignored non-push event' });
    }

    const { repository, ref, head_commit } = req.body;
    if (!repository || !ref || !head_commit) {
      return res.status(200).json({ msg: 'Incomplete push data' });
    }

    const repoUrl = repository.clone_url || repository.html_url;
    // e.g. "refs/heads/main" -> "main"
    const branch = ref.replace('refs/heads/', '');
    const commitSha = head_commit.id;

    console.log(`[Webhook] Push detected on ${repoUrl} branch ${branch}`);

    // 2. Find all deployments tracking this repo & branch with autoDeployEnabled
    const deployments = await Deployment.find({
      repoUrl: { $regex: new RegExp(repository.name, 'i') },
      branch: branch,
      autoDeployEnabled: true
    });

    if (deployments.length === 0) {
      return res.status(200).json({ msg: 'No active auto-deployments for this repo/branch' });
    }

    // 3. Trigger deployments
    for (const dep of deployments) {
      if (dep.lastCommitSha === commitSha) {
        console.log(`[Webhook] Skipping ${dep.name}, already on commit ${commitSha}`);
        continue;
      }

      console.log(`[Webhook] Triggering redeploy for ${dep.name}`);

      // Update DB
      dep.lastCommitSha = commitSha;
      dep.lastCheckedAt = new Date();
      await dep.save();

      await Deployment.findByIdAndUpdate(dep._id, {
        $push: {
          logs: {
            message: `GitHub Webhook: Push detected (${commitSha.slice(0, 7)}: ${head_commit.message})`,
            type: 'info',
            timestamp: new Date()
          }
        }
      });

      // Trigger Jenkins (or internal redeploy)
      await jenkinsService.triggerBuild({
        deploymentId: dep._id.toString(),
        repoUrl: dep.repoUrl,
        branch: dep.branch,
        projectType: dep.projectType || 'auto',
        deployFolder: dep.deployFolder || '.',
        port: dep.port || 3000
      });
      console.log(`[Webhook] Jenkins Triggered for ${dep.name}`);
    }

    res.status(200).json({ msg: `Webhook processed, triggered ${deployments.length} deployments` });

  } catch (err) {
    console.error('[Webhook Error]', err.message);
    res.status(500).json({ msg: 'Webhook processing error' });
  }
};
