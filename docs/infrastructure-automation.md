# StackPilot: Infrastructure Automation, Remote CI/CD & Active Monitoring

## 1. Overview & Architectural Context

StackPilot is an AI-assisted application deployment platform supporting two distinct infrastructure and CI/CD deployment models:

### 1. Shared Infrastructure Deployment (Local Host Execution)
- Builds application Docker images on the Jenkins CI machine.
- Deploys application containers locally onto the StackPilot host EC2 instance.
- Uses dynamic port pool allocation (`4000-4999`) and internal Nginx reverse-proxy routing.
- Zero extra cloud infrastructure cost; preserves 100% backward compatibility.

### 2. Dedicated Infrastructure Deployment (Automated 5-Stage DevOps Pipeline)
- **Stage 1: Terraform Provisioning**: Provisions an isolated AWS EC2 instance, elastic IP/public IP, and dedicated security group.
- **Stage 2: Ansible Configuration**: Idempotently prepares the operating system, installs official Docker CE Engine, verifies daemon health, and configures non-root docker permissions.
- **Stage 3: Puppet Desired-State Enforcement & Drift Control**: Declaratively enforces baseline configurations (Docker service persistence, `docker` group membership, directory baselines `/etc/stackpilot`, `/var/log/stackpilot`, `/opt/stackpilot`), preconfigures Nagios NRPE monitoring agents on port `5666`, and provides automated drift remediation.
- **Stage 4: Jenkins Remote Deployment**: Builds the application container, streams the Docker image over an encrypted SSH pipe directly to the dedicated EC2 instance, runs the container remotely, verifies its health, and publishes the dedicated application URL (`http://<publicIp>:<port>`).
- **Stage 5: Nagios Active Infrastructure & Service Monitoring**: Dynamically registers dedicated EC2 instances with Nagios Core, monitors network reachability, SSH, disk space, CPU load, memory utilization, Docker daemon state, and user application HTTP endpoint availability.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                          StackPilot Deployment Models                          │
└────────────────────────────────────────────────────────────────────────────────┘

  SHARED DEPLOYMENT WORKFLOW:
  [User Code] ──► [Jenkins Build] ──► [Deploy Container on StackPilot EC2 Host]
                                                │
                                                ▼
                                    http://localhost:<pool-port>

  DEDICATED DEPLOYMENT WORKFLOW (5 STAGES):
  [User Code] ──► Stage 1: Terraform ──► AWS EC2 Provisioned (Public IP assigned)
                         │
                         ▼
                  Stage 2: Ansible   ──► System Baseline & Docker Engine Configured
                         │
                         ▼
                  Stage 3: Puppet    ──► Declarative Desired State & Drift Remediated
                         │               (NRPE Agent installed & configured)
                         ▼
                  Stage 4: Jenkins   ──► Docker Image Streamed over SSH
                         │           ──► Container Running on Dedicated EC2
                         ▼
                  Stage 5: Nagios    ──► Central Active Monitoring (Port 5666 NRPE)
                                     ──► Host Health, Docker & HTTP Endpoints Checked
