# ==============================================================================
# Class: stackpilot::directories
# ==============================================================================
# Declaratively enforces directory structure, ownership, and permissions
# for StackPilot runtime, logging, and metadata on dedicated nodes.
# Used directly in configuration-drift detection and automated remediation.
# ==============================================================================
class stackpilot::directories {

  # Base StackPilot configuration directory
  file { '/etc/stackpilot':
    ensure => directory,
    owner  => 'root',
    group  => 'root',
    mode   => '0755',
  }

  # StackPilot log storage directory
  file { '/var/log/stackpilot':
    ensure => directory,
    owner  => 'root',
    group  => 'root',
    mode   => '0755',
  }

  # StackPilot application and binaries directory
  file { '/opt/stackpilot':
    ensure => directory,
    owner  => 'root',
    group  => 'root',
    mode   => '0755',
  }

  # Baseline configuration file
  file { '/etc/stackpilot/stackpilot.conf':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => @("EOF"),
      # StackPilot System Configuration Baseline
      # Managed by Puppet — Local edits will be corrected on next Puppet run.
      PLATFORM="StackPilot"
      MANAGED_BY="Puppet"
      LOG_DIR="/var/log/stackpilot"
      DATA_DIR="/opt/stackpilot"
      | EOF
    require => File['/etc/stackpilot'],
  }
}

