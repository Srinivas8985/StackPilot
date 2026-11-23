#!/usr/bin/env bash
# ==============================================================================
# install-nagios.sh - Automated Nagios Core & Plugins Installer for Linux
# ==============================================================================
# Installs Nagios Core and Plugins on Ubuntu / Debian or RHEL / Amazon Linux.
# Run with root / sudo permissions.
# ==============================================================================
set -euo pipefail

echo "=================================================="
echo "StackPilot - Nagios Core Central Monitoring Setup"
echo "=================================================="

if [ -f /etc/debian_version ]; then
  echo "[1/4] Installing dependencies on Debian/Ubuntu..."
  sudo apt-get update -y
  sudo apt-get install -y \
    autoconf gcc libc6 make wget unzip apache2 apache2-utils \
    php libgd-dev libmcrypt-dev libssl-dev bc gawk dc build-essential \
    nagios-plugins nagios-nrpe-plugin

  echo "[2/4] Ensuring Nagios Core user and group..."
  if ! id -u nagios >/dev/null 2>&1; then
    sudo useradd nagios
    sudo groupadd nagcmd
    sudo usermod -a -G nagcmd nagios
    sudo usermod -a -G nagcmd www-data
  fi

  echo "[3/4] Preparing directories..."
  sudo mkdir -p /etc/nagios/conf.d/hosts /usr/local/nagios/var /usr/local/nagios/var/rw
  sudo chown -R nagios:nagios /usr/local/nagios/var

  echo "[4/4] Installation complete. Enable and start Nagios service:"
  echo "  sudo systemctl enable nagios"
  echo "  sudo systemctl start nagios"

elif [ -f /etc/redhat-release ]; then
  echo "[1/4] Installing dependencies on RHEL / Amazon Linux..."
  sudo dnf install -y gcc glibc glibc-common wget httpd php gd gd-devel \
    openssl-devel nagios nagios-plugins-all nagios-plugins-nrpe

  sudo mkdir -p /etc/nagios/conf.d/hosts
  sudo systemctl enable nagios httpd
  sudo systemctl start nagios httpd
fi

echo "Nagios Core setup completed successfully."

