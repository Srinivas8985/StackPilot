/**
 * GitHub commit polling service.
 *
 * Periodically checks public repos for new commits.
 * When a new SHA is detected, triggers a Jenkins rebuild.
 */
const axios = require('axios');
const Deployment = require('../models/Deployment');
const SystemConfig = require('../models/SystemConfig');
const { triggerBuild } = require('./jenkinsService');

let pollingTimer = null;
let isPolling = false;

// ── GitHub API ─────────────────────────────────────────────────────────────

/**
 * Fetch the latest commit SHA for a public GitHub repo + branch.
 *
 * @param {string} repoUrl  e.g. "https://github.com/owner/repo"
 * @param {string} branch   e.g. "main"
 * @returns {Promise<{ sha: string, message: string, date: string } | null>}
 */
async function fetchLatestCommit(repoUrl, branch = 'main') {
  try {
    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!match) return null;
    const [, owner, repo] = match;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'StackPilot/1.0',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 10000
    });

    if (response.status !== 200) return null;
    
    const json = response.data;
    return {
      sha: json.sha,
      message: json.commit?.message || '',
      date: json.commit?.committer?.date || new Date().toISOString()
    };
  } catch (error) {
    return null;
  }
}

// ── Polling Loop ───────────────────────────────────────────────────────────

async function pollOnce() {
  if (isPolling) return;
  isPolling = true;

  try {
    const config = await SystemConfig.getConfig();
    if (!config.globalPollingEnabled || config.cicdPaused) {
      isPolling = false;
      return;
    }

    // Get all deployments with auto-deploy enabled and status 'running'
    const deployments = await Deployment.find({
      autoDeployEnabled: true,
      status: 'running'
    });

    if (deployments.length === 0) {
      isPolling = false;
      return;
    }

    console.log(`[Polling] Checking ${deployments.length} deployment(s) for new commits…`);

    for (const dep of deployments) {
      try {
        // Only poll GitHub repos
        if (!dep.repoUrl.includes('github.com')) continue;

        const commit = await fetchLatestCommit(dep.repoUrl, dep.branch);
        if (!commit) continue;

        // Update last checked
        dep.lastCheckedAt = new Date();

        // First time — just store the SHA, don't trigger
        if (!dep.lastCommitSha) {
          dep.lastCommitSha = commit.sha;
          await dep.save();
          console.log(`[Polling] ${dep.name}: initial SHA stored (${commit.sha.slice(0, 7)})`);
          continue;
        }

        // Compare SHAs
        if (commit.sha !== dep.lastCommitSha) {
          console.log(`[Polling] ${dep.name}: NEW commit detected! ${dep.lastCommitSha.slice(0, 7)} → ${commit.sha.slice(0, 7)}`);

          dep.lastCommitSha = commit.sha;
          dep.redeployCount = (dep.redeployCount || 0) + 1;
          dep.redeployHistory.push({
            triggeredAt: new Date(),
            trigger: 'auto',
            commitSha: commit.sha,
            status: 'queued'
          });
          await dep.save();

          // Trigger Jenkins
          const result = await triggerBuild({
            deploymentId: dep._id.toString(),
            repoUrl: dep.repoUrl,
            branch: dep.branch,
            projectType: dep.projectType || 'auto',
            deployFolder: dep.deployFolder || '.',
            port: dep.port,
            containerName: `sp-${dep._id}`,
            imageName: `stackpilot-${dep._id}`.toLowerCase()
          });

          if (result.queued) {
            await Deployment.findByIdAndUpdate(dep._id, {
              jenkinsBuildStatus: 'queued',
              $push: {
                logs: {
                  message: `Auto-deploy triggered: commit ${commit.sha.slice(0, 7)} — "${commit.message.slice(0, 80)}"`,
                  type: 'info',
                  timestamp: new Date()
                }
              }
            });
            console.log(`[Polling] ${dep.name}: Jenkins build queued`);
          } else {
            // Jenkins unavailable — fall back to internal redeploy
            console.log(`[Polling] ${dep.name}: Jenkins unavailable, using internal pipeline`);
            await Deployment.findByIdAndUpdate(dep._id, {
              $push: {
                logs: {
                  message: `Auto-deploy: Jenkins unavailable, using internal pipeline for commit ${commit.sha.slice(0, 7)}`,
                  type: 'warning',
                  timestamp: new Date()
                }
              }
            });

            // Trigger internal redeploy
            const { triggerInternalRedeploy } = require('../controllers/deploymentController');
            if (typeof triggerInternalRedeploy === 'function') {
              triggerInternalRedeploy(dep._id.toString());
            }
          }
        } else {
          await dep.save(); // save lastCheckedAt
        }
      } catch (depErr) {
        console.error(`[Polling] Error checking ${dep.name}: ${depErr.message}`);
      }
    }
  } catch (err) {
    console.error('[Polling] Cycle error:', err.message);
  } finally {
    isPolling = false;
  }
}

// ── Start / Stop ───────────────────────────────────────────────────────────

async function startPolling() {
  if (pollingTimer) return;

  const config = await SystemConfig.getConfig();
  const interval = config.defaultPollingIntervalMs || 60000;

  // Initial check after 10 seconds
  setTimeout(() => pollOnce(), 10000);

  pollingTimer = setInterval(() => pollOnce(), interval);
  console.log(`[Polling] Started (interval: ${interval / 1000}s)`);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[Polling] Stopped');
  }
}

async function restartPolling() {
  stopPolling();
  await startPolling();
}

/** Force-check a single deployment immediately */
async function forceCheckDeployment(deploymentId) {
  const dep = await Deployment.findById(deploymentId);
  if (!dep) return { error: 'Deployment not found' };
  if (!dep.repoUrl.includes('github.com')) return { error: 'Not a GitHub repo' };

  const commit = await fetchLatestCommit(dep.repoUrl, dep.branch);
  if (!commit) return { error: 'Failed to fetch commit info' };

  const changed = dep.lastCommitSha && commit.sha !== dep.lastCommitSha;
  dep.lastCheckedAt = new Date();
  dep.lastCommitSha = commit.sha;
  await dep.save();

  return {
    changed,
    sha: commit.sha,
    message: commit.message,
    date: commit.date
  };
}

module.exports = {
  startPolling,
  stopPolling,
  restartPolling,
  pollOnce,
  forceCheckDeployment,
  fetchLatestCommit
};
