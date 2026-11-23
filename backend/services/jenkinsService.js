/**
 * Jenkins REST API integration service.
 *
 * Triggers parameterized pipeline builds, polls build status,
 * and fetches console output — all via Jenkins' JSON API.
 * Supports both Shared and Dedicated EC2 remote deployments.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const Deployment = require('../models/Deployment');
const Infrastructure = require('../models/Infrastructure');

const JENKINS_URL = process.env.JENKINS_URL || 'http://localhost:8080';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || '';
const JOB_NAME = process.env.JENKINS_JOB_NAME || 'stackpilot-redeploy';
const DEFAULT_SSH_CREDENTIAL_ID = process.env.JENKINS_SSH_CREDENTIAL_ID || 'stackpilot-dedicated-key';

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
 * Supports both shared host execution and dedicated EC2 remote deployment.
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
 * @param {string} [params.deploymentMode='shared'] - 'shared' or 'dedicated'
 * @param {string} [params.targetHost=''] - Remote IP for dedicated deployment
 * @param {string} [params.sshUser='ubuntu'] - SSH username on dedicated host
 * @param {string} [params.sshCredentialId] - Jenkins credential ID for SSH key
 * @param {Array} [params.envVars] - Environment variables array
 * @returns {Promise<{ queued: boolean, queueUrl: string|null }>}
 */
async function triggerBuild({
  deploymentId,
  repoUrl,
  branch = 'main',
  projectType = 'auto',
  deployFolder = '.',
  port = 3000,
  containerName,
  imageName,
  deploymentMode = 'shared',
  targetHost = '',
  sshUser = 'ubuntu',
  sshCredentialId = '',
  envVars = []
}) {
  const credId = sshCredentialId || DEFAULT_SSH_CREDENTIAL_ID;

  const params = new URLSearchParams({
    DEPLOYMENT_ID: String(deploymentId),
    REPO_URL: repoUrl,
    BRANCH: branch || 'main',
    PROJECT_TYPE: projectType || 'auto',
    ROOT_FOLDER: deployFolder || '.',
    PORT: String(port),
    CONTAINER_NAME: containerName || `sp-${deploymentId}`,
    IMAGE_NAME: imageName || `stackpilot-${deploymentId}`.toLowerCase(),
    DEPLOYMENT_MODE: deploymentMode || 'shared',
    TARGET_HOST: targetHost || '',
    SSH_USER: sshUser || 'ubuntu',
    SSH_CREDENTIAL_ID: credId
  });

  if (envVars && Array.isArray(envVars) && envVars.length > 0) {
    try {
      params.append('ENV_VARS_BASE64', Buffer.from(JSON.stringify(envVars)).toString('base64'));
    } catch (_) {}
  }

  try {
    // Inject generated Dockerfile if it exists in MongoDB
    const dep = await Deployment.findById(deploymentId);
    if (dep && dep.generatedDockerfile) {
      params.append('DOCKERFILE_B64', Buffer.from(dep.generatedDockerfile).toString('base64'));
    }

    const res = await jenkinsRequest(
      'POST',
      `/job/${JOB_NAME}/buildWithParameters?${params.toString()}`
    );

    if (res.status === 201 || res.status === 200) {
      console.log(`[Jenkins] Build triggered for ${deploymentId} (mode: ${deploymentMode}, target: ${targetHost || 'local'})`);
      return { queued: true, queueUrl: res.headers.location || null };
    }

    console.error(`[Jenkins] Trigger failed: HTTP ${res.status} — ${res.body ? res.body.substring(0, 200) : ''}`);
    return { queued: false, queueUrl: null };
  } catch (err) {
    console.error(`[Jenkins] Trigger error: ${err.message}`);
    return { queued: false, queueUrl: null };
  }
}

/**
 * Validates requirements and triggers remote Jenkins deployment for dedicated infrastructure.
 * Enforces ownership, readiness, and strict IP isolation boundaries.
 *
 * @param {string} deploymentId - Deployment ObjectId string
 * @param {string} userId - Authenticated User ID
 * @returns {Promise<{ success: boolean, deployment: Object, targetHost: string, queueUrl: string|null }>}
 */
