const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const Infrastructure = require('../models/Infrastructure');
const Deployment = require('../models/Deployment');
const { configureDedicatedInfrastructure } = require('./ansibleService');

const TERRAFORM_BIN = process.env.TERRAFORM_PATH || 'terraform';
const TEMPLATES_DIR = path.resolve(__dirname, '../../infrastructure/terraform');
const WORK_BASE_DIR = process.env.TERRAFORM_WORK_DIR || path.join(os.tmpdir(), 'stackpilot', 'terraform');

// Strip ANSI color escape codes from process output
const stripAnsi = (str) => {
  return typeof str === 'string'
    ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    : str;
};

// Helper: Push log to infrastructure document
async function pushInfraLog(infraId, message, type = 'info') {
  try {
    const cleanMsg = stripAnsi(message).trim();
    if (!cleanMsg) return;
    await Infrastructure.findByIdAndUpdate(infraId, {
      $push: {
        logs: {
          timestamp: new Date(),
          message: cleanMsg,
          type
        }
      }
    });
  } catch (err) {
    console.error(`[TerraformService] Failed to push log:`, err.message);
  }
}

/**
 * Check if Terraform binary is available on the host system.
 */
async function isTerraformAvailable() {
  try {
    const { stdout } = await execFilePromise(TERRAFORM_BIN, ['version'], { timeout: 10000 });
    return { available: true, version: stdout.split('\n')[0] };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Prepare an isolated working directory for a deployment's Terraform execution.
 * Copies templates and writes a deployment-specific terraform.tfvars.json.
 */
async function prepareWorkspace(infra, deployment) {
  const workDir = path.join(WORK_BASE_DIR, infra.stateIdentifier);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  // Files to copy from templates
  const templateFiles = [
    'main.tf',
    'providers.tf',
    'versions.tf',
    'variables.tf',
    'outputs.tf',
    'security-groups.tf',
    'user-data.sh'
  ];

  for (const file of templateFiles) {
    const src = path.join(TEMPLATES_DIR, file);
    const dest = path.join(workDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      throw new Error(`Required Terraform template missing: ${file}`);
    }
  }

  // Safe parameters via JSON to prevent shell injection or syntax issues
  const tfvars = {
    aws_region: infra.awsRegion || 'us-east-1',
    instance_type: infra.instanceType || 't3.micro',
    ami_os: infra.amiOs || 'ubuntu',
    deployment_id: deployment._id.toString(),
    infrastructure_id: infra._id.toString(),
    environment: deployment.environment || 'development',
    app_port: infra.applicationPort || deployment.buildConfig?.exposedPort || 3000,
    ssh_allowed_cidr: infra.sshAllowedCidr || '0.0.0.0/0',
    app_allowed_cidr: infra.appAllowedCidr || '0.0.0.0/0',
    ssh_key_name: infra.sshKeyName || '',
    root_volume_size: 20,
    resource_tags: {
      DeploymentName: deployment.name || 'unnamed',
      Owner: infra.user ? infra.user.toString() : 'stackpilot'
    }
  };

  const varsPath = path.join(workDir, 'terraform.tfvars.json');
  fs.writeFileSync(varsPath, JSON.stringify(tfvars, null, 2), 'utf-8');

  // Update working directory path in document
  infra.terraformWorkingDir = workDir;
  await infra.save();

  return workDir;
}

/**
 * Execute a Terraform CLI command with streaming logs and timeout handling.
 */
function runTerraformCommand(workDir, args, onLog, timeoutMs = 900000) {
  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    // Use current process environment including AWS credentials if set
    const env = { ...process.env };

    const child = spawn(TERRAFORM_BIN, args, {
      cwd: workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error(`Terraform command timed out after ${timeoutMs / 1000} seconds`));
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
        const errorMsg = stderrData.trim() || stdoutData.trim() || `Process exited with code ${code}`;
        reject(new Error(`Terraform exited with code ${code}: ${errorMsg.slice(-500)}`));
      }
    });
  });
}

/**
 * Primary asynchronous provisioning workflow.
 */
