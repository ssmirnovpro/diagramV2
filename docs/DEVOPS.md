# DevOps Infrastructure and Operations Guide

## Overview

This document provides a comprehensive guide to the DevOps infrastructure and operational procedures for the UML Images Service. The infrastructure has been optimized for production deployment with a focus on scalability, reliability, security, and operational excellence.

## 🏗️ Architecture Overview

### Service Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Service    │    │   API Service   │    │  Kroki Service  │
│   (Port 9002)   │────│   (Port 9001)   │────│   (Port 8000)   │
│   Frontend      │    │   REST API      │    │   PlantUML      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Infrastructure Stack
- **Containerization**: Docker with multi-stage builds and security hardening
- **Orchestration**: Docker Compose (local) / ECS Fargate (production)
- **Load Balancing**: Application Load Balancer with SSL termination
- **Service Discovery**: Consul for service registration and discovery
- **Reverse Proxy**: Traefik with automatic SSL certificates
- **Monitoring**: Prometheus, Grafana, ELK Stack, Jaeger
- **Secrets Management**: AWS Secrets Manager / HashiCorp Vault
- **Storage**: MinIO (S3-compatible) for backups and static assets

## 🚀 Quick Start

### Local Development
```bash
# Start core services
docker-compose up -d

# Start with monitoring
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Start complete infrastructure
docker-compose -f docker-compose.yml -f docker-compose.infrastructure.yml up -d

# Health check
./scripts/health-check.sh
```

### Production Deployment
```bash
# Deploy to staging
./scripts/secure-deploy.sh --environment staging

# Deploy to production
./scripts/secure-deploy.sh --environment production

# Verify deployment
./scripts/health-check.sh --comprehensive
```

## 📊 Monitoring & Observability

### Monitoring Stack Components

#### Prometheus (Metrics Collection)
- **URL**: http://localhost:9090
- **Purpose**: Time-series metrics collection and alerting
- **Configuration**: `/monitoring/prometheus/prometheus.yml`
- **Retention**: 30 days (configurable)

**Key Metrics Monitored**:
- HTTP request rates and latencies
- Container CPU and memory usage
- Diagram generation success/failure rates
- Queue sizes and processing times
- Error rates and types

#### Grafana (Visualization)
- **URL**: http://localhost:3000
- **Default Credentials**: admin/admin (change on first login)
- **Purpose**: Dashboards and visualization
- **Dashboards**: Pre-configured for UML service metrics

**Pre-built Dashboards**:
- UML Service Overview
- Container Resource Usage
- API Performance Metrics
- Error Tracking and Analysis

#### ELK Stack (Logging)
- **Elasticsearch**: Log storage and search
- **Logstash**: Log processing and enrichment
- **Kibana**: Log visualization and analysis
- **Filebeat**: Log shipping from containers

#### Jaeger (Distributed Tracing)
- **URL**: http://localhost:16686
- **Purpose**: Request tracing across services
- **Integration**: OpenTelemetry collector

### Alerting Rules

#### Critical Alerts
- Service downtime (immediate notification)
- High error rates (>5% for 5 minutes)
- Memory usage >90%
- Disk space <10%

#### Warning Alerts
- High latency (>2s 95th percentile)
- CPU usage >80%
- Queue size >100 requests

### Alert Destinations
- **Slack**: Real-time notifications
- **Email**: Critical alerts to on-call team
- **PagerDuty**: Production incidents

## 🐳 Docker Optimization

### Multi-Stage Builds
All services use optimized multi-stage Dockerfiles:
1. **Dependencies stage**: Install and cache dependencies
2. **Build stage**: Copy source and remove development files
3. **Production stage**: Minimal runtime with security hardening

### Security Hardening
- Non-root user execution
- Read-only filesystems where possible
- Minimal attack surface (removed unnecessary binaries)
- Security scanning with Trivy
- Regular base image updates

### Performance Optimizations
- BuildKit enabled for faster builds
- Layer caching optimization
- Parallel build support
- Image size reduction (50-70% smaller)