```

> [!CRITICAL]
> **Host Isolation Guarantee**: All Terraform operations, Ansible configurations, Puppet state applications, Jenkins remote deployments, and Nagios checks target *only* the newly provisioned dedicated EC2 instance. The host EC2 instance hosting StackPilot itself is never modified, replaced, or terminated. Dedicated applications never run on the StackPilot host server.

---

## 2. Directory Structure

```
infrastructure/
  ├── terraform/
  │   ├── .gitignore
  │   ├── README.md
  │   ├── main.tf                    # AWS EC2 instance & AMI resolution
  │   ├── outputs.tf                 # Public IP, instance ID, connection info
  │   ├── providers.tf               # AWS provider constraints & default tags
  │   ├── security-groups.tf         # Dedicated security group with restricted SSH
  │   ├── user-data.sh               # Cloud-init bootstrap script
  │   ├── variables.tf               # Input parameter definitions
  │   └── versions.tf                # Terraform & AWS provider version constraints
  ├── ansible/
  │   ├── ansible.cfg                # Strict host checking & pipelining config
  │   ├── group_vars/
  │   │   └── all.yml                # System and Docker package variables
  │   ├── inventories/
  │   │   └── hosts.example          # Sample inventory
  │   ├── playbooks/
  │   │   └── configure-ec2.yml      # Orchestration playbook
  │   └── roles/
  │       ├── system/
  │       │   ├── defaults/main.yml
  │       │   └── tasks/main.yml     # Cloud-init wait, base utils & dirs
  │       └── docker/
  │           ├── defaults/main.yml
  │           ├── handlers/main.yml  # Docker daemon restart handler
  │           └── tasks/main.yml     # Official Docker CE repo, service & verify
  ├── puppet/
  │   ├── README.md                  # Masterless Puppet architecture & usage guide
  │   ├── manifests/
  │   │   └── site.pp                # Masterless entrypoint manifest
  │   ├── hieradata/
  │   │   └── common.yaml            # Hiera baseline configuration
  │   ├── environments/
  │   │   └── production/
  │   │       └── environment.conf   # Environment module path setup
  │   └── modules/
  │       └── stackpilot/
  │           ├── metadata.json      # Puppet module metadata
  │           └── manifests/
  │               ├── init.pp        # Main coordinator class
  │               ├── docker.pp      # Declarative Docker service & daemon config
  │               ├── users.pp       # User accounts & docker group membership
  │               ├── directories.pp # Directory tree & config baselines
  │               └── monitoring.pp  # Nagios NRPE agent & check scripts
  └── nagios/
      ├── nagios.cfg                 # Master Nagios Core server configuration
      ├── objects/
      │   ├── commands.cfg           # Check commands (ping, ssh, http, nrpe)
      │   ├── templates.cfg          # Host & service object inheritance templates
      │   ├── stackpilot-hosts.cfg   # Hostgroup definitions
      │   └── stackpilot-services.cfg# Baseline service checks
      ├── conf.d/
      │   └── hosts/                 # Dynamically registered host configurations
      │       └── .gitkeep
      ├── plugins/
      │   ├── check_mem.sh           # Memory utilization check plugin
      │   └── check_docker_container.sh # Container health check plugin
      ├── scripts/
      │   ├── verify-nagios.sh       # Syntax validation tool
      │   └── install-nagios.sh      # Core & plugin installer
      └── README.md                  # Nagios architecture and setup guide

jenkins/
  └── Jenkinsfile                    # Parameterized multi-mode CI/CD pipeline
