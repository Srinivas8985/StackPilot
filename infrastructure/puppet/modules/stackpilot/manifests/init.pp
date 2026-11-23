# ==============================================================================
# Class: stackpilot
# ==============================================================================
# Main entry point for the StackPilot Puppet module.
# Demonstrates declarative desired-state enforcement and drift correction
# on dedicated EC2 instances.
#
# Parameters:
#   $deploy_user: System user for application deployment (default: resolved by OS)
#   $ensure_docker: Enforce Docker daemon active state (default: true)
#   $enable_monitoring: Enforce Nagios NRPE monitoring agent (default: true)
# ==============================================================================
class stackpilot (
  String  $deploy_user       = $facts['os']['family'] ? {
    'RedHat' => 'ec2-user',
    default  => 'ubuntu',
  },
  Boolean $ensure_docker     = true,
  Boolean $enable_monitoring = true,
) {

  # Stage 1: Enforce directory structure and file permissions
  class { 'stackpilot::directories': }

  # Stage 2: Enforce deployment user and group memberships
  class { 'stackpilot::users':
    deploy_user => $deploy_user,
    require     => Class['stackpilot::directories'],
  }

  # Stage 3: Enforce Docker daemon desired running & enabled state
  if $ensure_docker {
    class { 'stackpilot::docker':
      require => Class['stackpilot::users'],
    }
  }

  # Stage 4: Enforce Nagios monitoring agent installation & running service
  if $enable_monitoring {
    class { 'stackpilot::monitoring':
      require => Class['stackpilot::directories'],
    }
  }

  # Enforce state artifact tracking manifest execution
  file { '/etc/stackpilot/puppet-state.json':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => @("EOF"),
      {
        "module": "stackpilot",
        "desired_state": "enforced",
        "deploy_user": "${deploy_user}",
        "docker_enforced": ${ensure_docker},
        "monitoring_enforced": ${enable_monitoring},
        "os_family": "${facts['os']['family']}",
        "managed_by": "StackPilot Puppet Masterless Agent"
      }
      | EOF
    require => Class['stackpilot::directories'],
  }
}

