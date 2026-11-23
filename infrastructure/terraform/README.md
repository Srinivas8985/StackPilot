# StackPilot Dedicated Infrastructure Terraform Module

This module provisions an isolated AWS EC2 instance, dedicated security group, and automated Docker bootstrap configuration for a single StackPilot deployment.

## Architecture

- **AWS Provider**: Configured dynamically based on user selection.
- **AMI Strategy**: Dynamic discovery for official Ubuntu 22.04 LTS or Amazon Linux 2023.
- **Dedicated Security Group**:
  - Ingress SSH (port 22) restricted strictly to `ssh_allowed_cidr`.
  - Ingress Application Port (`app_port`) open to `app_allowed_cidr`.
  - Ingress HTTP/HTTPS fallback if needed.
  - Egress unrestricted (0.0.0.0/0) for container downloads and OS updates.
- **Bootstrap (`user-data.sh`)**:
  - Installs Docker Engine, `docker compose`, `curl`, `jq`, and `git`.
  - Starts Docker daemon and grants non-root access to `ubuntu` / `ec2-user`.
  - Emits `/etc/stackpilot-ready` signal for future Ansible and Jenkins pipelines.

## Critical Safety Rule

> [!IMPORTANT]
> This module provisions **new, isolated resources** in AWS. It never references, mutates, or touches the host EC2 instance running StackPilot itself.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `aws_region` | string | `"us-east-1"` | Target AWS region |
| `instance_type` | string | `"t3.micro"` | EC2 instance size |
| `ami_os` | string | `"ubuntu"` | OS: `ubuntu` or `amazon-linux` |
| `deployment_id` | string | *required* | StackPilot deployment ID |
| `infrastructure_id` | string | *required* | MongoDB infrastructure record ID |
| `environment` | string | `"development"` | Target environment |
| `app_port` | number | `3000` | Application port |
| `ssh_allowed_cidr` | string | `"0.0.0.0/0"` | Trusted IP/CIDR for SSH access |
| `app_allowed_cidr` | string | `"0.0.0.0/0"` | IP/CIDR for application traffic |
| `ssh_key_name` | string | `""` | Optional AWS Key Pair name |
| `root_volume_size` | number | `20` | Root volume size (GB) |

## Outputs

- `instance_id`: AWS EC2 instance ID
- `public_ip`: Public IPv4 address
- `private_ip`: Internal VPC IPv4 address
- `availability_zone`: Target AZ
- `security_group_id`: Dedicated SG ID
- `ssh_user`: Operating system user (`ubuntu` or `ec2-user`)
- `application_url`: Direct URL to test the provisioned app
- `deployment_id`: StackPilot deployment ID
- `infrastructure_id`: StackPilot infrastructure ID

