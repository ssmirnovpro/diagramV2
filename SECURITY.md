# 🛡️ Security Documentation - UML Images Service

## Security Overview

This document outlines the comprehensive security measures implemented in the UML Images Service to protect against common web application vulnerabilities and ensure secure operation in production environments.

## Security Architecture

### Defense in Depth Strategy

1. **Container Security** - Hardened Docker configurations with non-root users
2. **Network Security** - Isolated network segments and controlled communication
3. **Application Security** - Input validation, output encoding, and secure coding practices
4. **API Security** - Rate limiting, authentication, and comprehensive validation
5. **Infrastructure Security** - Security headers, monitoring, and logging

## Security Features Implemented

### 🚫 **CRITICAL VULNERABILITIES FIXED**

#### 1. Remote Code Execution (RCE) Prevention
- **Issue**: Kroki service was running in `unsafe` mode
- **Fix**: Changed to `secure` mode with strict file access controls
- **Impact**: Prevents execution of arbitrary code via malicious PlantUML

#### 2. Input Validation & Sanitization
- **Enhanced PlantUML Validation**: Comprehensive pattern matching for dangerous constructs
- **Size Limits**: Reduced from 100KB to 50KB for security
- **Pattern Blocking**: Prevents `!include`, `!define`, file system access
- **Encoding Validation**: Checks for suspicious character sequences

#### 3. Container Security Hardening
- **Non-root Users**: All services run as dedicated non-root users
- **Read-only Filesystems**: Containers use read-only root filesystems
- **Capability Dropping**: Minimal required capabilities only
- **Resource Limits**: CPU and memory constraints to prevent DoS

### 🔒 **API Security Measures**

#### Rate Limiting
```yaml
Global Rate Limit: 100 requests / 15 minutes / IP
Generation Rate Limit: 10 requests / 1 minute / IP
Progressive Delay: 500ms delay after 5 requests
```

#### Request Validation
- JSON schema validation
- Content-Type enforcement
- Request size limits (1MB default)
- User-Agent analysis for suspicious patterns

#### CORS Protection
```javascript
Allowed Origins: Configured whitelist only
Credentials: Enabled for authenticated requests
Methods: GET, POST, OPTIONS only
Headers: Content-Type, Authorization, X-Requested-With
```

### 🌐 **Network Security**

#### Security Headers
```yaml
Content-Security-Policy: Strict with nonces
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: 1 year with preload
Referrer-Policy: strict-origin-when-cross-origin
```

#### Network Isolation
- Custom Docker network with controlled subnet
- Service-to-service communication only
- External access through reverse proxy recommended

### 📊 **Monitoring & Logging**

#### Security Event Logging
- **Structured Logging**: JSON format with consistent fields
- **Sensitive Data Filtering**: Automatic redaction of secrets
- **Event Categories**: 
  - Suspicious activities
  - Validation failures
  - Rate limit violations
  - Authentication failures

#### Monitoring Script
```bash
# Run security monitoring
./scripts/security-monitor.sh --continuous

# One-time security check
./scripts/security-monitor.sh --once
```

## Security Configuration

### Environment Variables

#### Production Security Settings
```bash
# API Service
NODE_ENV=production
ENABLE_SECURITY_HEADERS=true
ENABLE_RATE_LIMITING=true
MAX_REQUEST_SIZE=1mb

# Kroki Service
KROKI_SAFE_MODE=secure
KROKI_MAX_URI_LENGTH=2000
KROKI_BLOCK_LOCAL_FILE_ACCESS=true
KROKI_DISABLE_INCLUDE=true
```

### Docker Security Configuration

#### Production Deployment
```bash
# Use production security overrides
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Security Features
- Non-root container users
- Read-only filesystems
- Dropped capabilities
- Resource limits
- Network isolation

## Vulnerability Assessment

### Security Testing Checklist

#### Input Validation Testing
- [ ] PlantUML injection attempts
- [ ] File inclusion attacks
- [ ] Code execution payloads
- [ ] Oversized requests
- [ ] Invalid character encodings

#### Authentication & Authorization
- [ ] Rate limiting effectiveness
- [ ] CORS policy enforcement
- [ ] API endpoint access controls
- [ ] Session management (if applicable)

#### Network Security
- [ ] Security headers presence
- [ ] TLS configuration
- [ ] Certificate validation
- [ ] Network segmentation

#### Container Security
- [ ] Non-root user verification
- [ ] Capability audit
- [ ] Filesystem permissions
- [ ] Resource limit enforcement

## Incident Response

### Security Event Response

#### 1. Detection
- Monitor security logs continuously
- Automated alerting for critical events
- Real-time suspicious activity detection

#### 2. Analysis
```bash
# Check recent security events
grep "SECURITY_EVENT" api-service/logs/security.log | tail -50

# Monitor service health
./scripts/security-monitor.sh --once
```

#### 3. Response Actions
- **High Severity**: Immediate service isolation
- **Medium Severity**: Increased monitoring and investigation
- **Low Severity**: Log analysis and pattern identification

### Common Security Scenarios

#### Suspicious PlantUML Patterns
```bash
# Check for dangerous patterns in logs
grep "DANGEROUS_PATTERN_DETECTED" api-service/logs/security.log
```

#### Rate Limiting Violations
```bash
# Identify attacking IPs
grep "RATE_LIMIT_EXCEEDED" api-service/logs/security.log | awk '{print $5}' | sort | uniq -c
```

#### Service Degradation
```bash
# Check service health
curl -f http://localhost:9001/health
curl -f http://localhost:9002/health
```

## Security Maintenance

### Regular Security Tasks

#### Daily
- [ ] Review security logs for anomalies
- [ ] Check service health and availability
- [ ] Monitor resource usage

#### Weekly
- [ ] Analyze security event trends
- [ ] Review rate limiting effectiveness
- [ ] Update security monitoring rules

#### Monthly
- [ ] Security configuration review
- [ ] Dependency vulnerability scan
- [ ] Penetration testing
- [ ] Security training updates

### Dependency Management

#### Security Updates
```bash
# Check for security vulnerabilities
npm audit

# Update dependencies
npm update

# Rebuild containers with updates
docker-compose build --no-cache
```

## Compliance & Standards

### Security Standards Alignment
- **OWASP Top 10**: Protection against all major web application risks
- **NIST Cybersecurity Framework**: Identify, Protect, Detect, Respond, Recover
- **Docker Security**: CIS Docker Benchmark compliance
- **Node.js Security**: OWASP Node.js security practices

### Privacy & Data Protection
- **Data Minimization**: Only necessary data is processed
- **Retention Limits**: Logs rotated and archived appropriately
- **Access Controls**: Principle of least privilege
- **Audit Trails**: Comprehensive logging for compliance

## Security Contact

### Reporting Security Issues
- **Email**: security@yourcompany.com
- **Response Time**: 24 hours for critical issues
- **Escalation**: Follow responsible disclosure practices

### Security Team
- Security Officer: [Name]
- DevOps Lead: [Name]
- Development Lead: [Name]

---

**Last Updated**: $(date '+%Y-%m-%d')
**Version**: 1.0
**Next Review**: $(date -d '+3 months' '+%Y-%m-%d')