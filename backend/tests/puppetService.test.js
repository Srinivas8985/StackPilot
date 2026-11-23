const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Infrastructure = require('../models/Infrastructure');
const puppetService = require('../services/puppetService');

/**
 * Automated Verification Suite for Puppet Configuration Management
 */
async function runTests() {
  console.log('====================================================');
  console.log('Starting Puppet Service & Manifest Verification Tests');
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

  // ── TEST 1: Manifest Files and Structure Verification ──────────
  test('Puppet manifests, modules, and configuration files exist', () => {
    const puppetBaseDir = path.resolve(__dirname, '../../infrastructure/puppet');
    const requiredFiles = [
      'manifests/site.pp',
      'modules/stackpilot/manifests/init.pp',
      'modules/stackpilot/manifests/docker.pp',
      'modules/stackpilot/manifests/users.pp',
      'modules/stackpilot/manifests/directories.pp',
      'modules/stackpilot/manifests/monitoring.pp',
      'modules/stackpilot/metadata.json',
      'hieradata/common.yaml',
      'environments/production/environment.conf',
      'README.md'
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(puppetBaseDir, relPath);
      assert(fs.existsSync(fullPath), `Required Puppet file missing: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.length > 0, `File is unexpectedly empty: ${relPath}`);
    }
  });

  // ── TEST 2: Manifest Declarative Syntax & Content Verification ──
  test('Puppet manifests declare required system resources', () => {
    const puppetBaseDir = path.resolve(__dirname, '../../infrastructure/puppet');

    // Check docker.pp
    const dockerPp = fs.readFileSync(path.join(puppetBaseDir, 'modules/stackpilot/manifests/docker.pp'), 'utf8');
    assert(dockerPp.includes("service { 'docker':"), 'docker.pp must declare service docker');
    assert(dockerPp.includes('ensure     => running'), 'docker.pp must ensure running');
    assert(dockerPp.includes('enable     => true'), 'docker.pp must ensure enable true');

    // Check users.pp
    const usersPp = fs.readFileSync(path.join(puppetBaseDir, 'modules/stackpilot/manifests/users.pp'), 'utf8');
    assert(usersPp.includes("group { 'docker':"), 'users.pp must declare docker group');
    assert(usersPp.includes("groups     => ['docker']"), 'users.pp must add user to docker group');

    // Check directories.pp
    const dirsPp = fs.readFileSync(path.join(puppetBaseDir, 'modules/stackpilot/manifests/directories.pp'), 'utf8');
    assert(dirsPp.includes("file { '/etc/stackpilot':"), 'directories.pp must declare /etc/stackpilot');
    assert(dirsPp.includes("mode   => '0755'"), 'directories.pp must enforce mode 0755');
    assert(dirsPp.includes("file { '/var/log/stackpilot':"), 'directories.pp must declare /var/log/stackpilot');
    assert(dirsPp.includes("file { '/etc/stackpilot/stackpilot.conf':"), 'directories.pp must declare stackpilot.conf');

    // Check monitoring.pp
    const monPp = fs.readFileSync(path.join(puppetBaseDir, 'modules/stackpilot/manifests/monitoring.pp'), 'utf8');
    assert(monPp.includes('nagios-nrpe-server') || monPp.includes('nrpe'), 'monitoring.pp must declare NRPE package');
    assert(monPp.includes('stackpilot-nrpe.cfg'), 'monitoring.pp must configure NRPE check config');
  });

  // ── TEST 3: Schema Verification ────────────────────────────────
  test('Infrastructure schema contains Puppet execution tracking fields', () => {
    const infra = new Infrastructure({
      user: mockUserId,
      deployment: mockDeploymentId,
      stateIdentifier: 'test-puppet-state',
      puppetStatus: 'applied',
      puppetVersion: '7.24.0',
      puppetStartedAt: new Date(),
      puppetCompletedAt: new Date(),
      puppetLastRunAt: new Date()
    });

    assert.strictEqual(infra.puppetStatus, 'applied');
    assert.strictEqual(infra.puppetVersion, '7.24.0');
    assert.strictEqual(infra.puppetManifest, 'manifests/site.pp');
    assert.strictEqual(Array.isArray(infra.puppetLogs), true);
  });

  // ── TEST 4: Authorization & Ownership Validation ───────────────
  await asyncTest('Rejects Puppet apply if user does not own infrastructure', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34'
      })
    });

    try {
      await puppetService.applyPuppetConfiguration(mockInfraId, unauthorizedUserId);
      assert.fail('Should have rejected unauthorized user');
    } catch (err) {
      assert(err.message.includes('Unauthorized'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 5: Lifecycle Gate - Terraform Provisioning State ──────
  await asyncTest('Rejects Puppet apply if Terraform provisioning is not PROVISIONED', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONING', // not completed
        configurationStatus: 'configured',
        publicIp: '54.210.12.34'
      })
    });

    try {
      await puppetService.applyPuppetConfiguration(mockInfraId, mockUserId);
      assert.fail('Should have rejected non-PROVISIONED infra');
    } catch (err) {
      assert(err.message.includes('must be PROVISIONED first'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 6: Lifecycle Gate - Ansible Configuration State ───────
  await asyncTest('Rejects Puppet apply if Ansible host configuration is not configured', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'pending', // Ansible not done yet
        publicIp: '54.210.12.34'
      })
    });

    try {
      await puppetService.applyPuppetConfiguration(mockInfraId, mockUserId);
      assert.fail('Should have rejected unconfigured infra');
    } catch (err) {
      assert(err.message.includes('Ansible setup must complete first'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 7: Security Boundary - Localhost & Loopback Blocking ───
  await asyncTest('Blocks localhost and loopback targets from Puppet execution', async () => {
    const origFind = Infrastructure.findById;
    const dangerousIps = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];

    for (const ip of dangerousIps) {
      Infrastructure.findById = () => ({
        populate: async () => ({
          _id: mockInfraId,
          user: mockUserId,
          status: 'PROVISIONED',
          configurationStatus: 'configured',
          publicIp: ip
        })
      });

      try {
        await puppetService.applyPuppetConfiguration(mockInfraId, mockUserId);
        assert.fail(`Should have blocked target ${ip}`);
      } catch (err) {
        assert(err.message.includes('Security boundary violation'), `Expected security error for ${ip}, got: ${err.message}`);
      }
    }

    Infrastructure.findById = origFind;
  });

  // ── TEST 8: Concurrency Protection ─────────────────────────────
  await asyncTest('Prevents concurrent overlapping Puppet runs on same host', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34',
        puppetStatus: 'applying' // already running
      })
    });

    try {
      await puppetService.applyPuppetConfiguration(mockInfraId, mockUserId);
      assert.fail('Should have prevented overlapping run');
    } catch (err) {
      assert(err.message.includes('already in progress'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 9: Controller Endpoints Verification ──────────────────
  await asyncTest('Controller handles Puppet status, logs, and apply initiation', async () => {
    const controller = require('../controllers/infrastructureController');
    const origFindById = Infrastructure.findById;

    // Test getPuppetStatus
    Infrastructure.findById = () => ({
      select: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        puppetStatus: 'applied',
        puppetVersion: '7.24.0',
        puppetLastRunAt: new Date(),
        puppetManifest: 'manifests/site.pp'
      })
    });

    let statusData = null;
    await controller.getPuppetStatus(
      { params: { id: mockInfraId.toString() }, user: { id: mockUserId.toString() } },
      { json: (d) => { statusData = d; } }
    );
    assert.strictEqual(statusData.puppetStatus, 'applied');
    assert.strictEqual(statusData.puppetVersion, '7.24.0');

    // Test getPuppetLogs
    Infrastructure.findById = () => ({
      select: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        puppetStatus: 'applied',
        puppetLogs: [{ message: 'Puppet run clean', type: 'success', timestamp: new Date() }]
      })
    });

    let logsData = null;
    await controller.getPuppetLogs(
      { params: { id: mockInfraId.toString() }, user: { id: mockUserId.toString() } },
      { json: (d) => { logsData = d; } }
    );
    assert.strictEqual(logsData.logs.length, 1);
    assert.strictEqual(logsData.logs[0].message, 'Puppet run clean');

    Infrastructure.findById = origFindById;
  });

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Puppet test suite failed with unhandled error:', err);
  process.exit(1);
});

