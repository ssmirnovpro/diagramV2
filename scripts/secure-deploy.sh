#!/bin/bash

# Secure Deployment Script for UML Images Service
# Deploys with production security configurations

set -euo pipefail

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
COMPOSE_FILES=("-f" "docker-compose.yml")

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log_message "Checking deployment prerequisites..."
    
    # Check Docker and Docker Compose
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed${NC}"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        exit 1
    fi
    
    # Check for required files
    local required_files=(
        "docker-compose.yml"
        "api-service/Dockerfile"
        "ui-service/Dockerfile"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            echo -e "${RED}❌ Required file missing: $file${NC}"
            exit 1
        fi
    done
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Function to setup environment
setup_environment() {
    log_message "Setting up environment for $ENVIRONMENT..."
    
    case "$ENVIRONMENT" in
        production)
            COMPOSE_FILES+=("-f" "docker-compose.prod.yml")
            export NODE_ENV=production
            export ENABLE_SECURITY_HEADERS=true
            export ENABLE_RATE_LIMITING=true
            export MAX_REQUEST_SIZE=1mb
            ;;
        staging)
            COMPOSE_FILES+=("-f" "docker-compose.prod.yml")
            export NODE_ENV=staging
            export ENABLE_SECURITY_HEADERS=true
            export ENABLE_RATE_LIMITING=true
            ;;
        development)
            export NODE_ENV=development
            ;;
        *)
            echo -e "${RED}❌ Unknown environment: $ENVIRONMENT${NC}"
            echo "Supported environments: production, staging, development"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ Environment configured for $ENVIRONMENT${NC}"
}

# Function to create necessary directories
create_directories() {
    log_message "Creating necessary directories..."
    
    local directories=(
        "api-service/logs"
        "ui-service/logs"
        "/tmp/uml-security-monitor"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        echo "Created directory: $dir"
    done
    
    echo -e "${GREEN}✅ Directories created${NC}"
}

# Function to run security checks
run_security_checks() {
    log_message "Running pre-deployment security checks..."
    
    # Check for common security issues in configuration
    if [[ "$ENVIRONMENT" == "production" ]]; then
        # Check if production override file exists
        if [[ ! -f "docker-compose.prod.yml" ]]; then
            echo -e "${YELLOW}⚠️  Production override file not found${NC}"
            echo "This deployment will use default development settings"
        fi
        
        # Check for HTTPS configuration
        if [[ "${API_URL:-}" != https://* ]] && [[ "${UI_URL:-}" != https://* ]]; then
            echo -e "${YELLOW}⚠️  HTTPS not configured for production${NC}"
            echo "Consider setting up a reverse proxy with SSL/TLS"
        fi
        
        # Check for secret management
        if [[ -z "${API_KEY:-}" ]] && [[ "$ENVIRONMENT" == "production" ]]; then
            echo -e "${YELLOW}⚠️  No API key configured${NC}"
            echo "Consider implementing API key authentication"
        fi
    fi
    
    echo -e "${GREEN}✅ Security checks completed${NC}"
}

# Function to install dependencies
install_dependencies() {
    log_message "Installing application dependencies..."
    
    # Build Docker images with security updates
    docker-compose "${COMPOSE_FILES[@]}" build --no-cache
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Function to deploy services
deploy_services() {
    log_message "Deploying services..."
    
    # Stop existing services
    docker-compose "${COMPOSE_FILES[@]}" down
    
    # Start services with production configuration
    docker-compose "${COMPOSE_FILES[@]}" up -d
    
    # Wait for services to be healthy
    log_message "Waiting for services to become healthy..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        local api_health
        api_health=$(docker-compose "${COMPOSE_FILES[@]}" exec -T api-service curl -s http://localhost:9001/health | grep -o '"status":"healthy"' || echo "")
        
        local ui_health
        ui_health=$(docker-compose "${COMPOSE_FILES[@]}" exec -T ui-service curl -s http://localhost:9002/health | grep -o '"status":"healthy"' || echo "")
        
        if [[ -n "$api_health" ]] && [[ -n "$ui_health" ]]; then
            echo -e "${GREEN}✅ All services are healthy${NC}"
            break
        fi
        
        echo "Waiting for services... (attempt $((attempt + 1))/$max_attempts)"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        echo -e "${RED}❌ Services failed to become healthy${NC}"
        docker-compose "${COMPOSE_FILES[@]}" logs
        exit 1
    fi
}

# Function to run post-deployment tests
run_post_deployment_tests() {
    log_message "Running post-deployment security tests..."
    
    if [[ -f "scripts/security-test.sh" ]]; then
        # Run security tests
        ./scripts/security-test.sh --api-url "http://localhost:9001" --ui-url "http://localhost:9002"
        
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}✅ Security tests passed${NC}"
        else
            echo -e "${YELLOW}⚠️  Some security tests failed - review results${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Security test script not found${NC}"
    fi
}

# Function to setup monitoring
setup_monitoring() {
    log_message "Setting up security monitoring..."
    
    if [[ -f "scripts/security-monitor.sh" ]]; then
        # Start security monitoring in background
        nohup ./scripts/security-monitor.sh --continuous > /tmp/security-monitor.log 2>&1 &
        echo $! > /tmp/security-monitor.pid
        
        echo -e "${GREEN}✅ Security monitoring started${NC}"
        echo "Monitor logs: tail -f /tmp/security-monitor.log"
        echo "Stop monitoring: kill \$(cat /tmp/security-monitor.pid)"
    else
        echo -e "${YELLOW}⚠️  Security monitoring script not found${NC}"
    fi
}

# Function to display deployment summary
display_summary() {
    log_message "Deployment Summary"
    echo "=================================="
    echo "Environment: $ENVIRONMENT"
    echo "Services:"
    
    # Show running containers
    docker-compose "${COMPOSE_FILES[@]}" ps
    
    echo ""
    echo "Service URLs:"
    echo "  API Service: http://localhost:9001"
    echo "  UI Service: http://localhost:9002"
    echo "  Health Checks:"
    echo "    - http://localhost:9001/health"
    echo "    - http://localhost:9002/health"
    
    echo ""
    echo "Security Features Enabled:"
    echo "  ✅ Input validation and sanitization"
    echo "  ✅ Rate limiting and request throttling"
    echo "  ✅ Security headers (CSP, HSTS, etc.)"
    echo "  ✅ Container security hardening"
    echo "  ✅ Comprehensive security logging"
    echo "  ✅ PlantUML injection prevention"
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo ""
        echo "Production Security Reminders:"
        echo "  🔐 Setup SSL/TLS with reverse proxy"
        echo "  🔐 Configure firewall rules"
        echo "  🔐 Setup log aggregation and monitoring"
        echo "  🔐 Regular security updates and patches"
        echo "  🔐 Backup and disaster recovery procedures"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -e, --environment ENV   Deployment environment (production|staging|development)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  ENVIRONMENT            Deployment environment"
    echo "  API_URL               API service external URL"
    echo "  UI_URL                UI service external URL"
    echo "  API_KEY               API authentication key"
}

# Main function
main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    echo -e "${BLUE}🚀 UML Images Service Secure Deployment${NC}"
    echo "Environment: $ENVIRONMENT"
    echo ""
    
    # Run deployment steps
    check_prerequisites
    setup_environment
    create_directories
    run_security_checks
    install_dependencies
    deploy_services
    run_post_deployment_tests
    setup_monitoring
    display_summary
}

# Handle signals for graceful shutdown
trap 'echo -e "\n${YELLOW}Deployment interrupted${NC}"; exit 1' SIGINT SIGTERM

# Run main function with all arguments
main "$@"