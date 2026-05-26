/**
 * Jenkins REST API integration service.
 *
 * Triggers parameterized pipeline builds, polls build status,
 * and fetches console output — all via Jenkins' JSON API.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const Deployment = require('../models/Deployment');

const JENKINS_URL = process.env.JENKINS_URL || 'http://localhost:8080';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || '';
const JOB_NAME = process.env.JENKINS_JOB_NAME || 'stackpilot-redeploy';

// ── helpers ────────────────────────────────────────────────────────────────

function jenkinsAuth() {
  if (JENKINS_USER && JENKINS_TOKEN) {
    return {
      username: JENKINS_USER,
      password: JENKINS_TOKEN
    };
  }
  return undefined;
}

async function jenkinsRequest(method, urlPath, data = null) {
  const url = `${JENKINS_URL}${urlPath}`;
  try {
    const response = await axios({
      method,
      url,
      data,
      auth: jenkinsAuth(),
      timeout: 15000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return { status: response.status, headers: response.headers, body: JSON.stringify(response.data) };
  } catch (error) {
    if (error.response) {
      return { status: error.response.status, headers: error.response.headers, body: JSON.stringify(error.response.data) };
    }
    throw error;
  }
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Trigger a parameterized Jenkins build for a StackPilot deployment.
 *
 * @param {Object} params
 * @param {string} params.deploymentId
 * @param {string} params.repoUrl
 * @param {string} params.branch
 * @param {string} params.projectType
 * @param {string} params.deployFolder
 * @param {number} params.port
 * @param {string} params.containerName
 * @param {string} params.imageName
 * @returns {Promise<{ queued: boolean, queueUrl: string|null }>}
 */
async function triggerBuild({
  deploymentId, repoUrl, branch = 'main', projectType = 'auto',
  deployFolder = '.', port = 3000, containerName, imageName
}) {
  const params = new URLSearchParams({
    DEPLOYMENT_ID: deploymentId,
    REPO_URL: repoUrl,
    BRANCH: branch,
    PROJECT_TYPE: projectType || 'auto',
    ROOT_FOLDER: deployFolder || '.',
    PORT: String(port),
    CONTAINER_NAME: containerName || `sp-${deploymentId}`,
    IMAGE_NAME: imageName || `stackpilot-${deploymentId}`.toLowerCase()
  });

  try {
    // Inject the generated Dockerfile if it exists in the database
    const dep = await Deployment.findById(deploymentId);
    if (dep && dep.generatedDockerfile) {
      params.append('DOCKERFILE_B64', Buffer.from(dep.generatedDockerfile).toString('base64'));
    }

    const res = await jenkinsRequest(
      'POST',
      `/job/${JOB_NAME}/buildWithParameters?${params.toString()}`
    );

    if (res.status === 201 || res.status === 200) {
      console.log(`[Jenkins] Build triggered for ${deploymentId}`);
      return { queued: true, queueUrl: res.headers.location || null };
    }

    console.error(`[Jenkins] Trigger failed: HTTP ${res.status} — ${res.body.substring(0, 200)}`);
    return { queued: false, queueUrl: null };
  } catch (err) {
    console.error(`[Jenkins] Trigger error: ${err.message}`);
    return { queued: false, queueUrl: null };
  }
}

/**
 * Get the latest build info for the Jenkins job.
 *
 * @returns {Promise<Object|null>}
 */
async function getLastBuild() {
  try {
    const res = await jenkinsRequest('GET', `/job/${JOB_NAME}/lastBuild/api/json`);
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  } catch {
    return null;
  }
}

/**
 * Get build info by build number.
 *
 * @param {number} buildNumber
 * @returns {Promise<Object|null>}
 */
async function getBuild(buildNumber) {
  try {
    const res = await jenkinsRequest('GET', `/job/${JOB_NAME}/${buildNumber}/api/json`);
    if (res.status === 200) return JSON.parse(res.body);
    return null;
  } catch {
    return null;
  }
}

/**
 * Get console output for a build.
 *
 * @param {number} buildNumber
 * @returns {Promise<string>}
 */
async function getBuildConsole(buildNumber) {
  try {
    const res = await jenkinsRequest('GET', `/job/${JOB_NAME}/${buildNumber}/consoleText`);
    if (res.status === 200) return res.body;
    return '';
  } catch {
    return '';
  }
}

/**
 * Check if Jenkins is reachable.
 *
 * @returns {Promise<boolean>}
 */
async function isJenkinsAvailable() {
  try {
    const res = await jenkinsRequest('GET', '/api/json');
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Get all recent builds for the job.
 *
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function getRecentBuilds(limit = 10) {
  try {
    const res = await jenkinsRequest(
      'GET',
      `/job/${JOB_NAME}/api/json?tree=builds[number,result,timestamp,duration,actions[parameters[name,value]]]{0,${limit}}`
    );
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      return data.builds || [];
    }
    return [];
  } catch {
    return [];
  }
}

module.exports = {
  triggerBuild,
  getLastBuild,
  getBuild,
  getBuildConsole,
  isJenkinsAvailable,
  getRecentBuilds
};
