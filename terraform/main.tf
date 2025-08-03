# UML Images Service - Main Terraform Configuration
# Infrastructure as Code for scalable UML diagram generation service

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "uml-service-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "uml-service-terraform-locks"
  }
}

# Provider configurations
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "UML-Images-Service"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = var.owner
      CostCenter  = var.cost_center
    }
  }
}

provider "docker" {
  host = "unix:///var/run/docker.sock"
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = var.owner
    CostCenter  = var.cost_center
  }
  
  # Container configurations
  containers = {
    api = {
      name         = "uml-api-service"
      port         = 9001
      cpu          = var.api_cpu
      memory       = var.api_memory
      desired_count = var.api_desired_count
      health_check_path = "/health"
    }
    ui = {
      name         = "uml-ui-service"
      port         = 9002
      cpu          = var.ui_cpu
      memory       = var.ui_memory
      desired_count = var.ui_desired_count
      health_check_path = "/health"
    }
    kroki = {
      name         = "kroki-service"
      port         = 8000
      cpu          = var.kroki_cpu
      memory       = var.kroki_memory
      desired_count = var.kroki_desired_count
      health_check_path = "/health"
      image        = "yuzutech/kroki:latest"
    }
  }
}

# Networking Module
module "networking" {
  source = "./modules/networking"
  
  name_prefix        = local.name_prefix
  vpc_cidr          = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3)
  enable_nat_gateway = var.enable_nat_gateway
  enable_vpn_gateway = var.enable_vpn_gateway
  
  tags = local.common_tags
}

# Security Module
module "security" {
  source = "./modules/security"
  
  name_prefix = local.name_prefix
  vpc_id      = module.networking.vpc_id
  vpc_cidr    = var.vpc_cidr
  
  # Security configuration
  enable_waf            = var.enable_waf
  enable_shield         = var.enable_shield
  enable_secrets_manager = var.enable_secrets_manager
  
  # SSL/TLS configuration
  domain_name           = var.domain_name
  certificate_arn       = var.certificate_arn
  
  tags = local.common_tags
}

# Compute Module (ECS/Fargate)
module "compute" {
  source = "./modules/compute"
  
  name_prefix    = local.name_prefix
  vpc_id         = module.networking.vpc_id
  subnet_ids     = module.networking.private_subnet_ids
  public_subnet_ids = module.networking.public_subnet_ids
  
  # Container configurations
  containers = local.containers
  
  # ECS configuration
  enable_service_discovery = var.enable_service_discovery
  enable_container_insights = var.enable_container_insights
  
  # Load balancer configuration
  load_balancer_type = var.load_balancer_type
  ssl_certificate_arn = var.certificate_arn
  
  # Security groups
  alb_security_group_id = module.security.alb_security_group_id
  ecs_security_group_id = module.security.ecs_security_group_id
  
  # Auto-scaling configuration
  enable_auto_scaling = var.enable_auto_scaling
  auto_scaling_min_capacity = var.auto_scaling_min_capacity
  auto_scaling_max_capacity = var.auto_scaling_max_capacity
  auto_scaling_target_cpu = var.auto_scaling_target_cpu
  auto_scaling_target_memory = var.auto_scaling_target_memory
  
  tags = local.common_tags
  
  depends_on = [module.networking, module.security]
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"
  
  name_prefix = local.name_prefix
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids
  
  # ECS cluster information
  ecs_cluster_name = module.compute.ecs_cluster_name
  ecs_service_names = [
    module.compute.api_service_name,
    module.compute.ui_service_name,
    module.compute.kroki_service_name
  ]
  
  # Monitoring configuration
  enable_prometheus     = var.enable_prometheus
  enable_grafana       = var.enable_grafana
  enable_elasticsearch = var.enable_elasticsearch
  enable_jaeger        = var.enable_jaeger
  
  # Alerting configuration
  slack_webhook_url    = var.slack_webhook_url
  email_notifications  = var.email_notifications
  
  # Data retention
  metrics_retention_days = var.metrics_retention_days
  logs_retention_days    = var.logs_retention_days
  
  tags = local.common_tags
  
  depends_on = [module.compute]
}

# RDS Database (if needed for application data)
resource "aws_db_subnet_group" "main" {
  count = var.enable_database ? 1 : 0
  
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = module.networking.private_subnet_ids
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

resource "aws_db_instance" "main" {
  count = var.enable_database ? 1 : 0
  
  identifier = "${local.name_prefix}-database"
  
  # Engine configuration
  engine         = var.db_engine
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class
  
  # Storage configuration
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true
  
  # Database configuration
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  
  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [module.security.rds_security_group_id]
  
  # Backup configuration
  backup_retention_period = var.db_backup_retention_period
  backup_window          = var.db_backup_window
  maintenance_window     = var.db_maintenance_window
  
  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring[0].arn
  
  # Performance Insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  
  # Deletion protection
  deletion_protection = var.environment == "prod" ? true : false
  skip_final_snapshot = var.environment == "prod" ? false : true
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database"
  })
}

# RDS Enhanced Monitoring IAM Role
resource "aws_iam_role" "rds_enhanced_monitoring" {
  count = var.enable_database ? 1 : 0
  
  name = "${local.name_prefix}-rds-enhanced-monitoring"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  count = var.enable_database ? 1 : 0
  
  role       = aws_iam_role.rds_enhanced_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# S3 Buckets for backups and static assets
resource "aws_s3_bucket" "backups" {
  bucket = "${local.name_prefix}-backups-${random_id.bucket_suffix.hex}"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backups"
    Purpose = "Application backups"
  })
}

resource "aws_s3_bucket" "static_assets" {
  bucket = "${local.name_prefix}-static-assets-${random_id.bucket_suffix.hex}"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-static-assets"
    Purpose = "Static assets and generated diagrams"
  })
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# S3 bucket configurations
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  rule {
    id     = "backup_lifecycle"
    status = "Enabled"
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
    
    expiration {
      days = 2555  # 7 years
    }
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-dashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", module.compute.api_service_name, "ClusterName", module.compute.ecs_cluster_name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.name
          title   = "API Service Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", module.compute.load_balancer_arn_suffix],
            [".", "TargetResponseTime", ".", "."],
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.name
          title   = "Load Balancer Metrics"
          period  = 300
        }
      }
    ]
  })
}

# Output values
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "load_balancer_dns_name" {
  description = "DNS name of the load balancer"
  value       = module.compute.load_balancer_dns_name
}

output "load_balancer_hosted_zone_id" {
  description = "Hosted zone ID of the load balancer"
  value       = module.compute.load_balancer_hosted_zone_id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.compute.ecs_cluster_name
}

output "database_endpoint" {
  description = "Database endpoint"
  value       = var.enable_database ? aws_db_instance.main[0].endpoint : null
  sensitive   = true
}

output "backup_bucket_name" {
  description = "Name of the backup S3 bucket"
  value       = aws_s3_bucket.backups.bucket
}

output "static_assets_bucket_name" {
  description = "Name of the static assets S3 bucket"
  value       = aws_s3_bucket.static_assets.bucket
}

output "monitoring_endpoints" {
  description = "Monitoring service endpoints"
  value = {
    prometheus = module.monitoring.prometheus_endpoint
    grafana    = module.monitoring.grafana_endpoint
    kibana     = module.monitoring.kibana_endpoint
    jaeger     = module.monitoring.jaeger_endpoint
  }
}