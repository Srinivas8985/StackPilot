const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const Deployment = require('../models/Deployment');

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '//./pipe/docker_engine' });
const REPOS_DIR = path.join(__dirname, '..', 'repos');

/**
 * Delete the cloned repository directory for a given deployment.
 */
function cleanupRepo(deploymentId) {
  const cloneDir = path.join(REPOS_DIR, `${deploymentId}`);
  try {
    if (fs.existsSync(cloneDir)) {
      fs.promises.rm(cloneDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        .then(() => console.log(`Cleaned up repo: ${cloneDir}`))
        .catch(err => console.error(`Async cleanup repo error for ${deploymentId}:`, err.message));
    }
  } catch (err) {
    console.error(`Cleanup repo check error for ${deploymentId}:`, err.message);
  }
}

/**
 * Run periodic cleanup:
 * - Remove temp repos for completed deployments (running/stopped/failed)
 * - Remove stopped containers older than 24h
 * - Remove dangling stackpilot images
 */
async function runCleanupCycle() {
  console.log('[Cleanup] Starting cleanup cycle…');

  // 1. Clean up repo directories for non-building deployments
  try {
    if (fs.existsSync(REPOS_DIR)) {
      const dirs = fs.readdirSync(REPOS_DIR);
      for (const dir of dirs) {
        if (dir === 'temp') continue; // Skip the temp directory
        try {
          const deployment = await Deployment.findById(dir);
          // If deployment doesn't exist, or is running/stopped/failed — clean the repo
          if (!deployment || ['running', 'stopped', 'failed'].includes(deployment.status)) {
            cleanupRepo(dir);
          }
        } catch (_) {
          // If ID is invalid, clean it up anyway
          cleanupRepo(dir);
        }
      }
    }
  } catch (err) {
    console.error('[Cleanup] Repo cleanup error:', err.message);
  }

  // 1b. Clean up abandoned temp repos older than 1 hour
  try {
    const tempDir = path.join(REPOS_DIR, 'temp');
    if (fs.existsSync(tempDir)) {
      const tempFolders = fs.readdirSync(tempDir);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const folder of tempFolders) {
        const folderPath = path.join(tempDir, folder);
        try {
          const stats = fs.statSync(folderPath);
          if (stats.mtimeMs < oneHourAgo) {
            fs.promises.rm(folderPath, { recursive: true, force: true })
              .then(() => console.log(`[Cleanup] Removed old temp workspace: ${folder}`))
              .catch(() => {});
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[Cleanup] Temp repo cleanup error:', err.message);
  }

  // 2. Remove containers for stopped deployments older than 24h
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oldStopped = await Deployment.find({
      status: 'stopped',
      updatedAt: { $lt: cutoff },
      containerId: { $ne: null }
    });

    for (const dep of oldStopped) {
      try {
        const container = docker.getContainer(dep.containerId);
        await container.remove({ force: true });
        dep.containerId = null;
        await dep.save();
        console.log(`[Cleanup] Removed old container for deployment ${dep._id}`);
      } catch (_) {
        dep.containerId = null;
        await dep.save();
      }
    }
  } catch (err) {
    console.error('[Cleanup] Container cleanup error:', err.message);
  }

  // 3. Prune unused Docker images (stackpilot-* only)
  try {
    const images = await docker.listImages();

    for (const img of images) {
      const tags = img.RepoTags || [];
      for (const tag of tags) {
        if (tag.startsWith('stackpilot-')) {
          // Extract the deployment ID from the tag (e.g. stackpilot-6a12...:latest)
          const depIdMatch = tag.match(/stackpilot-([a-f0-9]{24})/);
          if (depIdMatch) {
            const depId = depIdMatch[1];
            try {
              const deploymentExists = await Deployment.exists({ _id: depId });
              // Only delete if the deployment is completely deleted from the DB
              if (!deploymentExists) {
                await docker.getImage(tag).remove({ force: true });
                console.log(`[Cleanup] Removed orphaned image: ${tag}`);
              }
            } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    console.error('[Cleanup] Image cleanup error:', err.message);
  }

  console.log('[Cleanup] Cycle complete.');
}

/**
 * Start the cleanup scheduler (runs every 30 minutes).
 */
function startCleanupScheduler() {
  // Run once at startup after 30s delay
  setTimeout(() => runCleanupCycle(), 30000);
  // Then every 30 minutes
  setInterval(() => runCleanupCycle(), 30 * 60 * 1000);
  console.log('[Cleanup] Scheduler started (every 30 min)');
}

module.exports = { cleanupRepo, runCleanupCycle, startCleanupScheduler };
