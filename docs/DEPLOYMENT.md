# Deployment Guide - UML Images Service

## 🚀 Deployment Overview

This guide provides step-by-step instructions for deploying the UML Images Service across different environments. The deployment process is designed for zero-downtime deployments with comprehensive monitoring and rollback capabilities.

## 📋 Prerequisites

### System Requirements
- **Docker**: Version 20.10+ with BuildKit enabled
- **Docker Compose**: Version 2.0+
- **Node.js**: Version 18+ (for local development)
- **Git**: Version 2.30+
- **AWS CLI**: Version 2.0+ (for cloud deployments)

### Access Requirements
- Container registry access (GitHub Container Registry)
- AWS account with appropriate permissions
- Slack webhook URL for notifications
- SSL certificate for HTTPS

### Environment Variables
Create environment-specific `.env` files:

```bash
# .env.development
ENVIRONMENT=development
NODE_ENV=development
DOMAIN=localhost
API_URL=http://localhost:9001
UI_URL=http://localhost:9002

# .env.staging
ENVIRONMENT=staging
NODE_ENV=staging
DOMAIN=staging.uml.example.com
API_URL=https://api.staging.uml.example.com
UI_URL=https://staging.uml.example.com

# .env.production
ENVIRONMENT=production
NODE_ENV=production
DOMAIN=uml.example.com
API_URL=https://api.uml.example.com
UI_URL=https://uml.example.com
```

## 🏠 Local Development Deployment

### Quick Start
```bash
# Clone repository
git clone https://github.com/company/uml-images-service.git
cd uml-images-service

# Start development environment
docker-compose up -d

# Verify deployment
./scripts/health-check.sh

# Access services
# UI: http://localhost:9002
# API: http://localhost:9001
# Kroki: http://localhost:8001
```

### Development with Monitoring
```bash
# Start with monitoring stack
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Access monitoring services
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
# Kibana: http://localhost:5601
# Jaeger: http://localhost:16686
```

### Development with Full Infrastructure
```bash
# Start complete infrastructure
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.infrastructure.yml \
  up -d

# Additional services available:
# Traefik Dashboard: http://localhost:8080
# Consul: http://localhost:8500
# Vault: http://localhost:8200
# MinIO: http://localhost:9001
# Portainer: https://localhost:9443
```

### Hot Reloading for Development
```bash
# Enable file watching for API service
docker-compose up -d api-service

# Enable file watching for UI service  
docker-compose up -d ui-service

# View real-time logs
docker-compose logs -f api-service ui-service
```

## 🧪 Staging Deployment

### Automated Staging Deployment
Staging deployments are triggered automatically on pushes to the `main` branch via GitHub Actions.

### Manual Staging Deployment
```bash
# Deploy to staging
./scripts/secure-deploy.sh --environment staging

# Monitor deployment
watch -n 5 './scripts/health-check.sh'

# Run post-deployment tests
./scripts/run-e2e-tests.sh --environment staging
```

### Staging Configuration
```yaml
# docker-compose.staging.yml
version: '3.8'
services:
  api-service:
    environment:
      - NODE_ENV=staging
      - ENABLE_SECURITY_HEADERS=true
      - ENABLE_RATE_LIMITING=true
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  ui-service:
    environment:
      - NODE_ENV=staging
      - ENABLE_SECURITY_HEADERS=true
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'
        reservations:
          memory: 128M
          cpus: '0.1'
```

### Staging Verification
```bash
# Comprehensive health check
./scripts/health-check.sh --comprehensive --url https://staging.uml.example.com

# Performance testing
k6 run tests/performance/staging-test.js

# Security testing
./scripts/security-test.sh --url https://staging.uml.example.com
```

## 🏭 Production Deployment

### Prerequisites for Production
1. **Code Review**: All changes must be peer-reviewed
2. **Testing**: Complete test suite must pass
3. **Security Scan**: No critical vulnerabilities
4. **Approval**: Deployment approval from team lead

### Production Deployment Process

