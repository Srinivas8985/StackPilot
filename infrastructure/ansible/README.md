# StackPilot Ansible Configuration Management

This Ansible suite automates the post-provisioning configuration of dedicated AWS EC2 instances provisioned by StackPilot.

## Roles

1. **`system` Role**:
   - Waits for EC2 cloud-init bootstrap to complete.
   - Installs system packages (`curl`, `git`, `jq`, `htop`, `tar`, `unzip`, `ca-certificates`).
   - Configures `/opt/stackpilot/app` and `/opt/stackpilot/logs` directories.

2. **`docker` Role**:
   - Configures official Docker GPG keys and APT/DNF repositories.
   - Installs official Docker Engine and `docker-compose-plugin`.
   - Starts and enables Docker systemd service.
   - Adds the target OS user (`ubuntu` or `ec2-user`) to the `docker` group.
   - Validates daemon readiness with `docker info`.
   - Writes structured configuration metadata to `/etc/stackpilot/configured.json`.

## Playbook Execution

```bash
ansible-playbook -i inventories/hosts.ini playbooks/configure-ec2.yml \
  -e "deployment_id=demo-deploy-001 infrastructure_id=infra-doc-001"
```

## Security Guidelines

- Private SSH keys are never checked into Git.
- SSH connections use `StrictHostKeyChecking=accept-new` to prevent MITM attacks while supporting dynamic cloud IPs.
- Privilege escalation (`become: true`) is limited strictly to system package and service management tasks.

