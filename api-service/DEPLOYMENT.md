# UML Images Service Enhanced - Deployment Guide

## Overview

This enhanced UML Images Service provides a high-performance, feature-rich API for generating UML diagrams with advanced capabilities including caching, queue processing, multiple output formats, and comprehensive monitoring.

## Architecture Components

### Core Services
- **API Server**: Express.js with advanced middleware stack
- **Redis Cache**: Intelligent caching with TTL management
- **PostgreSQL Database**: Persistence, analytics, and user management
- **Queue System**: Bull-based async processing with Redis
- **Monitoring**: Prometheus metrics with custom dashboards

### Key Features
- Multiple output formats (PNG, SVG, PDF, JPEG, WebP)
- Asynchronous processing with job tracking
- Advanced security validation and scanning
- Webhook notifications for async operations
- Real-time monitoring and alerting
- Comprehensive API documentation with Swagger UI

## Prerequisites

### System Requirements
- Node.js 18.0.0 or higher
- Redis 6.0 or higher
- PostgreSQL 12 or higher
- Docker and Docker Compose (recommended)
- Kroki service for diagram generation

### Resource Requirements
- **Development**: 2 CPU cores, 4GB RAM, 10GB storage
- **Production**: 4+ CPU cores, 8GB+ RAM, 50GB+ storage
- **High Load**: 8+ CPU cores, 16GB+ RAM, 100GB+ storage

## Environment Configuration

### Required Environment Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=9001

# Kroki Service
KROKI_URL=http://kroki-service:8000

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_DB=0
REDIS_PASSWORD=your-redis-password

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uml_service
DB_USER=postgres
DB_PASSWORD=your-db-password
DB_POOL_MAX=20
DB_POOL_MIN=5

# Security
WEBHOOK_SIGNING_SECRET=your-webhook-secret
JWT_SECRET=your-jwt-secret

# Performance Tuning
HTTP_MAX_SOCKETS=50
HTTP_MAX_FREE_SOCKETS=10
COMPRESSION_LEVEL=6
MAX_REQUEST_SIZE=1mb

# Queue Configuration
QUEUE_CONCURRENCY=5
BATCH_CONCURRENCY=2
WEBHOOK_CONCURRENCY=3

# Monitoring & Alerting
SYSTEM_ALERT_WEBHOOKS=https://alerts.yourcompany.com/webhook
ALERT_ERROR_RATE_THRESHOLD=5
ALERT_RESPONSE_TIME_THRESHOLD=5000
ALERT_MEMORY_USAGE_THRESHOLD=85
```

### Optional Environment Variables

```bash
# Feature Toggles
ENABLE_CACHE=true
ENABLE_DATABASE=true
ENABLE_QUEUE=true

# Advanced Monitoring
ALERT_CPU_USAGE_THRESHOLD=80
ALERT_QUEUE_DEPTH_THRESHOLD=100
ALERT_CACHE_HIT_RATE_THRESHOLD=70

# Security
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# Performance
KEEP_ALIVE_TIMEOUT=5000
HEADERS_TIMEOUT=6000
SERVER_TIMEOUT=30000
```

## Deployment Methods

### Docker Deployment (Recommended)

1. **Build the Docker image**:
```bash
cd api-service
docker build -t uml-images-service:2.0.0 .
```

2. **Using Docker Compose**:
```yaml
version: '3.8'
services:
  api-service:
    image: uml-images-service:2.0.0
    ports:
      - "9001:9001"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - DB_HOST=postgres
      - KROKI_URL=http://kroki:8000
    depends_on:
      - redis
      - postgres
      - kroki
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: uml_service
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your-db-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  kroki:
    image: yuzutech/kroki
    ports:
      - "8000:8000"
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
```

3. **Start the services**:
```bash
docker-compose up -d
```

### Manual Deployment

1. **Install dependencies**:
```bash
npm install --production
```

2. **Initialize database**:
```bash
# The database schema will be automatically created on first startup
# Ensure PostgreSQL is running and accessible
```

3. **Start the service**:
```bash
# Development
npm run dev

# Production
npm start
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uml-images-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: uml-images-service
  template:
    metadata:
      labels:
        app: uml-images-service
    spec:
      containers:
      - name: api
        image: uml-images-service:2.0.0
        ports:
        - containerPort: 9001
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: DB_HOST
          value: "postgres-service"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 9001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 9001
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: uml-images-service
spec:
  selector:
    app: uml-images-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 9001
```

## Configuration

### Production Optimizations

1. **Performance Settings**:
```bash
# Increase connection limits
HTTP_MAX_SOCKETS=100
HTTP_MAX_FREE_SOCKETS=20

# Optimize compression
COMPRESSION_LEVEL=4
COMPRESSION_THRESHOLD=512

# Queue performance
QUEUE_CONCURRENCY=10
BATCH_CONCURRENCY=5
```

2. **Security Hardening**:
```bash
# Enable HTTPS in production
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# Restrict CORS
CORS_ORIGIN=https://yourdomain.com

