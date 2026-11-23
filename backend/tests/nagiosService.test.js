const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Infrastructure = require('../models/Infrastructure');
const nagiosService = require('../services/nagiosService');

/**
 * Automated Verification Suite for Nagios Monitoring Integration
 */
async function runTests() {
  console.log('====================================================');
  console.log('Starting Nagios Service & Configuration Verification');
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

  // ── TEST 1: Directory Structure & File Presence ────────────────
  test('Nagios configuration files, objects, plugins, and scripts exist', () => {
    const nagiosBaseDir = path.resolve(__dirname, '../../infrastructure/nagios');
    const requiredFiles = [
      'nagios.cfg',
      'objects/commands.cfg',
      'objects/templates.cfg',
      'objects/stackpilot-hosts.cfg',
      'objects/stackpilot-services.cfg',
      'plugins/check_mem.sh',
      'plugins/check_docker_container.sh',
      'scripts/verify-nagios.sh',
      'scripts/install-nagios.sh',
      'README.md'
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(nagiosBaseDir, relPath);
      assert(fs.existsSync(fullPath), `Missing required Nagios file: ${relPath}`);
    }

    assert(fs.existsSync(path.join(nagiosBaseDir, 'conf.d', 'hosts')), 'Missing dynamic hosts directory: conf.d/hosts');
  });

  // ── TEST 2: Nagios Object Definitions Syntax ───────────────────
  test('Nagios objects declare required commands and templates', () => {
    const nagiosBaseDir = path.resolve(__dirname, '../../infrastructure/nagios');
    const commandsCfg = fs.readFileSync(path.join(nagiosBaseDir, 'objects/commands.cfg'), 'utf8');
    const templatesCfg = fs.readFileSync(path.join(nagiosBaseDir, 'objects/templates.cfg'), 'utf8');
    const servicesCfg = fs.readFileSync(path.join(nagiosBaseDir, 'objects/stackpilot-services.cfg'), 'utf8');

    // Check commands
    assert(commandsCfg.includes('command_name    check_ping'), 'Missing check_ping command');
    assert(commandsCfg.includes('command_name    check_ssh'), 'Missing check_ssh command');
    assert(commandsCfg.includes('command_name    check_http'), 'Missing check_http command');
    assert(commandsCfg.includes('command_name    check_nrpe'), 'Missing check_nrpe command');

    // Check templates
    assert(templatesCfg.includes('name                            stackpilot-host'), 'Missing stackpilot-host template');
    assert(templatesCfg.includes('name                            stackpilot-service'), 'Missing stackpilot-service template');

    // Check baseline services
    assert(servicesCfg.includes('service_description     PING'), 'Missing PING service');
    assert(servicesCfg.includes('service_description     SSH'), 'Missing SSH service');
    assert(servicesCfg.includes('service_description     Disk Utilization'), 'Missing Disk service');
    assert(servicesCfg.includes('service_description     CPU Load'), 'Missing CPU Load service');
    assert(servicesCfg.includes('service_description     Memory Utilization'), 'Missing Memory service');
    assert(servicesCfg.includes('service_description     Docker Daemon'), 'Missing Docker Daemon service');
  });

  // ── TEST 3: Puppet NRPE Integration Check ───────────────────────
  test('Puppet monitoring module declares NRPE agent and check commands', () => {
    const puppetMonitoringPath = path.resolve(__dirname, '../../infrastructure/puppet/modules/stackpilot/manifests/monitoring.pp');
    assert(fs.existsSync(puppetMonitoringPath), 'Puppet monitoring.pp does not exist');
    const content = fs.readFileSync(puppetMonitoringPath, 'utf8');

    assert(content.includes('server_port=5666'), 'NRPE config must expose port 5666');
    assert(content.includes('command[check_load]'), 'Missing check_load in NRPE');
    assert(content.includes('command[check_disk]'), 'Missing check_disk in NRPE');
    assert(content.includes('command[check_mem]'), 'Missing check_mem in NRPE');
    assert(content.includes('command[check_docker]'), 'Missing check_docker in NRPE');
  });

  // ── TEST 4: Infrastructure Model Schema Verification ───────────
  test('Infrastructure schema contains Nagios monitoring tracking fields', () => {
    const schemaPaths = Infrastructure.schema.paths;
    assert(schemaPaths['monitoringStatus'], 'Missing monitoringStatus in Infrastructure schema');
    assert(schemaPaths['nagiosHostName'], 'Missing nagiosHostName in Infrastructure schema');
    assert(schemaPaths['monitoringRegisteredAt'], 'Missing monitoringRegisteredAt in Infrastructure schema');
    assert(schemaPaths['lastMonitoringCheck'], 'Missing lastMonitoringCheck in Infrastructure schema');
    assert(schemaPaths['monitoringError'], 'Missing monitoringError in Infrastructure schema');
    assert(schemaPaths['monitoringServices'], 'Missing monitoringServices in Infrastructure schema');
  });

  // ── TEST 5: Authorization Validation ───────────────────────────
  await asyncTest('Rejects host registration if user does not own infrastructure', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34',
        save: async function() { return this; }
      })
    });

    try {
      await nagiosService.registerHost(mockInfraId, unauthorizedUserId);
      assert.fail('Should have rejected unauthorized user');
    } catch (err) {
      assert(err.message.includes('Unauthorized'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 6: Lifecycle Gate - Terraform Provisioning State ──────
  await asyncTest('Rejects host registration if Terraform provisioning is not PROVISIONED', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONING',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34',
        save: async function() { return this; }
      })
    });

    try {
      await nagiosService.registerHost(mockInfraId, mockUserId);
      assert.fail('Should have rejected non-PROVISIONED infra');
    } catch (err) {
      assert(err.message.includes('must be PROVISIONED first'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 7: Lifecycle Gate - Ansible Configuration State ───────
  await asyncTest('Rejects host registration if Ansible host configuration is not configured', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'pending',
        publicIp: '54.210.12.34',
        save: async function() { return this; }
      })
    });

    try {
      await nagiosService.registerHost(mockInfraId, mockUserId);
      assert.fail('Should have rejected unconfigured infra');
    } catch (err) {
      assert(err.message.includes('Ansible setup must complete first'), `Unexpected error: ${err.message}`);
    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 8: Security Boundary - Localhost & Loopback Blocking ───
  await asyncTest('Blocks localhost and loopback targets from Nagios registration', async () => {
    const origFind = Infrastructure.findById;
    const dangerousIps = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];

    for (const ip of dangerousIps) {
      Infrastructure.findById = () => ({
        populate: async () => ({
          _id: mockInfraId,
          user: mockUserId,
          status: 'PROVISIONED',
          configurationStatus: 'configured',
          publicIp: ip,
          save: async function() { return this; }
        })
      });

      try {
        await nagiosService.registerHost(mockInfraId, mockUserId);
        assert.fail(`Should have blocked target ${ip}`);
      } catch (err) {
        assert(err.message.includes('Security boundary violation'), `Expected security error for ${ip}, got: ${err.message}`);
      }
    }

    Infrastructure.findById = origFind;
  });

  // ── TEST 9: Dynamic Host Registration & Config File Generation ─
  await asyncTest('Registers host, writes valid Nagios config file, and updates DB status', async () => {
    const origFind = Infrastructure.findById;
    let savedState = null;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34',
        applicationPort: 3000,
        deployment: { _id: mockDeploymentId, name: 'test-app' },
        save: async function() { savedState = this; return this; },
        pushLog: async () => {}
      })
    });

    try {
      const res = await nagiosService.registerHost(mockInfraId, mockUserId);
      assert.strictEqual(res.status, 'registered');
      assert.strictEqual(res.hostName, `stackpilot-infra-${mockInfraId}`);
      assert(res.servicesCount >= 7, `Expected at least 7 services, got ${res.servicesCount}`);

      // Verify file written to disk
      const generatedFile = path.join(nagiosService.NAGIOS_HOSTS_DIR, `${res.hostName}.cfg`);
      assert(fs.existsSync(generatedFile), `Generated config file not found: ${generatedFile}`);

      const fileContent = fs.readFileSync(generatedFile, 'utf8');
      assert(fileContent.includes(`host_name               ${res.hostName}`), 'Config missing host_name');
      assert(fileContent.includes('address                 54.210.12.34'), 'Config missing address');
      assert(fileContent.includes('check_http!3000!/'), 'Config missing HTTP check on port 3000');

      // Verify DB state
      assert.strictEqual(savedState.monitoringStatus, 'registered');
      assert.strictEqual(savedState.nagiosHostName, res.hostName);

    } finally {
      Infrastructure.findById = origFind;
      // Clean up test file
      const testFile = path.join(nagiosService.NAGIOS_HOSTS_DIR, `stackpilot-infra-${mockInfraId}.cfg`);
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  // ── TEST 10: Status and Baseline Services Retrieval ────────────
  await asyncTest('Retrieves monitoring status and baseline services', async () => {
    const origFind = Infrastructure.findById;

    Infrastructure.findById = () => ({
      populate: async () => ({
        _id: mockInfraId,
        user: mockUserId,
        status: 'PROVISIONED',
        configurationStatus: 'configured',
        publicIp: '54.210.12.34',
        monitoringStatus: 'registered',
        nagiosHostName: `stackpilot-infra-${mockInfraId}`,
        monitoringRegisteredAt: new Date(),
        lastMonitoringCheck: new Date(),
        monitoringServices: nagiosService.generateBaselineServices({ applicationPort: 3000 }, false),
        save: async function() { return this; }
      })
    });

    try {
      const statusRes = await nagiosService.getMonitoringStatus(mockInfraId, mockUserId);
      assert.strictEqual(statusRes.registered, true);
      assert.strictEqual(statusRes.hostName, `stackpilot-infra-${mockInfraId}`);
      assert.strictEqual(statusRes.services.length, 7);

      const serviceNames = statusRes.services.map(s => s.name);
      assert(serviceNames.includes('PING'), 'Missing PING check');
      assert(serviceNames.includes('SSH'), 'Missing SSH check');
      assert(serviceNames.includes('Disk Utilization'), 'Missing Disk check');
      assert(serviceNames.includes('CPU Load'), 'Missing CPU Load check');
      assert(serviceNames.includes('Memory Utilization'), 'Missing Memory check');
      assert(serviceNames.includes('Docker Daemon'), 'Missing Docker check');
      assert(serviceNames.includes('Application HTTP Health'), 'Missing HTTP check');

    } finally {
      Infrastructure.findById = origFind;
    }
  });

  // ── TEST 11: Host Deregistration & Cleanup ──────────────────────
  await asyncTest('Deregisters host, removes configuration file, and resets state', async () => {
    const origFind = Infrastructure.findById;
    const hostName = `stackpilot-infra-${mockInfraId}`;
    const testFile = path.join(nagiosService.NAGIOS_HOSTS_DIR, `${hostName}.cfg`);

    // Create temporary dummy file
    fs.writeFileSync(testFile, 'define host { host_name dummy }\n', 'utf8');
    assert(fs.existsSync(testFile), 'Test file was not created');

    let savedState = null;
    Infrastructure.findById = async () => ({
      _id: mockInfraId,
      user: mockUserId,
      monitoringStatus: 'registered',
      nagiosHostName: hostName,
      save: async function() { savedState = this; return this; },
      pushLog: async () => {}
    });

    try {
      const res = await nagiosService.deregisterHost(mockInfraId, mockUserId);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'pending');

      // Verify file deleted
      assert(!fs.existsSync(testFile), 'Host config file should have been deleted');

      // Verify DB state reset
      assert.strictEqual(savedState.monitoringStatus, 'pending');
      assert.strictEqual(savedState.nagiosHostName, null);

    } finally {
      Infrastructure.findById = origFind;
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  // ── TEST 12: Controller Endpoints Verification ─────────────────
  await asyncTest('Controller handles register, status, services, and deregister', async () => {
    const controller = require('../controllers/infrastructureController');
    const origRegister = nagiosService.registerHost;
    const origGetStatus = nagiosService.getMonitoringStatus;
    const origGetServices = nagiosService.getMonitoringServices;
    const origDeregister = nagiosService.deregisterHost;

    try {
      // Mock nagiosService methods
      nagiosService.registerHost = async () => ({ success: true, hostName: 'test-host', status: 'registered' });
      nagiosService.getMonitoringStatus = async () => ({ hostName: 'test-host', status: 'healthy', services: [] });
      nagiosService.getMonitoringServices = async () => ({ hostName: 'test-host', services: [] });
      nagiosService.deregisterHost = async () => ({ success: true, status: 'pending' });

      // Mock Express req & res
      const req = { params: { id: mockInfraId }, user: { id: mockUserId } };

      let registeredOutput = null;
      await controller.registerMonitoring(req, {
        status: (code) => ({
          json: (data) => { registeredOutput = { code, data }; }
        })
      });
      assert.strictEqual(registeredOutput.code, 200);
      assert.strictEqual(registeredOutput.data.status, 'registered');

      let statusOutput = null;
      await controller.getMonitoringStatus(req, {
        json: (data) => { statusOutput = data; }
      });
      assert.strictEqual(statusOutput.status, 'healthy');

      let servicesOutput = null;
      await controller.getMonitoringServices(req, {
        json: (data) => { servicesOutput = data; }
      });
      assert.strictEqual(servicesOutput.hostName, 'test-host');

      let deregisterOutput = null;
      await controller.deregisterMonitoring(req, {
        json: (data) => { deregisterOutput = data; }
      });
      assert.strictEqual(deregisterOutput.status, 'pending');

    } finally {
      nagiosService.registerHost = origRegister;
      nagiosService.getMonitoringStatus = origGetStatus;
      nagiosService.getMonitoringServices = origGetServices;
      nagiosService.deregisterHost = origDeregister;
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
  console.error('Test execution fatal error:', err);
  process.exit(1);
});