```

---

## 3. Puppet Configuration Management (Stage 3)

### 3.1 Ansible vs Puppet Responsibilities

| Dimension | Ansible (Stage 2) | Puppet (Stage 3) |
|---|---|---|
| **Paradigm** | Procedural task execution | Declarative desired-state convergence |
| **Execution Model** | Push over SSH (`ansible-playbook`) | Masterless pull/apply (`puppet apply`) |
| **Primary Scope** | Initial provisioning, OS updates, Docker CE install | Ongoing state enforcement, drift detection, directory permissions |
| **Drift Handling** | Idempotent rerun of playbook | Continuous state enforcement, drift remediation |
| **Monitoring Hook** | Baseline firewall and port opening | Installs & maintains Nagios NRPE daemon and checks |

### 3.2 Masterless Architecture (`puppet apply`)

StackPilot utilizes a lightweight **masterless Puppet** architecture:
1. No resource-intensive Puppet Master server or SSL certificate authority daemon is required on the host or AWS EC2 instances.
2. The Puppet tree (`infrastructure/puppet/`) is archived and transferred via SSH to `/tmp/puppet-stackpilot/` on the dedicated host.
3. If Puppet is not yet installed on the target instance, `puppetService.js` performs an automated preflight bootstrap (`apt-get install -y puppet` or `dnf install -y puppet`).
4. Puppet runs locally on the node using:
   ```bash
   sudo puppet apply \
     --modulepath=/etc/puppetlabs/code/environments/production/modules:/tmp/puppet-stackpilot/modules \
     --detailed-exitcodes \
     /tmp/puppet-stackpilot/manifests/site.pp
   ```
5. **Exit Code Handling**:
   - Exit Code `0`: Clean catalog application; no changes required (state in sync).
   - Exit Code `2`: Catalog applied successfully; changes were made or configuration drift was remediated. Both `0` and `2` mark `puppetStatus: 'applied'`.
   - Exit Codes `4` or `6`: Failures or partial failures; marks `puppetStatus: 'failed'`.

---

## 4. Jenkins Remote Deployment Architecture (Stage 4)

### 4.1 Secure Docker Image Transfer (SSH Streaming)

To avoid introducing an unnecessary dependency on Amazon ECR, Docker Hub, or a private container registry, StackPilot streams built images directly over an encrypted SSH connection using standard Unix pipes:

```bash
docker save ${params.IMAGE_NAME} | gzip -1 | ssh -i ${SSH_KEY} ${SSH_USER}@${TARGET_HOST} "gunzip | docker load"
```

**Key Advantages:**
1. **Zero Registry Costs & Zero Authentication Overhead**: No AWS ECR repository lifecycle policies, token refreshes, or Docker Hub rate limits.
2. **Speed & Efficiency**: Compressed on the fly using `gzip -1` (fastest compression level), minimizing CPU usage on the Jenkins runner while drastically reducing network transfer time.
3. **End-to-End Security**: All bytes traverse an SSH-encrypted tunnel directly between Jenkins and the dedicated EC2 instance.
4. **Immediate Availability**: Once `docker load` completes on the remote host, the image is immediately present in the remote Docker daemon cache, ready for `docker run`.

---

## 5. Nagios Infrastructure & Application Monitoring (Stage 5)

### 5.1 Architecture: Nagios Core & NRPE Agent

StackPilot deploys a centralized monitoring model:
- **Central Nagios Core Server**: Manages host and service definitions, executes scheduled polling checks, and computes health states.
- **Dedicated EC2 Instances**: Run the **Nagios NRPE (Nagios Remote Plugin Executor)** agent (configured in Stage 3 by Puppet via `stackpilot::monitoring`) listening on port `5666`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       StackPilot Central Monitoring                         │
└─────────────────────────────────────────────────────────────────────────────┘

       StackPilot Backend API
                │
                │ (Dynamic Host Registration & Status Query)
                ▼
      ┌─────────────────────────────────┐
      │   Nagios Core Monitoring Server │
      │   - nagios.cfg                  │
      │   - conf.d/hosts/<infraId>.cfg  │
      │   - check_nrpe / check_http     │
      └────────────────┬────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │ (Port 5666)   │ (Port 5666)   │ (Port 5666)
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│Dedicated EC2 ││Dedicated EC2 ││Dedicated EC2 │
│ - NRPE Agent ││ - NRPE Agent ││ - NRPE Agent │
│ - Docker     ││ - Docker     ││ - Docker     │
│ - App Port   ││ - App Port   ││ - App Port   │
└──────────────┘└──────────────┘└──────────────┘
```

### 5.2 Monitored Checks

| Check Name | Target / Layer | Method | Thresholds / Logic |
|---|---|---|---|
| **PING (Host Alive)** | Network reachability | `check_ping` / `check-host-alive` | RTA < 3000ms, packet loss < 60% |
| **SSH** | Remote access | `check_ssh -p 22` | TCP connect on port 22 |
| **Disk Utilization** | Storage | `check_nrpe!check_disk` | Warning < 20% free, Critical < 10% free |
| **CPU Load** | Host OS performance | `check_nrpe!check_load` | 1, 5, 15 minute load averages |
| **Memory Utilization** | RAM | `check_nrpe!check_mem` | Warning >= 80%, Critical >= 90% |
| **Docker Daemon** | Container Runtime | `check_nrpe!check_docker` | Validates `dockerd` process is active |
| **Application HTTP** | User Application | `check_http -p <port> -u /` | HTTP 2xx/3xx response on exposed port |

### 5.3 Dynamic Host Registration Workflow

