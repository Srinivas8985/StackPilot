const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const Infrastructure = require('../models/Infrastructure');
const Deployment = require('../models/Deployment');

const ANSIBLE_PLAYBOOK_BIN = process.env.ANSIBLE_PLAYBOOK_PATH || 'ansible-playbook';
const ANSIBLE_SOURCE_DIR = path.resolve(__dirname, '../../infrastructure/ansible');
const WORK_BASE_DIR = process.env.TERRAFORM_WORK_DIR || path.join(os.tmpdir(), 'stackpilot', 'terraform');

// Strip ANSI color escape codes from process output
const stripAnsi = (str) => {
  return typeof str === 'string'
    ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    : str;
};

// Helper: Push log to infrastructure configurationLogs array
async function pushConfigLog(infraId, message, type = 'info') {
  try {
    const cleanMsg = stripAnsi(message).trim();
    if (!cleanMsg) return;
    await Infrastructure.findByIdAndUpdate(infraId, {
      $push: {
        configurationLogs: {
          timestamp: new Date(),
          message: cleanMsg,
          type
        }
      }
    });
  } catch (err) {
    console.error(`[AnsibleService] Failed to push configuration log:`, err.message);
  }
}

/**
 * Check if ansible-playbook CLI binary is available on the system.
 */
async function isAnsibleAvailable() {
  try {
    const { stdout } = await execFilePromise(ANSIBLE_PLAYBOOK_BIN, ['--version'], { timeout: 10000 });
    const versionLine = stdout.split('\n')[0] || 'ansible-playbook available';
    return { available: true, version: versionLine.trim() };
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

  // 2. Check if a key named after sshKeyName exists in standard SSH directory
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
 * Prepare an isolated inventory and configuration directory for this deployment.
 */
async function prepareAnsibleWorkspace(infra, deployment) {
  const ansibleWorkDir = path.join(WORK_BASE_DIR, infra.stateIdentifier, 'ansible');
  if (!fs.existsSync(ansibleWorkDir)) {
    fs.mkdirSync(ansibleWorkDir, { recursive: true });
  }

  const sshUser = infra.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user';
  const privateKey = resolveSshPrivateKey(infra);

  // Copy or reference ansible.cfg
  const srcCfg = path.join(ANSIBLE_SOURCE_DIR, 'ansible.cfg');
  const destCfg = path.join(ansibleWorkDir, 'ansible.cfg');
  if (fs.existsSync(srcCfg)) {
    fs.copyFileSync(srcCfg, destCfg);
  }

  // Generate deployment-specific isolated inventory
  let hostLine = `dedicated-node ansible_host=${infra.publicIp} ansible_user=${sshUser}`;
  if (privateKey) {
    hostLine += ` ansible_ssh_private_key_file=${privateKey}`;
  }
  hostLine += ` deployment_id=${deployment._id.toString()} infrastructure_id=${infra._id.toString()}`;

  const inventoryContent = `[dedicated_hosts]\n${hostLine}\n`;
  const inventoryPath = path.join(ansibleWorkDir, 'hosts.ini');
  fs.writeFileSync(inventoryPath, inventoryContent, 'utf-8');

  return { ansibleWorkDir, inventoryPath, privateKey, sshUser };
}

/**
 * Execute ansible-playbook safely with argument arrays and real-time log capture.
 */
function runAnsibleProcess(workDir, args, onLog, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const env = {
      ...process.env,
      ANSIBLE_CONFIG: path.join(workDir, 'ansible.cfg'),
      ANSIBLE_FORCE_COLOR: 'false',
      ANSIBLE_HOST_KEY_CHECKING: 'false'
    };

    const child = spawn(ANSIBLE_PLAYBOOK_BIN, args, {
      cwd: workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error(`Ansible playbook execution timed out after ${timeoutMs / 1000} seconds`));
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

      if (code === 0) {
        resolve({ stdout: stdoutData, stderr: stderrData });
      } else {
        const errorSummary = stderrData.trim() || stdoutData.trim() || `Process exited with code ${code}`;
        reject(new Error(`Ansible playbook failed with exit code ${code}: ${errorSummary.slice(-400)}`));
      }
    });
  });
}

/**
 * Primary asynchronous Ansible configuration workflow.
 */