### Build Script Usage
```bash
# Optimize all images
./scripts/docker-optimize.sh

# Build with security scanning
./scripts/docker-optimize.sh --scan

# Export to registry
./scripts/docker-optimize.sh --export --registry ghcr.io/company
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflows

#### Continuous Integration (ci.yml)
**Triggers**: Push to main/develop, Pull requests
**Stages**:
1. **Code Quality**: ESLint, Prettier, audit checks
2. **Security Scan**: Snyk, CodeQL, dependency scanning
3. **Testing**: Unit tests, integration tests (Node.js 18, 20)
4. **Docker Build**: Multi-platform builds (amd64, arm64)
5. **E2E Testing**: Playwright across multiple browsers
6. **Performance Testing**: k6 load testing

#### Continuous Deployment (cd.yml)
**Triggers**: Push to main, Tagged releases, Manual dispatch
**Stages**:
1. **Pre-deployment Validation**: Safety checks, image verification
2. **Staging Deployment**: Automated deployment to staging
3. **Production Deployment**: Manual approval required
4. **Post-deployment Monitoring**: Health checks and alerts

### Deployment Environments

#### Staging
- Automatic deployment from main branch
- Reduced resource allocation
- Complete feature testing
- Performance validation

#### Production
- Tagged releases only
- Manual approval process
- Blue-green deployment
- Comprehensive monitoring

### Environment Configuration
```bash
# Environment variables
ENVIRONMENT=production
API_REPLICAS=3
UI_REPLICAS=3
RESOURCE_LIMITS_CPU=1000m
RESOURCE_LIMITS_MEMORY=1Gi
```

## 💾 Backup & Recovery

### Backup Strategy

#### Automated Backups
- **Configuration**: Daily full backups at 2 AM UTC
- **Data**: Application volumes and monitoring data
- **Monitoring**: Prometheus, Grafana, Elasticsearch data
- **Retention**: 30 days local, 7 years in S3

#### Backup Types
1. **Configuration Backup**: Docker Compose, scripts, monitoring configs
2. **Data Backup**: Application volumes, logs
3. **Monitoring Backup**: Metrics, dashboards, alerts
4. **Full Backup**: Complete system state

### Backup Operations
```bash
# Create full backup
./scripts/backup-restore.sh backup full

# Create configuration-only backup
./scripts/backup-restore.sh backup config

# List available backups
./scripts/backup-restore.sh list

# Restore from backup
./scripts/backup-restore.sh restore /path/to/backup.tar.gz

# Verify backup integrity
./scripts/backup-restore.sh verify /path/to/backup.tar.gz
```

### Disaster Recovery

#### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 15 minutes
- **RPO (Recovery Point Objective)**: 5 minutes

#### DR Procedures
1. **Automated Failover**: Health check failures trigger automatic failover
2. **Manual Failover**: Emergency procedures for critical incidents
3. **Failback**: Controlled return to primary region

#### DR Testing
```bash
# Run DR test
./scripts/disaster-recovery.sh test

# Check system health
./scripts/disaster-recovery.sh health

# Perform failover (emergency)
./scripts/disaster-recovery.sh failover
```

## 🏢 Infrastructure as Code

### Terraform Configuration

#### Project Structure
```
terraform/
├── main.tf                 # Main configuration
├── variables.tf            # Variable definitions
├── modules/
│   ├── networking/         # VPC, subnets, routing
│   ├── compute/           # ECS, load balancers
│   ├── monitoring/        # CloudWatch, alerts
│   └── security/          # Security groups, IAM
└── environments/
    ├── dev/               # Development environment
    ├── staging/           # Staging environment
    └── prod/              # Production environment
```

#### Deployment
```bash
# Initialize Terraform
cd terraform
terraform init

# Plan deployment
terraform plan -var-file=environments/prod/terraform.tfvars

# Apply changes
terraform apply -var-file=environments/prod/terraform.tfvars

# Destroy (development only)
terraform destroy -var-file=environments/dev/terraform.tfvars
```

### Docker Compose Infrastructure
```bash
# Start infrastructure services
docker-compose -f docker-compose.infrastructure.yml up -d

# Services included:
# - Traefik (reverse proxy)
# - Consul (service discovery)
# - Vault (secrets management)
# - MinIO (object storage)
# - Redis (caching)
# - Portainer (container management)
```

## 🔒 Security

### Security Measures

#### Container Security
- Non-root user execution
- Read-only filesystems
- Capability dropping
- Security scanning with Trivy
- Regular security updates

#### Network Security
- Security groups with least privilege
- Private subnets for application services
- WAF protection for public endpoints
- SSL/TLS encryption everywhere

#### Application Security
- Input validation and sanitization
- Rate limiting and DDoS protection
- Security headers (CSP, HSTS, etc.)
- Authentication and authorization
- Secret management with Vault/Secrets Manager

#### Monitoring Security
- Security event logging
- Suspicious activity detection
- Failed authentication tracking
- Intrusion detection

### Security Scanning
```bash
# Run security tests
./scripts/security-test.sh

# Monitor security events
./scripts/security-monitor.sh --continuous

