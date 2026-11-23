# ==============================================================================
# Class: stackpilot::users
# ==============================================================================
# Declaratively manages deployment user group memberships on dedicated nodes:
# - Enforces presence of the 'docker' system group.
# - Ensures the deployment user ($deploy_user) is a member of the 'docker' group
#   allowing non-root container management.
# ==============================================================================
class stackpilot::users (
  String $deploy_user = 'ubuntu',
) {

  # Ensure the docker group exists
  group { 'docker':
    ensure => present,
  }

  # Ensure deployment user exists and has docker group membership
  user { $deploy_user:
    ensure     => present,
    groups     => ['docker'],
    membership => minimum,
    require    => Group['docker'],
  }
}