When `POST /api/infrastructure/:id/monitoring/register` is invoked:
1. **Ownership & State Gates**: Validates that caller owns the infrastructure, and that Terraform is `PROVISIONED` and Ansible is `configured`.
2. **Target IP Validation**: Strictly validates public IPv4 and blocks localhost / loopback addresses (`127.0.0.1`, `localhost`, `0.0.0.0`, `::1`).
3. **Configuration Generation**: Creates `infrastructure/nagios/conf.d/hosts/stackpilot-infra-<id>.cfg`:
   ```nagios
   define host {
       use                     stackpilot-host
       host_name               stackpilot-infra-6b008...
       alias                   StackPilot Dedicated EC2 MyApp (6b008...)
       address                 54.210.12.34
       _INFRASTRUCTURE_ID      6b008...
       _DEPLOYMENT_ID          6b008...
       _APP_PORT               3000
   }

   define service {
       use                     stackpilot-service
       host_name               stackpilot-infra-6b008...
       service_description     Application HTTP Health
       check_command           check_http!3000!/
   }
   ```
4. **Syntax Verification & Reload**: Executes `nagios -v` validation and triggers `systemctl reload nagios` or graceful service reload without disrupting checks on other hosts.
5. **Database State**: Updates `Infrastructure` document with `monitoringStatus: 'registered'`, `nagiosHostName`, and initializes baseline service checks.

### 5.4 Automatic Cleanup on Destroy

When a dedicated EC2 instance is destroyed via `destroyDedicatedInfrastructure`:
1. The cleanup hook invokes `nagiosService.deregisterHost(infraId)`.
2. The host configuration file (`conf.d/hosts/stackpilot-infra-<id>.cfg`) is safely deleted.
3. Nagios configuration is re-validated and the daemon is reloaded.
4. Database monitoring status is reset to `pending` with zero orphan records.

---

## 6. Backend & Database Integration

### 6.1 MongoDB Data Models

#### Infrastructure Model (`backend/models/Infrastructure.js`):
- `status`: `'PROVISIONED'`
- `configurationStatus`: `'configured'`
- `ansibleHandoff.readyForJenkins`: `true`
- `puppetStatus`: `'pending'` | `'applying'` | `'applied'` | `'failed'`
- `puppetLogs`: Array of `{ timestamp, message, type }`
- `monitoringStatus`: `'pending'` | `'registered'` | `'healthy'` | `'warning'` | `'critical'` | `'unavailable'`
- `nagiosHostName`: String
- `monitoringRegisteredAt`: Date
- `lastMonitoringCheck`: Date
- `monitoringError`: String
- `monitoringServices`: Array of `{ name, status, output, lastCheck, perfData }`
- `publicIp`: String

#### Deployment Model (`backend/models/Deployment.js`):
- `deploymentMode`: `'shared'` | `'dedicated'`
- `infrastructure`: ObjectId (Ref: `Infrastructure`)
- `targetHost`: String (Dedicated EC2 Public IPv4)
- `remoteDeploymentStatus`: `'idle'` | `'building'` | `'transferring'` | `'deploying'` | `'running'` | `'failed'`
- `remoteDeployedAt`: Date
- `jenkinsBuildUrl`: String
- `jenkinsBuildStatus`: `'idle'` | `'queued'` | `'building'` | `'success'` | `'failed'`

---

