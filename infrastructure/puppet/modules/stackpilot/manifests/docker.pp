# ==============================================================================
# Class: stackpilot::docker
# ==============================================================================
# Enforces declarative desired state for the Docker daemon on dedicated nodes:
# - Service running and enabled across system reboots.
# - Daemon log-rotation configuration (prevents container disk exhaustion).
# ==============================================================================
class stackpilot::docker {

  # Ensure Docker configuration directory exists
  file { '/etc/docker':
    ensure => directory,
    owner  => 'root',
    group  => 'root',
    mode   => '0755',
  }

  # Ensure daemon.json log-rotation baseline is present
  file { '/etc/docker/daemon.json':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => @("EOF"),
      {
        "log-driver": "json-file",
        "log-opts": {
          "max-size": "10m",
          "max-file": "3"
        }
      }
      | EOF
    require => File['/etc/docker'],
    notify  => Service['docker'],
  }

  # Enforce Docker daemon is running and enabled on boot
  service { 'docker':
    ensure     => running,
    enable     => true,
    hasstatus  => true,
    hasrestart => true,
  }
}