#### 1. Pre-deployment Checks
```bash
# Verify CI/CD pipeline status
gh run list --workflow=ci.yml --limit=1

# Check staging environment health
./scripts/health-check.sh --url https://staging.uml.example.com

# Verify container images
docker manifest inspect ghcr.io/company/uml-api-service:latest
docker manifest inspect ghcr.io/company/uml-ui-service:latest
```

#### 2. Backup Current State
```bash
# Create backup before deployment
./scripts/backup-restore.sh backup full

# Verify backup
./scripts/backup-restore.sh verify latest-backup.tar.gz

# Upload to S3
aws s3 cp latest-backup.tar.gz s3://uml-backups/production/
```

#### 3. Deploy to Production
```bash
# Deploy to production (requires approval)
./scripts/secure-deploy.sh --environment production

# Monitor deployment progress
./scripts/deployment-monitor.sh --environment production
```

#### 4. Post-deployment Verification
```bash
# Health check
./scripts/health-check.sh --comprehensive --url https://uml.example.com

# Smoke tests
./scripts/smoke-tests.sh --environment production

# Performance validation
./scripts/performance-check.sh --environment production
```

### Blue-Green Deployment

#### Setup Blue-Green Environment
```bash
# Deploy to green environment
export DEPLOYMENT_SLOT=green
./scripts/secure-deploy.sh --environment production --slot green

# Test green environment
./scripts/health-check.sh --url https://green.uml.example.com
```

#### Traffic Switch
```bash
# Switch traffic to green
./scripts/traffic-switch.sh --from blue --to green

# Monitor metrics
./scripts/monitor-switch.sh --duration 300
```

#### Rollback if Needed
```bash
# Quick rollback to blue
./scripts/traffic-switch.sh --from green --to blue

# Or full rollback
./scripts/rollback.sh --to-previous-version
```

### Canary Deployment

#### Deploy Canary
```bash
# Deploy canary with 10% traffic
./scripts/canary-deploy.sh --traffic-percentage 10

# Monitor canary metrics
./scripts/canary-monitor.sh --duration 900
```

#### Scale Canary
```bash
# Increase traffic gradually
./scripts/canary-deploy.sh --traffic-percentage 25
./scripts/canary-deploy.sh --traffic-percentage 50
./scripts/canary-deploy.sh --traffic-percentage 100
```

## ☁️ Cloud Deployment (AWS)

### ECS Fargate Deployment

#### 1. Infrastructure Setup
```bash
# Deploy infrastructure with Terraform
cd terraform
terraform init
terraform plan -var-file=environments/prod/terraform.tfvars
terraform apply -var-file=environments/prod/terraform.tfvars
```

#### 2. Container Deployment
```bash
# Build and push images
./scripts/docker-optimize.sh --export --registry 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Update ECS services
aws ecs update-service \
  --cluster uml-prod-cluster \
  --service uml-api-service \
  --force-new-deployment

aws ecs update-service \
  --cluster uml-prod-cluster \
  --service uml-ui-service \
  --force-new-deployment
```

#### 3. Load Balancer Configuration
```bash
# Update target groups
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/uml-api/abc123

# Update DNS records
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch file://dns-update.json
```

### Auto Scaling Configuration
```yaml
# ECS Auto Scaling
AutoScalingPolicy:
  - MetricType: CPUUtilization
    TargetValue: 70
    ScaleOutCooldown: 300
    ScaleInCooldown: 300
  - MetricType: MemoryUtilization  
    TargetValue: 80
    ScaleOutCooldown: 300
    ScaleInCooldown: 300
```

## 📊 Deployment Monitoring

### Real-time Monitoring During Deployment
```bash
# Monitor deployment status
./scripts/deployment-monitor.sh --follow

# Watch key metrics
watch -n 5 'curl -s http://localhost:9090/api/v1/query?query=up{job="uml-api-service"}'

# Monitor error rates
./scripts/error-rate-monitor.sh --threshold 5
```

### Post-deployment Metrics
```bash
# Generate deployment report
./scripts/deployment-report.sh --deployment-id $(date +%Y%m%d-%H%M%S)

# Check SLA compliance
./scripts/sla-check.sh --window 1h
```

### Deployment Alerts
Alerts are automatically configured to monitor:
- Deployment success/failure
- Service health after deployment
- Error rate increases
- Performance degradation
- Resource usage spikes

