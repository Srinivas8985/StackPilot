resource "aws_security_group" "app_sg" {
  name_prefix = "stackpilot-sg-${var.deployment_id}-"
  description = "Dedicated security group for StackPilot deployment ${var.deployment_id}"

  # SSH access restricted to trusted CIDR
  ingress {
    description = "SSH access restricted to trusted network"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # Primary application port
  ingress {
    description = "Application port access"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = [var.app_allowed_cidr]
  }

  # Allow HTTP (port 80) if different from app_port
  dynamic "ingress" {
    for_each = var.app_port != 80 ? [80] : []
    content {
      description = "Standard HTTP access"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = [var.app_allowed_cidr]
    }
  }

  # Allow HTTPS (port 443) if different from app_port
  dynamic "ingress" {
    for_each = var.app_port != 443 ? [443] : []
    content {
      description = "Standard HTTPS access"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = [var.app_allowed_cidr]
    }
  }

  # Unrestricted outbound traffic for dependencies, docker pulls, updates
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "stackpilot-sg-${var.deployment_id}"
  }
}