# Enable security features
HELMET_ENABLED=true
RATE_LIMITING_ENABLED=true
```

3. **Database Optimization**:
```bash
# Connection pooling
DB_POOL_MAX=50
DB_POOL_MIN=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
```

### Load Balancer Configuration

```nginx
upstream uml_api {
    least_conn;
    server api1.yourcompany.com:9001 max_fails=3 fail_timeout=30s;
    server api2.yourcompany.com:9001 max_fails=3 fail_timeout=30s;
    server api3.yourcompany.com:9001 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.yourcompany.com;

    location / {
        proxy_pass http://uml_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Health checks
        proxy_next_upstream error timeout http_500 http_502 http_503;
    }

    location /health {
        proxy_pass http://uml_api;
        access_log off;
    }
}
```

## Monitoring Setup

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: 'uml-images-service'
    static_configs:
      - targets: ['localhost:9001']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import the provided dashboard configuration or create custom dashboards using these key metrics:

- `uml_diagram_generation_total`
- `uml_diagram_generation_duration_seconds`
- `http_request_duration_seconds`
- `uml_system_health_score`
- `uml_cache_hit_ratio`
- `uml_queue_depth`

### Alerting Rules

```yaml
groups:
  - name: uml-service
    rules:
      - alert: HighErrorRate
        expr: rate(uml_diagram_generation_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in UML service"

      - alert: ServiceDown
        expr: up{job="uml-images-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "UML Images Service is down"
```

## Health Checks

The service provides multiple health check endpoints:

- `GET /health` - Basic health check
- `GET /api/v1/status` - Detailed service status
- `GET /api/monitoring/health/detailed` - Comprehensive health information

### Health Check Response

```json
{
  "status": "healthy",
  "service": "uml-api-service-enhanced",
  "version": "2.0.0",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "dependencies": {
    "cache": { "status": "connected", "stats": {...} },
    "database": { "status": "connected", "connections": {...} },
    "queues": { "status": "operational", "summary": {...} }
  }
}
```

## Security Considerations

### Network Security
- Use HTTPS in production
- Implement proper CORS policies
- Use rate limiting and DDoS protection
- Secure database connections with TLS

### Application Security
- Validate all inputs
- Sanitize UML content
- Use security headers (Helmet.js)
- Implement proper authentication

### Infrastructure Security
- Use container scanning
- Keep dependencies updated
- Implement secrets management
- Use network segmentation

## Backup and Recovery

### Database Backup
```bash
# Daily backup
pg_dump -h localhost -U postgres uml_service > backup_$(date +%Y%m%d).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups"
DB_NAME="uml_service"
DATE=$(date +%Y%m%d_%H%M%S)

pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/uml_service_$DATE.sql.gz
find $BACKUP_DIR -name "uml_service_*.sql.gz" -mtime +7 -delete
```

### Redis Backup
```bash
# Redis automatically creates dump.rdb
# Copy it for backup
cp /var/lib/redis/dump.rdb /backups/redis_$(date +%Y%m%d).rdb
```

## Troubleshooting

### Common Issues

1. **Service won't start**:
   - Check environment variables
   - Verify database connectivity
   - Check Redis connectivity
   - Review logs for specific errors

2. **High response times**:
   - Check database connection pool
   - Verify Redis cache status
   - Monitor queue depths
   - Check Kroki service health

3. **Memory issues**:
   - Monitor for memory leaks
   - Check queue job accumulation
   - Verify cache eviction policies
   - Review database connection limits

### Log Analysis

```bash
# Monitor service logs
docker-compose logs -f api-service

# Search for errors
docker-compose logs api-service | grep ERROR

# Monitor performance
docker-compose logs api-service | grep "slow request"
```

### Performance Tuning

1. **Database Performance**:
   - Monitor slow queries
   - Optimize indexes
   - Tune connection pool settings
   - Consider read replicas

2. **Cache Performance**:
   - Monitor hit ratios
   - Adjust TTL settings
   - Consider cache warming
   - Optimize cache keys

3. **Queue Performance**:
   - Monitor queue depths
   - Adjust concurrency settings
   - Optimize job processing
   - Consider queue partitioning

## Scaling

### Horizontal Scaling
- Add more API service instances
- Use Redis Cluster for cache scaling
- Implement database read replicas
- Use queue partitioning

### Vertical Scaling
- Increase CPU and memory
- Optimize connection pools
- Tune garbage collection
- Optimize cache sizes

## Maintenance

### Regular Tasks
- Monitor system health
- Review performance metrics
- Update dependencies
- Clean up old data
- Review and rotate logs

### Scheduled Maintenance
```bash
# Weekly database cleanup
0 2 * * 0 /opt/uml-service/scripts/cleanup-db.sh

# Daily cache optimization
0 3 * * * /opt/uml-service/scripts/optimize-cache.sh

# Monthly dependency updates
0 4 1 * * /opt/uml-service/scripts/update-deps.sh
```

## Support

For issues and questions:
- Check the API documentation at `/docs`
- Review monitoring dashboards
- Check service logs
- Consult this deployment guide
- Contact the development team

---

**Enhanced UML Images Service v2.0.0**  
*High-performance diagram generation with advanced features*