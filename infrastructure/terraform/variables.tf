variable "aws_region" {
  type        = string
  description = "AWS region to provision dedicated infrastructure"
  default     = "us-east-1"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type for the dedicated host"
  default     = "t3.micro"
}

variable "ami_os" {
  type        = string
  description = "Base operating system for the instance (ubuntu or amazon-linux)"
  default     = "ubuntu"

  validation {
    condition     = contains(["ubuntu", "amazon-linux"], var.ami_os)
    error_message = "ami_os must be either 'ubuntu' or 'amazon-linux'."
  }
}

variable "custom_ami_id" {
  type        = string
  description = "Optional explicit AMI ID overriding automated lookup"
  default     = ""
}

variable "deployment_id" {
  type        = string
  description = "StackPilot deployment identifier"
}

variable "infrastructure_id" {
  type        = string
  description = "StackPilot infrastructure document identifier"
}

variable "environment" {
  type        = string
  description = "Target deployment environment (development, staging, production)"
  default     = "development"
}

variable "app_port" {
  type        = number
  description = "Application port to expose through the dedicated security group"
  default     = 3000
}

variable "ssh_allowed_cidr" {
  type        = string
  description = "Trusted CIDR block permitted for inbound SSH access"
  default     = "0.0.0.0/0"
}

variable "app_allowed_cidr" {
  type        = string
  description = "CIDR block permitted for inbound application traffic"
  default     = "0.0.0.0/0"
}

variable "ssh_key_name" {
  type        = string
  description = "Optional AWS EC2 Key Pair name for SSH authentication"
  default     = ""
}

variable "root_volume_size" {
  type        = number
  description = "Root EBS storage volume size in GB"
  default     = 20
}

variable "resource_tags" {
  type        = map(string)
  description = "Additional tags to apply to created resources"
  default     = {}
}

