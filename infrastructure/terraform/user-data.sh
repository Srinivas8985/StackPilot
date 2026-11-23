#!/bin/bash
# StackPilot EC2 Bootstrap & User Data Script
# Prepares newly provisioned dedicated instances for Ansible and Jenkins deployments.

set -euo pipefail

LOG_FILE="/var/log/stackpilot-bootstrap.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=========================================================="
echo "Starting StackPilot Instance Bootstrap: $(date -u)"
echo "Deployment ID: ${deployment_id}"
echo "Infrastructure ID: ${infrastructure_id}"
echo "Environment: ${environment}"
echo "Application Port: ${app_port}"
echo "=========================================================="

mkdir -p /etc/stackpilot

# Save deployment metadata for Ansible/Jenkins inspection
cat <<METADATA > /etc/stackpilot/metadata.json
{
  "deployment_id": "${deployment_id}",
  "infrastructure_id": "${infrastructure_id}",
  "environment": "${environment}",
  "app_port": ${app_port},
  "provisioned_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
METADATA

# Detect Linux Distribution
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  OS="unknown"
fi

echo "Detected Operating System: $OS"

if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    htop \
    ufw

  # Install Docker Engine
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  usermod -aG docker ubuntu || true

elif [ "$OS" = "amzn" ] || [ "$OS" = "almalinux" ] || [ "$OS" = "rhel" ] || [ "$OS" = "centos" ]; then
  dnf update -y || yum update -y
  dnf install -y docker git jq curl htop || yum install -y docker git jq curl htop

  systemctl enable docker
  systemctl start docker
  usermod -aG docker ec2-user || true
fi

# Create StackPilot app root directory
mkdir -p /opt/stackpilot/app
mkdir -p /opt/stackpilot/logs
chmod -R 775 /opt/stackpilot

# Write readiness marker for Ansible and Jenkins verification
touch /etc/stackpilot-ready
echo "StackPilot instance bootstrap completed successfully at $(date -u)" >> /etc/stackpilot-ready

echo "=========================================================="
echo "StackPilot Bootstrap Finished Successfully: $(date -u)"
echo "=========================================================="