## 🔄 Rollback Procedures

### Automatic Rollback Triggers
- Health check failures for > 5 minutes
- Error rate > 10% for > 2 minutes
- Response time > 5 seconds for > 3 minutes

### Manual Rollback
```bash
# Quick rollback to previous version
./scripts/rollback.sh --to-previous

# Rollback to specific version
./scripts/rollback.sh --to-version v1.2.3

# Database rollback (if applicable)
./scripts/db-rollback.sh --to-migration 20231120_123456
```

### Rollback Verification
```bash
# Verify rollback success
./scripts/health-check.sh --comprehensive

# Check version
curl https://uml.example.com/api/v1/version

# Monitor metrics
./scripts/post-rollback-monitor.sh --duration 600
```

## 🧪 Testing in Production

### Smoke Tests
```bash
# Basic functionality test
curl -f https://uml.example.com/health

# Diagram generation test
curl -X POST https://uml.example.com/api/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"uml":"@startuml\nAlice -> Bob: Hello\n@enduml"}'
```

### End-to-End Tests
```bash
# Run E2E tests against production
npx playwright test --config=e2e/production.config.js

# Synthetic monitoring
./scripts/synthetic-tests.sh --interval 300
```

### Performance Tests
```bash
# Load test production (careful!)
k6 run tests/performance/production-load-test.js

# Stress test (off-hours only)
k6 run tests/performance/stress-test.js
```

## 🚨 Incident Response During Deployment

### Deployment Failure Response
1. **Immediate**: Stop deployment, assess impact
2. **Communication**: Notify stakeholders via Slack/email
3. **Investigation**: Review logs, metrics, error reports
4. **Resolution**: Rollback or hotfix as appropriate
5. **Post-mortem**: Document lessons learned

### Emergency Rollback
```bash
# Emergency rollback (bypasses normal checks)
./scripts/emergency-rollback.sh --confirm

# Activate incident response
./scripts/incident-response.sh --severity critical
```

## 📈 Performance Optimization

### Deployment Performance
- Parallel container builds
- Layer caching optimization
- Rolling updates for zero downtime
- Health check optimization

### Runtime Performance
- Auto-scaling configuration
- Resource limit optimization
- Database connection pooling
- CDN integration for static assets

### Cost Optimization
- Spot instances for non-critical workloads
- Right-sizing based on metrics
- Scheduled scaling for predictable workloads
- Reserved instances for baseline capacity

## 🔐 Security Considerations

### Deployment Security
- Image vulnerability scanning
- Secrets management
- Network security groups
- SSL/TLS everywhere

### Runtime Security
- Non-root containers
- Read-only filesystems
- Security monitoring
- Intrusion detection

### Compliance
- Data encryption at rest and in transit
- Audit logging
- Access controls
- Regular security assessments

## 📚 Troubleshooting

### Common Deployment Issues

#### Container Startup Failures
```bash
# Check container logs
docker logs uml-api-service

# Check resource constraints
docker stats

# Verify configuration
docker exec uml-api-service env | grep -E "(NODE_ENV|PORT|API_URL)"
```

#### Service Discovery Issues
```bash
# Check service registration
docker exec consul consul catalog services

# Test service connectivity
docker exec api-service nslookup kroki-service
```

#### Load Balancer Issues
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

# Check security groups
aws ec2 describe-security-groups --group-ids $SECURITY_GROUP_ID
```

### Performance Issues
```bash
# Check resource usage
kubectl top pods

# Analyze bottlenecks
./scripts/performance-analysis.sh

# Scale services
kubectl scale deployment api-service --replicas=5
```

## 📞 Support

### Contact Information
- **DevOps Team**: devops@company.com
- **On-Call Engineer**: oncall@company.com
- **Slack Channel**: #uml-service-deployments

### Emergency Contacts
- **P1 Incidents**: +1-555-0123 (24/7)
- **Deployment Issues**: #deployment-support
- **Security Issues**: security@company.com

---

**Last Updated**: $(date)
**Version**: 1.0.0
**Maintained By**: DevOps Team