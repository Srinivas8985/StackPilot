const { execSync, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const Docker = require('dockerode');
const Deployment = require('../models/Deployment');
const { analyzeRepository, getAIContext } = require('../services/repoAnalyzer');
const { generateDockerfile } = require('../services/dockerfileGenerator');
const { cleanupRepo } = require('../services/cleanup');

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '//./pipe/docker_engine' });
const REPOS_DIR = path.join(__dirname, '..', 'repos');

// Port pool management
const PORT_RANGE_START = 4000;
const PORT_RANGE_END = 4999;
const MAX_ACTIVE_DEPLOYMENTS = 20;

const getAvailablePort = async () => {
  const usedPorts = await Deployment.find({ status: 'running' }).distinct('port');
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
  const cloneDir = path.join(REPOS_DIR, tempId);

  try {
    if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });
    if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} "${cloneDir}"`, {
      timeout: 60000
    });

    const analysis = analyzeRepository(cloneDir);

    // Clean up immediately — we'll clone again during actual deployment
    fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    res.json({ analysis, tempId });
  } catch (err) {
    // Cleanup on failure
    try { if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
    console.error('Analyze error:', err.message);
    res.status(400).json({ msg: `Failed to clone/analyze: ${err.message.substring(0, 200)}` });
  }
};

// ============================================================
// STEP 2: Generate Dockerfile (wizard step)
// POST /api/deployments/generate-dockerfile
// ============================================================
exports.generateDockerfileEndpoint = async (req, res) => {
  const { repoUrl, branch = 'main', projectType, deployFolder = '.', buildConfig = {} } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ msg: 'Repository URL is required' });
  }

  const tempId = `dockerfile-${Date.now()}`;
  const cloneDir = path.join(REPOS_DIR, tempId);

  try {
    if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });
    if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} "${cloneDir}"`, {
      timeout: 180000
    });

    const aiContext = getAIContext(cloneDir, deployFolder);
    const exposedPort = buildConfig.exposedPort || 3000;

    const dockerfile = await generateDockerfile({
      projectType,
      aiContext,
      buildConfig,
      exposedPort
    });

    // Cleanup immediately
    fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    res.json({ dockerfile });
  } catch (err) {
    try { if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
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
    buildConfig = {}, generatedDockerfile, useCustomDockerfile = false
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
    runDeploymentPipeline(deployment._id);

    res.status(201).json(deployment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// THE DEPLOYMENT PIPELINE — runs asynchronously
// ============================================================
async function runDeploymentPipeline(deploymentId) {
  if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });

  try {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) return;

    const cloneDir = path.join(REPOS_DIR, `${deployment._id}`);

    // ---------- STEP 1: Clone ----------
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'cloning' });
    await pushLog(deploymentId, `Cloning repository: ${deployment.repoUrl}`, 'info');

    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      await execPromise(`git clone --depth 1 --branch ${deployment.branch} ${deployment.repoUrl} "${cloneDir}"`, {
        timeout: 180000
      });
      await pushLog(deploymentId, 'Repository cloned successfully', 'success');
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
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'generating' });
    const dockerfilePath = path.join(buildContextDir, 'Dockerfile');

    if (deployment.useCustomDockerfile && fs.existsSync(dockerfilePath)) {
      await pushLog(deploymentId, 'Using existing Dockerfile from repository', 'info');
    } else if (deployment.generatedDockerfile) {
      // Write the AI-generated or user-edited Dockerfile
      fs.writeFileSync(dockerfilePath, deployment.generatedDockerfile);
      await pushLog(deploymentId, 'Using AI-generated Dockerfile', 'success');
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
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'building' });
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
    await Deployment.findByIdAndUpdate(deploymentId, { status: 'deploying' });
    await pushLog(deploymentId, 'Starting container…', 'info');

    const exposedPort = deployment.buildConfig?.exposedPort || 3000;
    const port = await getAvailablePort();

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

      const HOST = process.env.HOST || 'localhost';
      const deploymentUrl = `http://${HOST}:${port}`;

      await Deployment.findByIdAndUpdate(deploymentId, {
        status: 'running',
        containerId: container.id,
        imageId: imageName,
        port,
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
        await container.stop().catch(() => {});
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
      execSync(`docker image inspect ${imageName}`, { stdio: 'ignore' });
    } catch (_) {
      return res.status(400).json({ msg: 'No Docker image found. Please Redeploy instead.' });
    }

    // Force-remove any existing leftover container by name
    const containerName = `sp-${deployment._id}`;
    try {
      await execPromise(`docker rm -f ${containerName}`);
    } catch (_) {}

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
      execSync(`docker rm -f sp-${deployment._id}`, { stdio: 'ignore' });
      if (deployment.containerId) {
        execSync(`docker rm -f ${deployment.containerId}`, { stdio: 'ignore' });
      }
    } catch (_) {}

    // Cleanup repo
    cleanupRepo(deployment._id);

    // Cleanup docker image
    if (deployment.imageId) {
      try { await docker.getImage(deployment.imageId).remove(); } catch (_) {}
    }

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