# Security audit
./scripts/security-audit.sh
```

## 📈 Performance

### Performance Monitoring

#### Application Metrics
- Request rates and latencies
- Error rates by endpoint
- Diagram generation times
- Queue processing metrics

#### Infrastructure Metrics
- Container resource usage
- Network performance
- Storage I/O
- Database performance (if applicable)

#### Custom Business Metrics
- Successful diagram generations
- User activity patterns
- Feature usage statistics
- Cost optimization metrics

### Performance Testing
```bash
# Load testing with k6
k6 run tests/performance/load-test.js

# Stress testing
k6 run tests/performance/stress-test.js

# Performance monitoring
./scripts/performance-monitor.sh
```

### Optimization Guidelines

#### API Service
- Connection pooling
- Request caching
- Async processing for long operations
- Resource limits and auto-scaling

#### UI Service
- Static asset optimization
- CDN integration
- Browser caching
- Progressive loading

#### Kroki Service
- Diagram caching
- Resource allocation
- Queue management
- Timeout handling

## 🚨 Incident Response

### Incident Classification

#### Severity Levels
- **P1 (Critical)**: Complete service outage
- **P2 (High)**: Major feature unavailable
- **P3 (Medium)**: Performance degradation
- **P4 (Low)**: Minor issues, cosmetic bugs

#### Response Times
- **P1**: Immediate response (15 minutes)
- **P2**: 1 hour response
- **P3**: 4 hour response
- **P4**: Next business day

### Incident Procedures

#### Alert Response
1. **Acknowledge**: Confirm alert receipt
2. **Assess**: Determine severity and impact
3. **Escalate**: Notify appropriate teams
4. **Investigate**: Use monitoring tools for root cause
5. **Resolve**: Implement fix or workaround
6. **Communicate**: Update stakeholders
7. **Document**: Post-incident review

#### Escalation Path
1. On-call engineer
2. Team lead
3. Engineering manager
4. Director of engineering

### Runbooks

#### Service Restart
```bash
# Restart specific service
docker-compose restart api-service

# Rolling restart (zero downtime)
docker-compose up -d --force-recreate api-service
```

#### Performance Issues
```bash
# Check resource usage
docker stats

# Check application metrics
curl http://localhost:9001/metrics

# Scale up services
docker-compose up -d --scale api-service=3
```

#### Database Issues
```bash
# Check database connections
./scripts/db-health-check.sh

# Backup database
./scripts/backup-restore.sh backup data

# Restore from backup
./scripts/backup-restore.sh restore latest-backup.tar.gz
```

## 🔧 Troubleshooting

### Common Issues

#### Service Won't Start
1. Check Docker daemon status
2. Verify port availability
3. Check resource limits
4. Review service logs
5. Validate configuration

#### High Memory Usage
1. Check container limits
2. Look for memory leaks
3. Optimize application code
4. Scale horizontally
5. Increase resource limits

#### Slow Response Times
1. Check database performance
2. Analyze application metrics
3. Review cache hit rates
4. Optimize queries
5. Scale services

#### Failed Health Checks
1. Verify endpoint availability
2. Check service dependencies
3. Review timeout settings
4. Analyze error logs
5. Restart unhealthy services

### Diagnostic Commands
```bash
# Service health
./scripts/health-check.sh --comprehensive

# Resource usage
docker stats

# Service logs
docker-compose logs -f api-service

# Network connectivity
docker exec api-service ping kroki-service

# Database status (if applicable)
docker exec database pg_isready
```

## 📚 Additional Resources

### Documentation
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Prometheus Monitoring](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)
- [ELK Stack Guide](https://www.elastic.co/guide/)

### Tools and Utilities
- **Health Check**: `./scripts/health-check.sh`
- **Backup/Restore**: `./scripts/backup-restore.sh`
- **Docker Optimization**: `./scripts/docker-optimize.sh`
- **Security Testing**: `./scripts/security-test.sh`
- **Disaster Recovery**: `./scripts/disaster-recovery.sh`

### Configuration Files
- **Docker Compose**: `docker-compose*.yml`
- **Monitoring**: `monitoring/`
- **CI/CD**: `.github/workflows/`
- **Terraform**: `terraform/`
- **Scripts**: `scripts/`

### Support Contacts
- **DevOps Team**: devops@company.com
- **On-Call**: oncall@company.com
- **Slack**: #uml-service-alerts

## 📋 Maintenance

### Regular Maintenance Tasks

#### Daily
- Monitor service health
- Review error rates
- Check backup status
- Security event review

#### Weekly
- Update dependencies
- Performance review
- Capacity planning
- Security updates

#### Monthly
- DR testing
- Security audits
- Cost optimization review
- Documentation updates

#### Quarterly
- Infrastructure review
- Technology updates
- Training and knowledge transfer
- Process improvements

---

**Last Updated**: $(date)
**Version**: 1.0.0
**Maintained By**: DevOps Team