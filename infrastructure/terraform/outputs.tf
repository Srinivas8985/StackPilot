output "instance_id" {
  description = "The EC2 instance ID of the provisioned server"
  value       = aws_instance.dedicated_server.id
}

output "public_ip" {
  description = "The public IPv4 address of the dedicated instance"
  value       = aws_instance.dedicated_server.public_ip
}

output "private_ip" {
  description = "The private IPv4 address within the VPC"
  value       = aws_instance.dedicated_server.private_ip
}

output "availability_zone" {
  description = "The AWS Availability Zone where the instance was provisioned"
  value       = aws_instance.dedicated_server.availability_zone
}

output "security_group_id" {
  description = "ID of the dedicated security group"
  value       = aws_security_group.app_sg.id
}

output "ssh_user" {
  description = "Default SSH user for connecting to the operating system"
  value       = local.ssh_user
}

output "ssh_connection_command" {
  description = "Example command for SSH connectivity"
  value       = "ssh -i <your-key.pem> ${local.ssh_user}@${aws_instance.dedicated_server.public_ip}"
}

output "application_url" {
  description = "Direct HTTP access URL for the application"
  value       = "http://${aws_instance.dedicated_server.public_ip}:${var.app_port}"
}

output "deployment_id" {
  description = "Associated StackPilot deployment ID"
  value       = var.deployment_id
}

output "infrastructure_id" {
  description = "Associated StackPilot infrastructure ID"
  value       = var.infrastructure_id
}

