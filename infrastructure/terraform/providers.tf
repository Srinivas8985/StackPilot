provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        ManagedBy        = "StackPilot"
        DeploymentId     = var.deployment_id
        InfrastructureId = var.infrastructure_id
        Environment      = var.environment
        Provisioner      = "Terraform"
      },
      var.resource_tags
    )
  }
}