async function configureDedicatedInfrastructure(infraId, userId = null) {
  let infra;
  try {
    infra = await Infrastructure.findById(infraId).populate('deployment');
    if (!infra) throw new Error(`Infrastructure record ${infraId} not found`);

    if (userId && infra.user.toString() !== userId.toString()) {
      throw new Error(`Unauthorized: User ${userId} does not own infrastructure ${infraId}`);
    }

    const deployment = infra.deployment;
    if (!deployment) throw new Error(`Deployment associated with infrastructure ${infraId} not found`);

    // Verify Terraform stage completed successfully
    if (infra.status !== 'PROVISIONED') {
      throw new Error(`Cannot configure infrastructure in status ${infra.status}. Terraform provisioning must be PROVISIONED first.`);
    }

    // Verify target IP is present and valid
    if (!infra.publicIp) {
      throw new Error(`Infrastructure ${infraId} does not have a public IP address.`);
    }

    // Safety check: Never target the host running StackPilot or localhost
    const forbiddenIps = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
    if (forbiddenIps.includes(infra.publicIp.toLowerCase())) {
      throw new Error(`Security violation: Target IP ${infra.publicIp} points to localhost.`);
    }

    // Prevent duplicate concurrent configuration
    if (infra.configurationStatus === 'configuring') {
      console.log(`[AnsibleService] Configuration already in progress for ${infraId}.`);
      return;
    }

    // Pre-flight check: Verify Ansible CLI availability
    const ansibleCheck = await isAnsibleAvailable();
    if (!ansibleCheck.available) {
      const errMsg = `Ansible CLI ('ansible-playbook') is not installed or available on PATH: ${ansibleCheck.error}. Please install Ansible on the host.`;
      await pushConfigLog(infraId, errMsg, 'error');
      infra.configurationStatus = 'failed';
      infra.configurationError = errMsg;
      await infra.save();
      await Deployment.findByIdAndUpdate(deployment._id, { status: 'failed' });
      return;
    }

    // Step 1: Update status to configuring
    infra.configurationStatus = 'configuring';
    infra.configurationStartedAt = new Date();
    infra.configurationError = null;
    infra.ansibleVersion = ansibleCheck.version;
    await infra.save();

    await pushConfigLog(infraId, `Starting Ansible configuration for dedicated node ${infra.publicIp} (${infra.awsRegion})`, 'info');
    await pushConfigLog(infraId, `Ansible version: ${ansibleCheck.version}`, 'info');

    // Step 2: Prepare isolated workspace & inventory
    const { ansibleWorkDir, inventoryPath, privateKey, sshUser } = await prepareAnsibleWorkspace(infra, deployment);
    await pushConfigLog(infraId, `Generated dynamic inventory: ${inventoryPath}`, 'info');

    if (privateKey) {
      await pushConfigLog(infraId, `Using SSH private key: ${path.basename(privateKey)}`, 'info');
    } else {
      await pushConfigLog(infraId, `Note: No explicit SSH private key file matched for keyName '${infra.sshKeyName}'. Attempting default SSH agent/environment.`, 'warning');
    }

    const playbookFile = path.join(ANSIBLE_SOURCE_DIR, 'playbooks', 'configure-ec2.yml');
    if (!fs.existsSync(playbookFile)) {
      throw new Error(`Ansible playbook file not found: ${playbookFile}`);
    }

    const logCallback = (msg, type) => pushConfigLog(infraId, msg, type);

    // Step 3: Run ansible-playbook with safe argument array
    const args = [
      '-i', inventoryPath,
      playbookFile,
      '--extra-vars', JSON.stringify({
        deployment_id: deployment._id.toString(),
        infrastructure_id: infra._id.toString(),
        ansible_user: sshUser
      })
    ];

    await pushConfigLog(infraId, 'Executing ansible-playbook (system preparation, official Docker installation & verification)...', 'info');
    await runAnsibleProcess(ansibleWorkDir, args, logCallback, 600000);

    // Step 4: Configuration Succeeded!
    infra.configurationStatus = 'configured';
    infra.configurationCompletedAt = new Date();
    infra.configurationError = null;

    // Update handoff metadata: explicitly flag readiness for remote Jenkins deployment
    if (infra.ansibleHandoff) {
      infra.ansibleHandoff.readyForJenkins = true;
      infra.ansibleHandoff.configuredAt = new Date();
      infra.markModified('ansibleHandoff');
    }

    await infra.save();

    // Mark deployment as running (fully configured and ready)
    await Deployment.findByIdAndUpdate(deployment._id, {
      status: 'running',
      deploymentUrl: infra.applicationUrl
    });

    await pushConfigLog(infraId, 'Ansible automated configuration completed successfully!', 'success');
    await pushConfigLog(infraId, `Docker Engine verified and operational on dedicated node ${infra.publicIp}`, 'success');
    await pushConfigLog(infraId, 'Dedicated node is ready for Jenkins application deployment.', 'success');

  } catch (err) {
    console.error(`[AnsibleService] Configuration failed for ${infraId}:`, err);
    if (infra) {
      infra.configurationStatus = 'failed';
      infra.configurationError = err.message;
      await infra.save();
      await pushConfigLog(infraId, `Ansible configuration failed: ${err.message}`, 'error');
      if (infra.deployment) {
        await Deployment.findByIdAndUpdate(infra.deployment._id || infra.deployment, { status: 'failed' });
      }
    }
    throw err;
  }
}

/**
 * Retry Ansible configuration on a failed infrastructure record.
 */
async function retryAnsibleConfiguration(infraId, userId = null) {
  const infra = await Infrastructure.findById(infraId);
  if (!infra) throw new Error(`Infrastructure ${infraId} not found`);

  if (userId && infra.user.toString() !== userId.toString()) {
    throw new Error(`Unauthorized: User does not own infrastructure ${infraId}`);
  }

  if (infra.configurationStatus !== 'failed' && infra.status !== 'PROVISIONED') {
    throw new Error(`Cannot retry configuration: status is '${infra.configurationStatus}'. Only 'failed' state can be retried.`);
  }

  infra.configurationStatus = 'pending';
  infra.configurationError = null;
  await infra.save();

  // Run in background
  setImmediate(() => {
    configureDedicatedInfrastructure(infraId, userId).catch(err => {
      console.error(`[AnsibleService] Background retry error:`, err);
    });
  });

  return infra;
}

module.exports = {
  isAnsibleAvailable,
  configureDedicatedInfrastructure,
  retryAnsibleConfiguration,
  resolveSshPrivateKey,
  pushConfigLog
};

