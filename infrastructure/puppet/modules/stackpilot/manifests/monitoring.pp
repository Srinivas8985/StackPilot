# ==============================================================================
# Class: stackpilot::monitoring
# ==============================================================================
# Declaratively configures Nagios NRPE monitoring agent on dedicated nodes:
# - Installs NRPE daemon and monitoring plugins.
# - Ensures NRPE service is running and enabled on boot.
# - Lays the groundwork for the subsequent Nagios monitoring integration phase.
# ==============================================================================
class stackpilot::monitoring {

  # Resolve package and service names across OS families
  case $facts['os']['family'] {
    'RedHat': {
      $nrpe_package = 'nrpe'
      $nrpe_service = 'nrpe'
      $nrpe_conf_dir = '/etc/nagios'
      $plugins_package = 'nagios-plugins-all'
    }
    default: {
      # Debian / Ubuntu 22.04 / 24.04
      $nrpe_package = 'nagios-nrpe-server'
      $nrpe_service = 'nagios-nrpe-server'
      $nrpe_conf_dir = '/etc/nagios'
      $plugins_package = 'monitoring-plugins-basic'
    }
  }

  # Ensure monitoring packages are installed
  package { $nrpe_package:
    ensure => installed,
  }

  package { $plugins_package:
    ensure => installed,
  }

  # Ensure Nagios configuration directory exists
  file { $nrpe_conf_dir:
    ensure  => directory,
    owner   => 'root',
    group   => 'root',
    mode    => '0755',
    require => Package[$nrpe_package],
  }

  # Helper script for memory utilization check
  file { '/usr/local/bin/check_mem.sh':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0755',
    content => @("EOF"),
      #!/usr/bin/env bash
      # Free memory check for Nagios NRPE
      WARN=${1:-80}
      CRIT=${2:-90}
      TOTAL=$(free -m | awk '/^Mem:/{print $2}')
      USED=$(free -m | awk '/^Mem:/{print $3}')
      if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]; then
        echo "UNKNOWN - Unable to calculate memory usage"
        exit 3
      fi
      PCT=$(( USED * 100 / TOTAL ))
      PERF="used=${USED}MB;${WARN};${CRIT};0;${TOTAL}"
      if [ "$PCT" -ge "$CRIT" ]; then
        echo "CRITICAL - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
        exit 2
      elif [ "$PCT" -ge "$WARN" ]; then
        echo "WARNING - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
        exit 1
      else
        echo "OK - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
        exit 0
      fi
      | EOF
  }

  # Baseline NRPE check definitions for StackPilot metrics
  file { "${nrpe_conf_dir}/stackpilot-nrpe.cfg":
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => @("EOF"),
      # Nagios NRPE Configuration for StackPilot Dedicated Node
      # Managed by Puppet
      server_port=5666
      allowed_hosts=127.0.0.1,::1,0.0.0.0/0
      dont_blame_nrpe=0

      # Standard Node Health Checks
      command[check_users]=/usr/lib/nagios/plugins/check_users -w 5 -c 10
      command[check_load]=/usr/lib/nagios/plugins/check_load -r -w .15,.10,.05 -c .30,.25,.20
      command[check_disk]=/usr/lib/nagios/plugins/check_disk -w 20% -c 10% -p /
      command[check_mem]=/usr/local/bin/check_mem.sh 80 90
      command[check_docker]=/usr/lib/nagios/plugins/check_procs -c 1: -C dockerd
      command[check_zombie_procs]=/usr/lib/nagios/plugins/check_procs -w 5 -c 10 -s Z
      command[check_total_procs]=/usr/lib/nagios/plugins/check_procs -w 150 -c 200
      | EOF
    require => [File[$nrpe_conf_dir], File['/usr/local/bin/check_mem.sh']],
    notify  => Service[$nrpe_service],
  }

  # Enforce that the NRPE monitoring service is running and enabled
  service { $nrpe_service:
    ensure     => running,
    enable     => true,
    hasstatus  => true,
    hasrestart => true,
    require    => Package[$nrpe_package],
  }
}

