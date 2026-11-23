# StackPilot: Nagios Core Infrastructure & Application Monitoring

This directory contains the central **Nagios Core** monitoring architecture for dedicated EC2 instances in StackPilot.

---

## 1. Monitoring Architecture Overview

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

- **Nagios Core Server**: Central engine executing active checks against dedicated EC2 instances.
- **Dedicated EC2 Instances**: Run the **Nagios NRPE (Nagios Remote Plugin Executor)** agent (configured in Stage 3 by Puppet via `stackpilot::monitoring`) on port `5666`.
- **Dynamic Host Registration**: When a dedicated EC2 instance finishes provisioning and deployment, StackPilot generates `conf.d/hosts/stackpilot-infra-<id>.cfg` and reloads Nagios.
- **Cleanup on Destroy**: When an infrastructure resource is destroyed, its configuration file is safely deleted and Nagios is reloaded.

---

## 2. Directory Structure

```
infrastructure/nagios/
  ├── nagios.cfg                   # Master Nagios Core configuration
  ├── objects/
  │   ├── commands.cfg             # Check commands (check_ping, check_ssh, check_nrpe, check_http)
  │   ├── templates.cfg            # Host & service object inheritance templates
  │   ├── stackpilot-hosts.cfg     # Hostgroup definitions
  │   └── stackpilot-services.cfg  # Baseline service checks
  ├── conf.d/
  │   └── hosts/                   # Dynamic per-instance configuration files
  │       └── .gitkeep
  ├── plugins/
  │   ├── check_mem.sh             # Free memory check script
  │   └── check_docker_container.sh# Container status check script
  ├── scripts/
  │   ├── verify-nagios.sh         # Syntax validation tool
  │   └── install-nagios.sh        # Core & plugin installer
  └── README.md
```

---

## 3. Monitored Checks

| Check Name | Target / Layer | Method | Thresholds / Logic |
|---|---|---|---|
| **PING (Host Alive)** | Network reachability | `check_ping` / `check-host-alive` | RTA < 3000ms, packet loss < 60% |
| **SSH** | Remote access | `check_ssh -p 22` | TCP connect on port 22 |
| **Disk Utilization** | Storage | `check_nrpe!check_disk` | Warning < 20% free, Critical < 10% free |
| **CPU Load** | Host OS performance | `check_nrpe!check_load` | 1, 5, 15 minute load averages |
| **Memory Utilization** | RAM | `check_nrpe!check_mem` | Warning >= 80%, Critical >= 90% |
| **Docker Daemon** | Container Runtime | `check_nrpe!check_docker` | Validates `dockerd` process is active |
| **Application HTTP** | User Application | `check_http -p <port> -u /` | HTTP 2xx/3xx response on exposed port |

---

## 4. Dynamic Host Registration Workflow

When `POST /api/infrastructure/:id/monitoring/register` is invoked:
1. **Verification**: Ensures caller is the owner and the target EC2 is `PROVISIONED` and `configured`.
2. **Safe Host Definition**: Creates `/etc/nagios/conf.d/hosts/stackpilot-infra-<id>.cfg`:
   ```nagios
   define host {
       use         stackpilot-host
       host_name   stackpilot-infra-6b008...
       alias       Dedicated EC2 Deployment sp-6b008...
       address     54.210.12.34
       _PORT       3000
   }

   define service {
       use                 stackpilot-service
       host_name           stackpilot-infra-6b008...
       service_description HTTP Application Health
       check_command       check_http!3000!/
   }
   ```
3. **Syntax Validation**: Runs `nagios -v /etc/nagios/nagios.cfg` before committing.
4. **Graceful Reload**: Reloads the Nagios process without disrupting checks on other hosts.
5. **Database Sync**: Sets `monitoringStatus = 'registered'` and records timestamp.

---

## 5. Security & Network Requirements

1. **Security Group Ingress on Dedicated EC2**:
   - Port `22` (SSH): Restricted to StackPilot Jenkins / deployer CIDR.
   - Port `5666` (NRPE): Restricted to Nagios Core Server IP.
   - Application Port (`3000` / `80`): Open to web traffic or user CIDR.
2. **Localhost Blocking**: StackPilot backend strictly prevents loopback addresses (`127.0.0.1`, `localhost`, `0.0.0.0`) from being registered as targets.