### 6.2 API Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/infrastructure/:id/monitoring/register` | Private (Auth) | Register dedicated host with Nagios Core |
| `GET` | `/api/infrastructure/:id/monitoring/status` | Private (Auth) | Query Nagios host health and overall status |
| `GET` | `/api/infrastructure/:id/monitoring/services` | Private (Auth) | Fetch breakdown of all service checks |
| `POST` | `/api/infrastructure/:id/monitoring/deregister` | Private (Auth) | Deregister host and remove Nagios configuration |
| `POST` | `/api/infrastructure/:id/puppet/apply` | Private (Auth) | Apply masterless Puppet manifests to dedicated EC2 host |
| `GET` | `/api/infrastructure/:id/puppet/status` | Private (Auth) | Query Puppet execution status, last run, and manifest info |
| `GET` | `/api/infrastructure/:id/puppet/logs` | Private (Auth) | Fetch Puppet execution logs |
| `POST` | `/api/infrastructure/:id/puppet/retry` | Private (Auth) | Retry Puppet configuration if failed |
| `POST` | `/api/infrastructure/:id/puppet/simulate-drift` | Private (Auth) | Simulate configuration drift and automatically remediate via Puppet |
| `POST` | `/api/deployments/:id/trigger-remote-deploy` | Private (Auth) | Trigger Stage 4 Jenkins remote deployment to dedicated EC2 |
| `POST` | `/api/deployments/:id/redeploy` | Private (Auth) | Redeploy application (branches to dedicated remote deploy if mode is dedicated) |
| `POST` | `/api/deployments/update-runtime` | Public (Jenkins) | Synchronize runtime status, container ID, and target host from CI/CD |

---

## 7. Frontend UI Integration

### 7.1 Multi-Stage Status Console (`InfrastructureModal.jsx`)

The dedicated infrastructure modal provides a 5-stage visual console:
- **Stage 1 (Terraform)**: Provisioning status, AWS EC2 Instance ID, Security Group, and Public IP.
- **Stage 2 (Ansible)**: Host configuration status, system baseline, and Docker Engine readiness.
- **Stage 3 (Puppet)**: Desired-state enforcement, Puppet version, last run timestamp, and drift remediation actions.
- **Stage 4 (Jenkins Remote Deploy)**: Remote CI/CD container build & run on dedicated EC2 with one-click Deploy/Redeploy.
- **Stage 5 (Nagios Monitoring)**: Host monitoring status (`HEALTHY`, `WARNING`, `CRITICAL`, `REGISTERED`, `UNAVAILABLE`, `PENDING`), with one-click Register and View actions.

### 7.2 Nagios Monitoring Dashboard (`InfrastructureModal.jsx`)

When the **Nagios Monitoring** tab is selected:
- **Host Status Banner**: Live host state (UP/DOWN), hostname (`stackpilot-infra-<id>`), last check time, and live daemon indicator.
- **Service Checks Grid**: Visual color-coded cards for each monitored service:
  - `PING` (Network Reachability)
  - `SSH` (Port 22 Availability)
  - `Disk Utilization` (Root filesystem free space)
  - `CPU Load` (1, 5, 15 min load averages)
  - `Memory Utilization` (RAM usage & percentages)
  - `Docker Daemon` (Container runtime process)
  - `Application HTTP Health` (HTTP 200 response on container port)
- **Status Distinction**: Unavailable/pending states are cleanly distinguished from active healthy checks.
- **Actions**: "Refresh Checks", "Register with Nagios", and "Deregister".

---

## 8. Verification & Test Suite

The test suites verify all stages of infrastructure automation:
- **`backend/tests/nagiosService.test.js` (12 tests, 0 failures)**:
  - Configuration directory structure and template presence.
  - Object definition syntax and required commands.
  - Puppet NRPE integration check.
  - Infrastructure schema monitoring fields.
  - Authorization and ownership validation.
  - Terraform lifecycle gate (`status === 'PROVISIONED'`).
  - Ansible lifecycle gate (`configurationStatus === 'configured'`).
  - Security boundary (localhost and loopback IP blocking).
  - Dynamic host registration & config file generation.
  - Status parsing and baseline service generation.
  - Host deregistration and cleanup.
  - Controller endpoints (`register`, `status`, `services`, `deregister`).
- **`backend/tests/puppetService.test.js` (9 tests, 0 failures)**:
  - Manifest and module presence.
  - Resource declarations (Docker, directories, monitoring, users).
  - Schema tracking, authorization, lifecycle gates, and drift remediation.
- **`backend/tests/jenkinsRemoteDeploy.test.js` (9 tests, 0 failures)**:
  - Schema integrity, authorization, lifecycle gates, loopback blocking, concurrency protection, and pipeline parameter assembly.

All **30 automated tests pass cleanly with 0 errors**.
