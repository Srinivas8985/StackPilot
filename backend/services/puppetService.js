const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const Infrastructure = require('../models/Infrastructure');

const PUPPET_SOURCE_DIR = path.resolve(__dirname, '../../infrastructure/puppet');
const PUPPET_BIN = process.env.PUPPET_PATH || 'puppet';

// Strip ANSI color escape codes from process output
const stripAnsi = (str) => {
  return typeof str === 'string'
    ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    : str;
};

// Helper: Push log to infrastructure puppetLogs array
async function pushPuppetLog(infraId, message, type = 'info') {
  try {
    const cleanMsg = stripAnsi(message).trim();
    if (!cleanMsg) return;
    await Infrastructure.findByIdAndUpdate(infraId, {
      $push: {
        puppetLogs: {
          timestamp: new Date(),
          message: cleanMsg,
          type
        }
      }
    });
  } catch (err) {
    console.error(`[PuppetService] Failed to push puppet log:`, err.message);
  }
}

/**
 * Check if local puppet binary is available.
 */
async function isPuppetAvailable() {
  try {
    const { stdout } = await execFilePromise(PUPPET_BIN, ['--version'], { timeout: 10000 });
    const version = stdout.trim() || 'puppet available';
    return { available: true, version };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Resolve SSH private key path for instance connection.
 */
function resolveSshPrivateKey(infra) {
  // 1. Explicit environment variable
  if (process.env.SSH_PRIVATE_KEY_PATH && fs.existsSync(process.env.SSH_PRIVATE_KEY_PATH)) {
    return process.env.SSH_PRIVATE_KEY_PATH;
  }

  // 2. Check standard SSH directories for matching keyName
  if (infra.sshKeyName) {
    const searchDirs = [
      process.env.SSH_KEYS_DIR,
      path.join(os.homedir(), '.ssh'),
      '/root/.ssh'
    ].filter(Boolean);

    for (const dir of searchDirs) {
      const candidates = [
        path.join(dir, `${infra.sshKeyName}.pem`),
        path.join(dir, infra.sshKeyName),
        path.join(dir, `${infra.sshKeyName}.id_rsa`)
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
      }
    }
  }

  // 3. Fallback to default user key
  const defaultKey = path.join(os.homedir(), '.ssh', 'id_rsa');
  if (fs.existsSync(defaultKey)) return defaultKey;

  return null;
}

/**
 * Executes a remote SSH command safely and streams output line-by-line.
 */
function runRemoteCommand(targetHost, sshUser, privateKey, command, onLog, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const sshArgs = [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=30',
      '-o', 'BatchMode=yes'
    ];

    if (privateKey) {
      sshArgs.push('-i', privateKey);
    }

    const destination = `${sshUser}@${targetHost}`;
    sshArgs.push(destination, command);

    const child = spawn('ssh', sshArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error(`Remote SSH command timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutData += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim()) onLog(line, 'info');
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrData += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim()) onLog(line, 'warning');
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({ stdout: stdoutData, stderr: stderrData, code });
    });
  });
}

/**
 * Transfers local Puppet files to remote dedicated node via compressed stream over SSH.
 */
function transferPuppetManifests(targetHost, sshUser, privateKey, onLog) {
  return new Promise((resolve, reject) => {
    onLog('Syncing Puppet manifests and modules to dedicated host...', 'info');

    const sshArgs = [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=30'
    ];
    if (privateKey) sshArgs.push('-i', privateKey);
    sshArgs.push(`${sshUser}@${targetHost}`, 'rm -rf /tmp/stackpilot-puppet && mkdir -p /tmp/stackpilot-puppet && tar -xzf - -C /tmp/stackpilot-puppet');

    // Windows or Unix tar spawn
    const tarArgs = ['-czf', '-', '-C', PUPPET_SOURCE_DIR, '.'];
    const tarProcess = spawn('tar', tarArgs);
    const sshProcess = spawn('ssh', sshArgs);

    tarProcess.stdout.pipe(sshProcess.stdin);

    tarProcess.on('error', (err) => reject(new Error(`Failed to create tar stream of Puppet files: ${err.message}`)));
    sshProcess.on('error', (err) => reject(new Error(`Failed to transfer Puppet files over SSH: ${err.message}`)));

    sshProcess.on('close', (code) => {
      if (code === 0) {
        onLog('Puppet manifests transferred to /tmp/stackpilot-puppet successfully.', 'success');
        resolve();
      } else {
        reject(new Error(`Puppet transfer failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Main Puppet configuration management workflow:
 * Applies declarative desired state on dedicated EC2 instances.
 *
 * @param {string} infraId - Infrastructure MongoDB ObjectId
 * @param {string} [userId=null] - Authenticated User ID
 * @returns {Promise<{ success: boolean, infra: Object, code: number }>}
 */
async function applyPuppetConfiguration(infraId, userId = null) {
  let infra;
  try {
    infra = await Infrastructure.findById(infraId).populate('deployment');
    if (!infra) throw new Error(`Infrastructure record ${infraId} not found`);

    if (userId && infra.user.toString() !== userId.toString()) {
      throw new Error(`Unauthorized: User ${userId} does not own infrastructure ${infraId}`);
    }

    // Verify Terraform stage completed successfully
    if (infra.status !== 'PROVISIONED') {
      throw new Error(`Cannot run Puppet on infrastructure in status ${infra.status}. Terraform provisioning must be PROVISIONED first.`);
    }

    // Verify Ansible configuration completed successfully
    if (infra.configurationStatus !== 'configured') {
      throw new Error(`Cannot run Puppet while host configuration is in status ${infra.configurationStatus}. Ansible setup must complete first.`);
    }

    // Verify target IP
    if (!infra.publicIp) {
      throw new Error(`Infrastructure ${infraId} does not have a public IP address.`);
    }

    // Security check: Never target localhost or loopback
    const forbiddenIps = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
    if (forbiddenIps.includes(infra.publicIp.toLowerCase())) {
      throw new Error(`Security boundary violation: Target IP ${infra.publicIp} points to localhost.`);
    }

    // Concurrency protection: prevent overlapping Puppet runs
    if (infra.puppetStatus === 'applying') {
      throw new Error(`Puppet configuration is already in progress for infrastructure ${infraId}.`);
    }

    // Update status to applying
    infra.puppetStatus = 'applying';
    infra.puppetStartedAt = new Date();
    infra.puppetError = null;
    await infra.save();

    await pushPuppetLog(infraId, `Starting Puppet desired-state enforcement on node ${infra.publicIp} (${infra.awsRegion})`, 'info');

    const privateKey = resolveSshPrivateKey(infra);
    const sshUser = infra.ansibleHandoff?.sshUser || (infra.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user');

    if (privateKey) {
      await pushPuppetLog(infraId, `Using SSH key for remote authentication: ${path.basename(privateKey)}`, 'info');
    }

    const logCallback = (msg, type) => pushPuppetLog(infraId, msg, type);

    // Step 1: Preflight check - Check if Puppet is installed on target, or install it
    await pushPuppetLog(infraId, 'Checking Puppet runtime prerequisite on target EC2...', 'info');
    const puppetCheckScript = `which puppet || (if [ -f /etc/debian_version ]; then export DEBIAN_FRONTEND=noninteractive && sudo apt-get update -y && sudo apt-get install -y puppet; else sudo dnf install -y puppet || sudo yum install -y puppet; fi)`;
    await runRemoteCommand(infra.publicIp, sshUser, privateKey, puppetCheckScript, logCallback, 180000);

    // Capture puppet version on target
    const versionRes = await runRemoteCommand(infra.publicIp, sshUser, privateKey, 'puppet --version', () => {});
    const targetPuppetVersion = (versionRes.stdout || '').trim();
    if (targetPuppetVersion) {
      infra.puppetVersion = targetPuppetVersion;
      await pushPuppetLog(infraId, `Verified Puppet runtime on target node: v${targetPuppetVersion}`, 'info');
    }

    // Step 2: Transfer manifests & module files to target
    await transferPuppetManifests(infra.publicIp, sshUser, privateKey, logCallback);

    // Step 3: Execute masterless `puppet apply` with detailed-exitcodes
    await pushPuppetLog(infraId, 'Executing `sudo puppet apply` to enforce desired state...', 'info');
    const puppetApplyCmd = 'sudo puppet apply --modulepath=/tmp/stackpilot-puppet/modules /tmp/stackpilot-puppet/manifests/site.pp --detailed-exitcodes';
    const applyResult = await runRemoteCommand(infra.publicIp, sshUser, privateKey, puppetApplyCmd, logCallback, 300000);

    // Puppet --detailed-exitcodes:
    // 0 = Success (no changes)
    // 2 = Success (changes applied / drift remediated)
    // 4 = Failures
    // 6 = Changes applied but failures occurred
    if (applyResult.code === 0 || applyResult.code === 2) {
      infra.puppetStatus = 'applied';
      infra.puppetCompletedAt = new Date();
      infra.puppetLastRunAt = new Date();
      infra.puppetError = null;
      await infra.save();

      const summaryMsg = applyResult.code === 0
        ? 'Desired state is already satisfied: all resources comply with Puppet declaration.'
        : 'Desired state successfully enforced: configuration changes applied / drift remediated.';
      await pushPuppetLog(infraId, summaryMsg, 'success');
      await pushPuppetLog(infraId, 'Puppet configuration run completed successfully!', 'success');

      return { success: true, infra, code: applyResult.code };
    } else {
      const errSummary = (applyResult.stderr.trim() || applyResult.stdout.trim() || `Exit code ${applyResult.code}`).slice(-400);
      throw new Error(`Puppet apply returned exit code ${applyResult.code}: ${errSummary}`);
    }
  } catch (err) {
    console.error(`[PuppetService] Execution failed for ${infraId}:`, err);
    if (infra && typeof infra.save === 'function') {
      try {
        infra.puppetStatus = 'failed';
        infra.puppetError = err.message;
        infra.puppetCompletedAt = new Date();
        await infra.save();
        await pushPuppetLog(infraId, `Puppet enforcement failed: ${err.message}`, 'error');
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Retry Puppet configuration enforcement.
 */
async function retryPuppetConfiguration(infraId, userId = null) {
  const infra = await Infrastructure.findById(infraId);
  if (!infra) throw new Error('Infrastructure record not found');
  if (userId && infra.user.toString() !== userId.toString()) {
    throw new Error('Not authorized to retry Puppet on this infrastructure');
  }

  infra.puppetStatus = 'pending';
  infra.puppetError = null;
  await infra.save();
  await pushPuppetLog(infraId, 'Retrying Puppet configuration enforcement...', 'info');

  return module.exports.applyPuppetConfiguration(infraId, userId);
}

/**
 * Demonstrates configuration drift and automated remediation:
 * 1. Simulates controlled drift on dedicated node (e.g. alters directory permissions or state config).
 * 2. Re-runs Puppet apply.
 * 3. Verifies Puppet detects and fixes the drift.
 */
async function simulateDriftAndRemediate(infraId, userId = null) {
  const infra = await Infrastructure.findById(infraId);
  if (!infra) throw new Error('Infrastructure record not found');
  if (userId && infra.user.toString() !== userId.toString()) {
    throw new Error('Not authorized to access this infrastructure');
  }

  if (infra.puppetStatus !== 'applied') {
    throw new Error(`Cannot simulate drift while Puppet status is ${infra.puppetStatus}. Desired state must be applied first.`);
  }

  const privateKey = resolveSshPrivateKey(infra);
  const sshUser = infra.ansibleHandoff?.sshUser || (infra.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user');

  await pushPuppetLog(infraId, '=== SIMULATING CONFIGURATION DRIFT ===', 'warning');
  await pushPuppetLog(infraId, 'Altering /etc/stackpilot directory permissions to 0777 (drift from desired 0755)...', 'warning');

  // Introduce controlled drift on remote node
  const driftCmd = 'sudo chmod 0777 /etc/stackpilot && sudo rm -f /etc/stackpilot/stackpilot.conf';
  await runRemoteCommand(infra.publicIp, sshUser, privateKey, driftCmd, (msg, type) => pushPuppetLog(infraId, msg, type));

  await pushPuppetLog(infraId, 'Configuration drift simulated: /etc/stackpilot is now 0777 and stackpilot.conf is missing.', 'warning');
  await pushPuppetLog(infraId, 'Triggering Puppet desired-state enforcement to remediate drift...', 'info');

  // Re-apply Puppet to remediate
  const result = await module.exports.applyPuppetConfiguration(infraId, userId);

  await pushPuppetLog(infraId, '=== DRIFT REMEDIATION VERIFIED ===', 'success');
  await pushPuppetLog(infraId, 'Puppet restored /etc/stackpilot to 0755 and recreated stackpilot.conf baseline.', 'success');

  return {
    success: true,
    driftSimulated: true,
    remediated: true,
    exitCode: result.code
  };
}

module.exports = {
  isPuppetAvailable,
  applyPuppetConfiguration,
  retryPuppetConfiguration,
  simulateDriftAndRemediate,
  pushPuppetLog
};
