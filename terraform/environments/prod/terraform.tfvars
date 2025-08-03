# Production Environment Configuration
# UML Images Service - Production Infrastructure

# General Configuration
environment = "prod"
aws_region  = "us-east-1"
owner       = "DevOps Team"
cost_center = "Engineering"

# Networking Configuration
vpc_cidr           = "10.0.0.0/16"
enable_nat_gateway = true
enable_vpn_gateway = false

# Security Configuration
enable_waf             = true
enable_shield          = true
enable_secrets_manager = true
domain_name           = "uml.example.com"
# certificate_arn will be provided via environment variable or CI/CD

# Production Service Configuration
api_cpu           = 1024
api_memory        = 2048
api_desired_count = 3

ui_cpu           = 512
ui_memory        = 1024
ui_desired_count = 3

kroki_cpu           = 2048
kroki_memory        = 4096
kroki_desired_count = 2

# Auto Scaling Configuration
enable_auto_scaling       = true
auto_scaling_min_capacity = 2
auto_scaling_max_capacity = 20
auto_scaling_target_cpu   = 70
auto_scaling_target_memory = 80

# Database Configuration (if needed)
enable_database            = false
db_instance_class         = "db.r5.large"
db_allocated_storage      = 100
db_max_allocated_storage  = 1000
db_backup_retention_period = 30
db_backup_window          = "03:00-04:00"
db_maintenance_window     = "sun:04:00-sun:05:00"

# Monitoring Configuration
enable_prometheus    = true
enable_grafana      = true
enable_elasticsearch = true
enable_jaeger       = true

metrics_retention_days = 90
logs_retention_days   = 30

# Alerting Configuration
email_notifications = [
  "devops@company.com",
  "sre@company.com",
  "oncall@company.com"
]

# Container Registry
container_registry_url = "ghcr.io/company/uml-images-service"

# Environment-specific overrides
environment_config = {
  api_min_capacity    = 2
  api_max_capacity    = 20
  ui_min_capacity     = 2
  ui_max_capacity     = 15
  kroki_min_capacity  = 2
  kroki_max_capacity  = 10
  enable_detailed_monitoring = true
  backup_schedule     = "cron(0 2 * * ? *)"  # Daily at 2 AM UTC
}

# Feature flags for production
feature_flags = {
  enable_caching           = true
  enable_rate_limiting     = true
  enable_request_tracing   = true
  enable_performance_monitoring = true
  enable_security_scanning = true
}

# Cost optimization for production
cost_optimization = {
  use_spot_instances     = false  # Use on-demand for production stability
  use_graviton_instances = true   # Use Graviton2 for cost savings
  enable_hibernation     = false  # Keep services running
  schedule_scaling       = true   # Scale based on business hours
}

# Disaster recovery configuration
disaster_recovery = {
  enable_multi_region        = true
  backup_region             = "us-west-2"
  rto_minutes               = 15
  rpo_minutes               = 5
  enable_cross_region_backup = true
}