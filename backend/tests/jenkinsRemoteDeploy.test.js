const assert = require('assert');
const mongoose = require('mongoose');
const Deployment = require('../models/Deployment');
const Infrastructure = require('../models/Infrastructure');
const jenkinsService = require('../services/jenkinsService');

/**
 * Mock Verification Suite for Jenkins Remote Deployment
 * Tests target resolution, readiness validation, security boundaries, and parameter handling.
 */
async function runTests() {
  console.log('====================================================');
  console.log('Starting Jenkins Remote Deployment Verification Tests');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  const mockUserId = new mongoose.Types.ObjectId();
  const unauthorizedUserId = new mongoose.Types.ObjectId();
  const mockDeploymentId = new mongoose.Types.ObjectId();
  const mockInfraId = new mongoose.Types.ObjectId();

  // ── TEST 1: Model Schema Verification ──────────────────────────
  test('Deployment schema contains remote deployment fields', () => {
    const dep = new Deployment({
      name: 'test-app',
      user: mockUserId,
      repoUrl: 'https://github.com/user/test-app',
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId,
      targetHost: '54.210.12.34',
      remoteDeploymentStatus: 'running',
      jenkinsBuildStatus: 'success',
      jenkinsBuildUrl: 'http://jenkins:8080/job/stackpilot/1'
    });

    assert.strictEqual(dep.deploymentMode, 'dedicated');
    assert.strictEqual(dep.targetHost, '54.210.12.34');
    assert.strictEqual(dep.remoteDeploymentStatus, 'running');
    assert.strictEqual(dep.jenkinsBuildStatus, 'success');
  });

  // ── TEST 2: Authorization & Ownership Validation ───────────────
  await asyncTest('Rejects deployment trigger if user does not own deployment', async () => {
    // Save original findById
    const origFindById = Deployment.findById;
    Deployment.findById = async () => ({
      _id: mockDeploymentId,
      user: mockUserId,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId
    });

    try {
      await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, unauthorizedUserId);
      assert.fail('Should have thrown authorization error');
    } catch (err) {
      assert(err.message.includes('Not authorized') || err.message.includes('authorization'), `Unexpected error: ${err.message}`);
    } finally {
      Deployment.findById = origFindById;
    }
  });

  // ── TEST 3: State Validation - Provisioning State ──────────────
  await asyncTest('Rejects remote deployment if infrastructure is not PROVISIONED', async () => {
    const origDepFind = Deployment.findById;
    const origInfraFind = Infrastructure.findById;

    Deployment.findById = async () => ({
      _id: mockDeploymentId,
      user: mockUserId,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId
    });

    Infrastructure.findById = async () => ({
      _id: mockInfraId,
      user: mockUserId,
      deployment: mockDeploymentId,
      status: 'PROVISIONING', // Not PROVISIONED yet
      configurationStatus: 'configured',
      ansibleHandoff: { readyForJenkins: true },
      publicIp: '54.210.12.34'
    });

    try {
      await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, mockUserId);
      assert.fail('Should have rejected non-PROVISIONED infra');
    } catch (err) {
      assert(err.message.includes('not in PROVISIONED state'), `Unexpected error: ${err.message}`);
    } finally {
      Deployment.findById = origDepFind;
      Infrastructure.findById = origInfraFind;
    }
  });

  // ── TEST 4: State Validation - Configuration State ────────────
  await asyncTest('Rejects remote deployment if Ansible configuration is incomplete', async () => {
    const origDepFind = Deployment.findById;
    const origInfraFind = Infrastructure.findById;

    Deployment.findById = async () => ({
      _id: mockDeploymentId,
      user: mockUserId,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId
    });

    Infrastructure.findById = async () => ({
      _id: mockInfraId,
      user: mockUserId,
      deployment: mockDeploymentId,
      status: 'PROVISIONED',
      configurationStatus: 'pending', // Not configured
      ansibleHandoff: { readyForJenkins: false },
      publicIp: '54.210.12.34'
    });

    try {
      await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, mockUserId);
      assert.fail('Should have rejected unconfigured infra');
    } catch (err) {
      assert(err.message.includes('configuration is incomplete') || err.message.includes('readyForJenkins'), `Unexpected error: ${err.message}`);
    } finally {
      Deployment.findById = origDepFind;
      Infrastructure.findById = origInfraFind;
    }
  });

  // ── TEST 5: Security Boundary - Localhost & Loopback Blocking ───
  await asyncTest('Blocks localhost and loopback targets from dedicated deployment', async () => {
    const origDepFind = Deployment.findById;
    const origInfraFind = Infrastructure.findById;

    const dangerousTargets = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];

    for (const dangerousIp of dangerousTargets) {
      Deployment.findById = async () => ({
        _id: mockDeploymentId,
        user: mockUserId,
        deploymentMode: 'dedicated',
        infrastructure: mockInfraId
      });

      Infrastructure.findById = async () => ({
        _id: mockInfraId,
        user: mockUserId,
        deployment: mockDeploymentId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        ansibleHandoff: { readyForJenkins: true },
        publicIp: dangerousIp
      });

      try {
        await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, mockUserId);
        assert.fail(`Should have blocked target ${dangerousIp}`);
      } catch (err) {
        assert(err.message.includes('Security boundary violation'), `Expected security violation for ${dangerousIp}, got: ${err.message}`);
      }
    }

    Deployment.findById = origDepFind;
    Infrastructure.findById = origInfraFind;
  });

  // ── TEST 6: Concurrency Protection ─────────────────────────────
  await asyncTest('Prevents overlapping concurrent remote deployments', async () => {
    const origDepFind = Deployment.findById;
    const origInfraFind = Infrastructure.findById;

    Deployment.findById = async () => ({
      _id: mockDeploymentId,
      user: mockUserId,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId,
      remoteDeploymentStatus: 'transferring' // already in progress
    });

    Infrastructure.findById = async () => ({
      _id: mockInfraId,
      user: mockUserId,
      deployment: mockDeploymentId,
      status: 'PROVISIONED',
      configurationStatus: 'configured',
      ansibleHandoff: { readyForJenkins: true },
      publicIp: '54.210.12.34'
    });

    try {
      await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, mockUserId);
      assert.fail('Should have prevented overlapping deployment');
    } catch (err) {
      assert(err.message.includes('already in progress'), `Unexpected error: ${err.message}`);
    } finally {
      Deployment.findById = origDepFind;
      Infrastructure.findById = origInfraFind;
    }
  });

  // ── TEST 7: Successful Trigger & Parameter Assembly ────────────
  await asyncTest('Successfully validates and queues dedicated deployment with trusted metadata', async () => {
    const origDepFind = Deployment.findById;
    const origInfraFind = Infrastructure.findById;

    let savedDeployment = null;

    const mockDepDoc = {
      _id: mockDeploymentId,
      user: mockUserId,
      repoUrl: 'https://github.com/user/demo-repo',
      branch: 'main',
      projectType: 'nextjs',
      deployFolder: '.',
      port: 3000,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId,
      remoteDeploymentStatus: 'idle',
      logs: [],
      save: async function() {
        savedDeployment = { ...this };
        return this;
      }
    };

    Deployment.findById = async () => mockDepDoc;

    Infrastructure.findById = async () => ({
      _id: mockInfraId,
      user: mockUserId,
      deployment: mockDeploymentId,
      status: 'PROVISIONED',
      configurationStatus: 'configured',
      ansibleHandoff: {
        readyForJenkins: true,
        sshUser: 'ubuntu',
        publicIp: '54.210.12.34'
      },
      publicIp: '54.210.12.34',
      amiOs: 'ubuntu',
      applicationPort: 3000
    });

    // Mock triggerBuild to inspect parameters
    const origTriggerBuild = jenkinsService.triggerBuild;
    let receivedParams = null;
    jenkinsService.triggerBuild = async (params) => {
      receivedParams = params;
      return { queued: true, queueUrl: 'http://jenkins:8080/queue/item/42/' };
    };

    try {
      const res = await jenkinsService.triggerDedicatedDeployment(mockDeploymentId, mockUserId);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.targetHost, '54.210.12.34');
      assert.strictEqual(res.queueUrl, 'http://jenkins:8080/queue/item/42/');

      // Verify parameters passed to Jenkins
      assert.strictEqual(receivedParams.deploymentMode, 'dedicated');
      assert.strictEqual(receivedParams.targetHost, '54.210.12.34');
      assert.strictEqual(receivedParams.sshUser, 'ubuntu');
      assert.strictEqual(receivedParams.port, 3000);

      // Verify deployment state updated
      assert.strictEqual(mockDepDoc.targetHost, '54.210.12.34');
      assert.strictEqual(mockDepDoc.jenkinsBuildUrl, 'http://jenkins:8080/queue/item/42/');
      assert.strictEqual(mockDepDoc.logs.length >= 2, true);
    } finally {
      Deployment.findById = origDepFind;
      Infrastructure.findById = origInfraFind;
      jenkinsService.triggerBuild = origTriggerBuild;
    }
  });

  // ── TEST 8: Controller Runtime Sync for Dedicated Node ─────────
  await asyncTest('Controller updateRuntime correctly updates dedicated host and remote status', async () => {
    const deploymentController = require('../controllers/deploymentController');
    const origDepFind = Deployment.findById;

    const mockDep = {
      _id: mockDeploymentId,
      deploymentMode: 'dedicated',
      port: 3000,
      redeployHistory: [],
      save: async function() { return this; }
    };

    Deployment.findById = async () => mockDep;

    const req = {
      body: {
        deploymentId: mockDeploymentId.toString(),
        containerName: 'sp-test',
        imageName: 'stackpilot-test',
        status: 'running',
        port: 3000,
        buildStatus: 'success',
        deploymentMode: 'dedicated',
        targetHost: '54.210.12.34'
      }
    };

    let responseData = null;
    const res = {
      json: (data) => { responseData = data; return res; },
      status: () => res
    };

    try {
      await deploymentController.updateRuntime(req, res);
      assert.strictEqual(mockDep.targetHost, '54.210.12.34');
      assert.strictEqual(mockDep.remoteDeploymentStatus, 'running');
      assert.strictEqual(mockDep.deploymentUrl, 'http://54.210.12.34:3000');
      assert.strictEqual(mockDep.redeployHistory.length, 1);
      assert.strictEqual(mockDep.redeployHistory[0].trigger, 'jenkins-dedicated');
    } finally {
      Deployment.findById = origDepFind;
    }
  });

  // ── TEST 9: Redeploy Branching (Dedicated vs Shared) ───────────
  await asyncTest('Controller redeployDeployment branches dedicated deployment to Jenkins remote pipeline', async () => {
    const deploymentController = require('../controllers/deploymentController');
    const origDepFind = Deployment.findById;
    const origDedicated = jenkinsService.triggerDedicatedDeployment;

    let dedicatedTriggered = false;
    jenkinsService.triggerDedicatedDeployment = async (depId, uId) => {
      dedicatedTriggered = true;
      return { success: true, deployment: { _id: depId, status: 'building' } };
    };

    Deployment.findById = async () => ({
      _id: mockDeploymentId,
      user: mockUserId,
      deploymentMode: 'dedicated',
      infrastructure: mockInfraId
    });

    const req = {
      params: { id: mockDeploymentId.toString() },
      user: { id: mockUserId.toString() }
    };

    let responseData = null;
    const res = {
      json: (data) => { responseData = data; return res; },
      status: () => res
    };

    try {
      await deploymentController.redeployDeployment(req, res);
      assert.strictEqual(dedicatedTriggered, true, 'Dedicated deployment trigger should have been called');
      assert.strictEqual(responseData.status, 'building');
    } finally {
      Deployment.findById = origDepFind;
      jenkinsService.triggerDedicatedDeployment = origDedicated;
    }
  });

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});