async function triggerDedicatedDeployment(deploymentId, userId) {
  // 1. Fetch deployment & check ownership
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) {
    throw new Error('Deployment not found');
  }
  if (deployment.user.toString() !== userId.toString()) {
    throw new Error('Not authorized to access this deployment');
  }

  // 2. Validate dedicated infrastructure link
  if (!deployment.infrastructure) {
    throw new Error('This deployment is not associated with dedicated infrastructure');
  }

  const infra = await Infrastructure.findById(deployment.infrastructure);
  if (!infra) {
    throw new Error('Linked infrastructure record not found');
  }
  if (infra.user.toString() !== userId.toString()) {
    throw new Error('Authorization mismatch between deployment and infrastructure owner');
  }
  if (infra.deployment.toString() !== deployment._id.toString()) {
    throw new Error('Deployment and infrastructure record association mismatch');
  }

  // 3. Validate lifecycle state: Must be PROVISIONED and CONFIGURED
  if (infra.status !== 'PROVISIONED') {
    throw new Error(`Dedicated EC2 is not in PROVISIONED state (current status: ${infra.status})`);
  }
  if (infra.configurationStatus !== 'configured') {
    throw new Error(`Host configuration is incomplete (current: ${infra.configurationStatus}). Please run Ansible configuration first.`);
  }
  if (!infra.ansibleHandoff?.readyForJenkins) {
    throw new Error('Infrastructure handoff flag (readyForJenkins) is false. Wait for automated host setup to complete.');
  }

  // 4. Validate target host IP
  const targetHost = (infra.publicIp || '').trim();
  if (!targetHost) {
    throw new Error('Dedicated infrastructure does not have a valid public IP assigned');
  }

  // 5. Enforce security boundary: Loopback & Localhost rejection
  const blockedTargets = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];
  if (blockedTargets.includes(targetHost.toLowerCase())) {
    throw new Error('Security boundary violation: target host cannot be localhost or loopback address');
  }

  // 6. Concurrency check: prevent overlapping deployments
  if (deployment.remoteDeploymentStatus === 'building' || deployment.remoteDeploymentStatus === 'transferring' || deployment.remoteDeploymentStatus === 'deploying') {
    throw new Error('A remote deployment is already in progress for this service');
  }

  // 7. Resolve connection parameters
  const sshUser = infra.ansibleHandoff?.sshUser || (infra.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user');
  const port = deployment.port || deployment.buildConfig?.exposedPort || infra.applicationPort || 3000;
  const sshCredentialId = process.env.JENKINS_SSH_CREDENTIAL_ID || 'stackpilot-dedicated-key';

  // 8. Update deployment state for tracking
  deployment.status = 'building';
  deployment.targetHost = targetHost;
  deployment.remoteDeploymentStatus = 'building';
  deployment.jenkinsBuildStatus = 'queued';
  deployment.logs.push({
    timestamp: new Date(),
    message: `Triggering Jenkins remote deployment to dedicated host ${targetHost} (user: ${sshUser}, port: ${port})`,
    type: 'info'
  });
  await deployment.save();

  // 9. Trigger Jenkins parameterized build
  const result = await module.exports.triggerBuild({
    deploymentId: deployment._id,
    repoUrl: deployment.repoUrl,
    branch: deployment.branch,
    projectType: deployment.projectType,
    deployFolder: deployment.deployFolder,
    port,
    containerName: `sp-${deployment._id}`,
    imageName: `stackpilot-${deployment._id}`.toLowerCase(),
    deploymentMode: 'dedicated',
    targetHost,
    sshUser,
    sshCredentialId,
    envVars: deployment.envVars
  });

  if (result.queued) {
    deployment.jenkinsBuildUrl = result.queueUrl;
    deployment.logs.push({
      timestamp: new Date(),
      message: `Jenkins pipeline successfully queued for dedicated target ${targetHost}`,
      type: 'success'
    });
    await deployment.save();
    return {
      success: true,
      deployment,
      targetHost,
      queueUrl: result.queueUrl
    };
  } else {
    deployment.status = 'failed';
    deployment.remoteDeploymentStatus = 'failed';
    deployment.jenkinsBuildStatus = 'failed';
    deployment.logs.push({
      timestamp: new Date(),
      message: 'Failed to trigger Jenkins pipeline for dedicated deployment',
      type: 'error'
    });
    await deployment.save();
    throw new Error('Failed to queue Jenkins remote deployment job');
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
  triggerDedicatedDeployment,
  getLastBuild,
  getBuild,
  getBuildConsole,
  isJenkinsAvailable,
  getRecentBuilds,
  getJenkinsUrl: () => JENKINS_URL
};
