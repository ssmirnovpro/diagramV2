# Variables for UML Images Service Infrastructure

# General Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "uml-images-service"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "owner" {
  description = "Owner of the resources"
  type        = string
  default     = "DevOps Team"
}

variable "cost_center" {
  description = "Cost center for billing"
  type        = string
  default     = "Engineering"
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "enable_vpn_gateway" {
  description = "Enable VPN Gateway"
  type        = bool
  default     = false
}

# Security Configuration
variable "enable_waf" {
  description = "Enable AWS WAF"
  type        = bool
  default     = true
}

variable "enable_shield" {
  description = "Enable AWS Shield Advanced"
  type        = bool
  default     = false
}

variable "enable_secrets_manager" {
  description = "Enable AWS Secrets Manager"
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN of the SSL certificate"
  type        = string
  default     = ""
}

# Compute Configuration
variable "load_balancer_type" {
  description = "Type of load balancer (application, network)"
  type        = string
  default     = "application"
}

variable "enable_service_discovery" {
  description = "Enable ECS service discovery"
  type        = bool
  default     = true
}

variable "enable_container_insights" {
  description = "Enable ECS container insights"
  type        = bool
  default     = true
}

# API Service Configuration
variable "api_cpu" {
  description = "CPU units for API service"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory for API service (MB)"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Desired number of API service instances"
  type        = number
  default     = 2
}

# UI Service Configuration
variable "ui_cpu" {
  description = "CPU units for UI service"
  type        = number
  default     = 256
}

variable "ui_memory" {
  description = "Memory for UI service (MB)"
  type        = number
  default     = 512
}

variable "ui_desired_count" {
  description = "Desired number of UI service instances"
  type        = number
  default     = 2
}

# Kroki Service Configuration
variable "kroki_cpu" {
  description = "CPU units for Kroki service"
  type        = number
  default     = 1024
}

variable "kroki_memory" {
  description = "Memory for Kroki service (MB)"
  type        = number
  default     = 2048
}

variable "kroki_desired_count" {
  description = "Desired number of Kroki service instances"
  type        = number
  default     = 2
}

# Auto Scaling Configuration
variable "enable_auto_scaling" {
  description = "Enable auto scaling for ECS services"
  type        = bool
  default     = true
}

variable "auto_scaling_min_capacity" {
  description = "Minimum capacity for auto scaling"
  type        = number
  default     = 1
}

variable "auto_scaling_max_capacity" {
  description = "Maximum capacity for auto scaling"
  type        = number
  default     = 10
}

variable "auto_scaling_target_cpu" {
  description = "Target CPU utilization for auto scaling"
  type        = number
  default     = 70
}

variable "auto_scaling_target_memory" {
  description = "Target memory utilization for auto scaling"
  type        = number
  default     = 80
}

# Database Configuration
variable "enable_database" {
  description = "Enable RDS database"
  type        = bool
  default     = false
}

variable "db_engine" {
  description = "Database engine"
  type        = string
  default     = "postgres"
}

variable "db_engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.4"
}

variable "db_instance_class" {
  description = "Database instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Database allocated storage (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Database maximum allocated storage (GB)"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "umlservice"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "umluser"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_backup_retention_period" {
  description = "Database backup retention period (days)"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "Database backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "Database maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# Monitoring Configuration
variable "enable_prometheus" {
  description = "Enable Prometheus monitoring"
  type        = bool
  default     = true
}

variable "enable_grafana" {
  description = "Enable Grafana dashboards"
  type        = bool
  default     = true
}

variable "enable_elasticsearch" {
  description = "Enable Elasticsearch logging"
  type        = bool
  default     = true
}

variable "enable_jaeger" {
  description = "Enable Jaeger tracing"
  type        = bool
  default     = true
}

variable "metrics_retention_days" {
  description = "Metrics retention period (days)"
  type        = number
  default     = 30
}

variable "logs_retention_days" {
  description = "Logs retention period (days)"
  type        = number
  default     = 14
}

# Alerting Configuration
variable "slack_webhook_url" {
  description = "Slack webhook URL for alerts"
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_notifications" {
  description = "Email addresses for notifications"
  type        = list(string)
  default     = []
}

# Container Registry Configuration
variable "container_registry_url" {
  description = "Container registry URL"
  type        = string
  default     = ""
}

variable "api_service_image_tag" {
  description = "API service image tag"
  type        = string
  default     = "latest"
}

variable "ui_service_image_tag" {
  description = "UI service image tag"
  type        = string
  default     = "latest"
}

# Environment-specific overrides
variable "environment_config" {
  description = "Environment-specific configuration overrides"
  type = object({
    api_min_capacity    = optional(number)
    api_max_capacity    = optional(number)
    ui_min_capacity     = optional(number)
    ui_max_capacity     = optional(number)
    kroki_min_capacity  = optional(number)
    kroki_max_capacity  = optional(number)
    enable_detailed_monitoring = optional(bool)
    backup_schedule     = optional(string)
  })
  default = {}
}

# Feature flags
variable "feature_flags" {
  description = "Feature flags for enabling/disabling features"
  type = object({
    enable_caching           = optional(bool, true)
    enable_rate_limiting     = optional(bool, true)
    enable_request_tracing   = optional(bool, true)
    enable_performance_monitoring = optional(bool, true)
    enable_security_scanning = optional(bool, true)
  })
  default = {}
}

# Cost optimization settings
variable "cost_optimization" {
  description = "Cost optimization settings"
  type = object({
    use_spot_instances     = optional(bool, false)
    use_graviton_instances = optional(bool, false)
    enable_hibernation     = optional(bool, false)
    schedule_scaling       = optional(bool, false)
  })
  default = {}
}

# Disaster recovery configuration
variable "disaster_recovery" {
  description = "Disaster recovery configuration"
  type = object({
    enable_multi_region     = optional(bool, false)
    backup_region          = optional(string, "us-west-2")
    rto_minutes            = optional(number, 15)
    rpo_minutes            = optional(number, 5)
    enable_cross_region_backup = optional(bool, false)
  })
  default = {}
}