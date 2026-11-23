# ==============================================================================
# StackPilot Dedicated EC2 - Masterless Puppet Site Manifest (site.pp)
# ==============================================================================
# Entry point for masterless `puppet apply`.
# Enforces declarative desired state, user group membership, directory baselines,
# Docker service persistence, and monitoring agent presence on dedicated nodes.
# ==============================================================================

# Global resource defaults
File {
  owner => 'root',
  group => 'root',
}

Exec {
  path => [
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ],
}

# Default node configuration for all StackPilot-provisioned dedicated EC2 hosts
node default {
  class { 'stackpilot': }
}

