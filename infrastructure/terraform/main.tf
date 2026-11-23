# Dynamic lookup for official Ubuntu 22.04 LTS (Jammy) AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Dynamic lookup for official Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["137112412989"] # Amazon

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

locals {
  # Determine which AMI ID to use based on inputs
  selected_ami_id = var.custom_ami_id != "" ? var.custom_ami_id : (
    var.ami_os == "ubuntu" ? data.aws_ami.ubuntu.id : data.aws_ami.amazon_linux.id
  )

  ssh_user = var.ami_os == "ubuntu" ? "ubuntu" : "ec2-user"
}

# Dedicated EC2 Instance for StackPilot Deployment
resource "aws_instance" "dedicated_server" {
  ami                         = local.selected_ami_id
  instance_type               = var.instance_type
  vpc_security_group_ids      = [aws_security_group.app_sg.id]
  key_name                    = var.ssh_key_name != "" ? var.ssh_key_name : null
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/user-data.sh", {
    deployment_id     = var.deployment_id
    infrastructure_id = var.infrastructure_id
    environment       = var.environment
    app_port          = var.app_port
  })

  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name             = "stackpilot-vol-${var.deployment_id}"
      DeploymentId     = var.deployment_id
      InfrastructureId = var.infrastructure_id
    }
  }

  tags = {
    Name             = "stackpilot-instance-${var.deployment_id}"
    DeploymentId     = var.deployment_id
    InfrastructureId = var.infrastructure_id
    Role             = "dedicated-node"
  }
}