async function provisionDedicatedInfrastructure(infraId) {
  let infra;
  try {
    infra = await Infrastructure.findById(infraId).populate('deployment');
    if (!infra) throw new Error(`Infrastructure record ${infraId} not found`);

    const deployment = infra.deployment;
    if (!deployment) throw new Error(`Deployment associated with ${infraId} not found`);

    // Prevent duplicate concurrent provisioning
    if (['INITIALIZING', 'PLANNING', 'PROVISIONING'].includes(infra.status)) {
      console.log(`[TerraformService] Provisioning already in progress for ${infraId}.`);
      return;
    }

    // Pre-flight check: Verify Terraform binary
    const tfCheck = await isTerraformAvailable();
    if (!tfCheck.available) {
      const errMsg = `Terraform CLI binary is not available on PATH: ${tfCheck.error}. Please install Terraform or configure TERRAFORM_PATH.`;
      await pushInfraLog(infraId, errMsg, 'error');
      infra.status = 'FAILED';
      infra.errorDetails = errMsg;
      await infra.save();
      await Deployment.findByIdAndUpdate(deployment._id, { status: 'failed' });
      return;
    }

    // Step 1: Initialize Workspace
    infra.status = 'INITIALIZING';
    infra.provisioningStartedAt = new Date();
    infra.errorDetails = null;
    await infra.save();

    await pushInfraLog(infraId, `Starting dedicated infrastructure provisioning for ${deployment.name} in region ${infra.awsRegion}`, 'info');
    await pushInfraLog(infraId, `Terraform version: ${tfCheck.version}`, 'info');

    const workDir = await prepareWorkspace(infra, deployment);
    await pushInfraLog(infraId, `Isolated Terraform workspace created: ${workDir}`, 'info');

    const logCallback = (msg, type) => pushInfraLog(infraId, msg, type);

    // Step 2: terraform init
    await pushInfraLog(infraId, 'Executing terraform init...', 'info');
    await runTerraformCommand(workDir, ['init', '-no-color'], logCallback, 180000);
    await pushInfraLog(infraId, 'Terraform initialized successfully.', 'success');

    // Step 3: terraform plan
    infra.status = 'PLANNING';
    await infra.save();
    await pushInfraLog(infraId, 'Executing terraform plan...', 'info');
    await runTerraformCommand(workDir, ['plan', '-no-color', '-out=tfplan'], logCallback, 300000);
    await pushInfraLog(infraId, 'Terraform execution plan generated successfully.', 'success');

    // Step 4: terraform apply
    infra.status = 'PROVISIONING';
    await infra.save();
    await pushInfraLog(infraId, 'Executing terraform apply (provisioning AWS EC2 & Security Group)...', 'info');
    await runTerraformCommand(workDir, ['apply', '-no-color', '-auto-approve', 'tfplan'], logCallback, 600000);
    await pushInfraLog(infraId, 'Terraform apply completed.', 'success');

    // Step 5: Capture outputs
    await pushInfraLog(infraId, 'Reading Terraform output attributes...', 'info');
    const { stdout: outputsJson } = await execFilePromise(TERRAFORM_BIN, ['output', '-json'], {
      cwd: workDir,
      timeout: 30000
    });

    const parsedOutputs = JSON.parse(outputsJson || '{}');
    const instanceId = parsedOutputs.instance_id?.value || null;
    const publicIp = parsedOutputs.public_ip?.value || null;
    const privateIp = parsedOutputs.private_ip?.value || null;
    const availabilityZone = parsedOutputs.availability_zone?.value || null;
    const securityGroupId = parsedOutputs.security_group_id?.value || null;
    const appUrl = parsedOutputs.application_url?.value || (publicIp ? `http://${publicIp}:${infra.applicationPort}` : null);
    const sshUser = parsedOutputs.ssh_user?.value || (infra.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user');

    // Clean handoff payload for subsequent Ansible configuration and Jenkins deployment
    const ansibleHandoff = {
      instanceId,
      publicIp,
      privateIp,
      sshConnectionInfo: {
        user: sshUser,
        host: publicIp,
        port: 22,
        keyName: infra.sshKeyName || null
      },
      awsRegion: infra.awsRegion,
      deploymentId: deployment._id.toString(),
      infrastructureId: infra._id.toString(),
      applicationPort: infra.applicationPort,
      environment: deployment.environment,
      readyForAnsible: true,
      readyForJenkins: true
    };

    // Update Infrastructure record
    infra.status = 'PROVISIONED';
    infra.configurationStatus = 'pending';
    infra.ec2InstanceId = instanceId;
    infra.publicIp = publicIp;
    infra.privateIp = privateIp;
    infra.availabilityZone = availabilityZone;
    infra.securityGroupId = securityGroupId;
    infra.applicationUrl = appUrl;
    infra.provisioningCompletedAt = new Date();
    infra.outputs = parsedOutputs;
    infra.ansibleHandoff = ansibleHandoff;
    await infra.save();

    // Mark deployment as deploying until Ansible automated configuration finishes
    await Deployment.findByIdAndUpdate(deployment._id, {
      status: 'deploying',
      deploymentUrl: appUrl
    });

    await pushInfraLog(infraId, `Dedicated infrastructure provisioned successfully!`, 'success');
    await pushInfraLog(infraId, `EC2 Instance ID: ${instanceId}`, 'success');
    await pushInfraLog(infraId, `Public IP: ${publicIp}`, 'success');
    await pushInfraLog(infraId, `Application URL: ${appUrl}`, 'success');
    await pushInfraLog(infraId, `Workflow Handoff: Handing off to Ansible automated configuration management...`, 'info');

    // Trigger Ansible Configuration stage
    setImmediate(() => {
      configureDedicatedInfrastructure(infraId).catch(ansibleErr => {
        console.error(`[TerraformService] Auto Ansible configuration error:`, ansibleErr.message);
      });
    });

  } catch (err) {
    console.error(`[TerraformService] Provisioning failed for ${infraId}:`, err);
    if (infra) {
      infra.status = 'FAILED';
      infra.errorDetails = err.message;
      await infra.save();
      await pushInfraLog(infraId, `Provisioning failed: ${err.message}`, 'error');
      if (infra.deployment) {
        await Deployment.findByIdAndUpdate(infra.deployment._id || infra.deployment, { status: 'failed' });
      }
    }
  }
}

/**
 * Destroy dedicated infrastructure using terraform destroy.
 */
async function destroyDedicatedInfrastructure(infraId) {
  let infra;
  try {
    infra = await Infrastructure.findById(infraId).populate('deployment');
    if (!infra) throw new Error(`Infrastructure record ${infraId} not found`);

    if (infra.status === 'DESTROYED') {
      return { msg: 'Infrastructure already destroyed' };
    }

    if (infra.status === 'DESTROYING') {
      return { msg: 'Destruction already in progress' };
    }

    const workDir = infra.terraformWorkingDir || path.join(WORK_BASE_DIR, infra.stateIdentifier);
    if (!fs.existsSync(workDir)) {
      throw new Error(`Terraform workspace directory ${workDir} does not exist.`);
    }

    infra.status = 'DESTROYING';
    await infra.save();
    await pushInfraLog(infraId, 'Starting terraform destroy...', 'warning');

    // Clean up Nagios monitoring registration if host was registered
    try {
      const nagiosService = require('./nagiosService');
      await nagiosService.deregisterHost(infraId);
      await pushInfraLog(infraId, 'Nagios monitoring host registration cleaned up.', 'info');
    } catch (cleanupErr) {
      console.warn(`[TerraformService] Nagios deregistration note for ${infraId}:`, cleanupErr.message);
    }

    const logCallback = (msg, type) => pushInfraLog(infraId, msg, type);

    // Execute terraform destroy
    await runTerraformCommand(workDir, ['destroy', '-no-color', '-auto-approve'], logCallback, 600000);

    infra.status = 'DESTROYED';
    infra.destroyedAt = new Date();
    infra.publicIp = null;
    infra.applicationUrl = null;
    await infra.save();

    if (infra.deployment) {
      await Deployment.findByIdAndUpdate(infra.deployment._id || infra.deployment, {
        status: 'stopped',
        deploymentUrl: null
      });
    }

    await pushInfraLog(infraId, 'Dedicated AWS resources destroyed successfully.', 'success');
    return { success: true };

  } catch (err) {
    console.error(`[TerraformService] Destroy failed for ${infraId}:`, err);
    if (infra) {
      infra.status = 'FAILED';
      infra.errorDetails = `Destroy failed: ${err.message}`;
      await infra.save();
      await pushInfraLog(infraId, `Destroy failed: ${err.message}`, 'error');
    }
    throw err;
  }
}

module.exports = {
  isTerraformAvailable,
  prepareWorkspace,
  provisionDedicatedInfrastructure,
  destroyDedicatedInfrastructure,
  pushInfraLog
};

