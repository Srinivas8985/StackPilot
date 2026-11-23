# StackPilot Puppet Configuration Management

This directory contains the declarative Puppet manifests and module structure used to enforce desired state and remediate configuration drift on dedicated EC2 nodes.

## Architecture

StackPilot uses a **Masterless Puppet (`puppet apply`)** architecture:
- No central Puppet Server / Master is required, saving cloud compute overhead.
- Manifests and the `stackpilot` module are pushed to the dedicated node and applied locally:
  ```bash
  sudo puppet apply --modulepath=/tmp/stackpilot-puppet/modules /tmp/stackpilot-puppet/manifests/site.pp --detailed-exitcodes
  ```
- **Exit Codes**:
  - `0`: Desired state is already satisfied (no changes).
  - `2`: Desired state successfully enforced / configuration drift remediated.
  - `4`: Failures encountered during catalog application.
  - `6`: Both changes and failures occurred.

## Modules

### `stackpilot`
- **`init.pp`**: Main class coordinating directories, user permissions, Docker daemon state, and monitoring agent.
- **`docker.pp`**: Enforces Docker daemon running and enabled with log-rotation rules.
- **`users.pp`**: Enforces deployment user membership in the `docker` group.
- **`directories.pp`**: Enforces required directory paths (`/etc/stackpilot`, `/var/log/stackpilot`, `/opt/stackpilot`) with correct permissions (`0755`).
- **`monitoring.pp`**: Installs Nagios NRPE agent and baseline check definitions for future monitoring integration.

## Relationship with Ansible

- **Ansible** owns the initial system provisioning (package repositories, installing Docker CE, initial user configuration).
- **Puppet** provides continuous desired-state enforcement and automated drift correction.

