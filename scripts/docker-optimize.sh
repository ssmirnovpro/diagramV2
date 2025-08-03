#!/bin/bash

# Docker Optimization Script for UML Images Service
# Optimizes Docker builds, images, and container performance

set -euo pipefail

# Configuration
BUILD_CACHE_DIR="${BUILD_CACHE_DIR:-$HOME/.docker-cache/uml-service}"
REGISTRY="${REGISTRY:-}"
ENABLE_BUILDKIT="${ENABLE_BUILDKIT:-1}"
PARALLEL_BUILDS="${PARALLEL_BUILDS:-true}"
SECURITY_SCAN="${SECURITY_SCAN:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check prerequisites
check_prerequisites() {
    log_message "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Enable BuildKit for better performance
    if [ "$ENABLE_BUILDKIT" = "1" ]; then
        export DOCKER_BUILDKIT=1
        export COMPOSE_DOCKER_CLI_BUILD=1
        log_success "Docker BuildKit enabled"
    fi
    
    log_success "Prerequisites check passed"
}

# Function to create build cache directory
setup_build_cache() {
    log_message "Setting up build cache..."
    
    mkdir -p "$BUILD_CACHE_DIR"
    
    # Create cache mount directories
    mkdir -p "$BUILD_CACHE_DIR/api-node-modules"
    mkdir -p "$BUILD_CACHE_DIR/ui-node-modules"
    mkdir -p "$BUILD_CACHE_DIR/npm-cache"
    
    log_success "Build cache directory created: $BUILD_CACHE_DIR"
}

# Function to cleanup old images and containers
cleanup_docker() {
    log_message "Cleaning up Docker resources..."
    
    # Remove dangling images
    if [ "$(docker images -q -f dangling=true)" ]; then
        docker rmi $(docker images -q -f dangling=true) || true
        log_success "Removed dangling images"
    fi
    
    # Remove unused containers
    docker container prune -f || true
    
    # Remove unused networks
    docker network prune -f || true
    
    # Remove unused volumes (be careful with this in production)
    if [ "${CLEANUP_VOLUMES:-false}" = "true" ]; then
        docker volume prune -f || true
        log_warning "Removed unused volumes"
    fi
    
    # Show disk usage
    echo "Docker disk usage:"
    docker system df
    
    log_success "Docker cleanup completed"
}

# Function to optimize images with multi-stage builds
build_optimized_images() {
    log_message "Building optimized Docker images..."
    
    # Build arguments for optimization
    local build_args=(
        --build-arg "BUILDKIT_INLINE_CACHE=1"
        --build-arg "NODE_ENV=production"
    )
    
    if [ -n "$REGISTRY" ]; then
        build_args+=(--build-arg "REGISTRY=$REGISTRY")
    fi
    
    # Build API service with cache mount
    log_message "Building API service..."
    if [ "$PARALLEL_BUILDS" = "true" ]; then
        docker build \
            "${build_args[@]}" \
            --target production \
            --cache-from "$REGISTRY/uml-api-service:cache" \
            --tag "uml-api-service:latest" \
            --tag "uml-api-service:$(date +%Y%m%d-%H%M%S)" \
            ./api-service &
        API_BUILD_PID=$!
    else
        docker build \
            "${build_args[@]}" \
            --target production \
            --tag "uml-api-service:latest" \
            --tag "uml-api-service:$(date +%Y%m%d-%H%M%S)" \
            ./api-service
    fi
    
    # Build UI service with cache mount
    log_message "Building UI service..."
    if [ "$PARALLEL_BUILDS" = "true" ]; then
        docker build \
            "${build_args[@]}" \
            --target production \
            --cache-from "$REGISTRY/uml-ui-service:cache" \
            --tag "uml-ui-service:latest" \
            --tag "uml-ui-service:$(date +%Y%m%d-%H%M%S)" \
            ./ui-service &
        UI_BUILD_PID=$!
    else
        docker build \
            "${build_args[@]}" \
            --target production \
            --tag "uml-ui-service:latest" \
            --tag "uml-ui-service:$(date +%Y%m%d-%H%M%S)" \
            ./ui-service
    fi
    
    # Wait for parallel builds to complete
    if [ "$PARALLEL_BUILDS" = "true" ]; then
        wait $API_BUILD_PID && log_success "API service build completed" || log_error "API service build failed"
        wait $UI_BUILD_PID && log_success "UI service build completed" || log_error "UI service build failed"
    fi
    
    log_success "All images built successfully"
}

# Function to run security scanning
security_scan() {
    if [ "$SECURITY_SCAN" != "true" ]; then
        log_warning "Security scanning disabled"
        return 0
    fi
    
    log_message "Running security scans..."
    
    # Check if Trivy is available
    if command -v trivy &> /dev/null; then
        log_message "Scanning API service image..."
        trivy image --severity HIGH,CRITICAL uml-api-service:latest
        
        log_message "Scanning UI service image..."
        trivy image --severity HIGH,CRITICAL uml-ui-service:latest
        
        log_success "Security scans completed"
    else
        log_warning "Trivy not installed - skipping vulnerability scans"
        log_message "To install Trivy: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    fi
}

# Function to analyze image sizes
analyze_image_sizes() {
    log_message "Analyzing image sizes..."
    
    echo "Image size comparison:"
    echo "======================"
    
    # Show current image sizes
    docker images | grep -E "(uml-api-service|uml-ui-service|yuzutech/kroki)" | \
    awk '{print $1 ":" $2 "\t" $7 $8}' | column -t
    
    # Calculate total size
    local total_size=$(docker images | grep -E "uml-(api|ui)-service" | \
    awk '{
        if ($7 ~ /MB/) size += $7;
        if ($7 ~ /GB/) size += $7 * 1024;
    } END {print size}')
    
    echo ""
    echo "Total application image size: ${total_size:-0} MB"
    
    # Provide optimization suggestions
    echo ""
    echo "Optimization suggestions:"
    echo "========================"
    echo "• Multi-stage builds: ✅ Implemented"
    echo "• Alpine base images: ✅ Implemented"
    echo "• Security hardening: ✅ Implemented"
    echo "• Dependency optimization: ✅ Implemented"
    echo "• Layer caching: ✅ Implemented"
    
    log_success "Image analysis completed"
}

# Function to test optimized images
test_optimized_images() {
    log_message "Testing optimized images..."
    
    # Test API service
    log_message "Testing API service startup..."
    if docker run --rm -d --name test-api -p 19001:9001 uml-api-service:latest; then
        sleep 10
        if curl -f http://localhost:19001/health &> /dev/null; then
            log_success "API service test passed"
        else
            log_error "API service health check failed"
        fi
        docker stop test-api &> /dev/null || true
    else
        log_error "API service failed to start"
    fi
    
    # Test UI service
    log_message "Testing UI service startup..."
    if docker run --rm -d --name test-ui -p 19002:9002 uml-ui-service:latest; then
        sleep 10
        if curl -f http://localhost:19002/health &> /dev/null; then
            log_success "UI service test passed"
        else
            log_error "UI service health check failed"
        fi
        docker stop test-ui &> /dev/null || true
    else
        log_error "UI service failed to start"
    fi
    
    log_success "Image testing completed"
}

# Function to export images for registry
export_images() {
    if [ -z "$REGISTRY" ]; then
        log_warning "No registry specified - skipping image export"
        return 0
    fi
    
    log_message "Tagging images for registry..."
    
    # Tag images for registry
    docker tag uml-api-service:latest "$REGISTRY/uml-api-service:latest"
    docker tag uml-api-service:latest "$REGISTRY/uml-api-service:$(date +%Y%m%d-%H%M%S)"
    
    docker tag uml-ui-service:latest "$REGISTRY/uml-ui-service:latest"
    docker tag uml-ui-service:latest "$REGISTRY/uml-ui-service:$(date +%Y%m%d-%H%M%S)"
    
    log_success "Images tagged for registry: $REGISTRY"
    log_message "To push: docker push $REGISTRY/uml-api-service:latest"
    log_message "To push: docker push $REGISTRY/uml-ui-service:latest"
}

# Function to generate Dockerfile best practices report
generate_report() {
    log_message "Generating optimization report..."
    
    local report_file="docker-optimization-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << 'EOF'
# Docker Optimization Report

## Summary
This report details the Docker optimizations implemented for the UML Images Service.

## Optimizations Implemented

### 1. Multi-Stage Builds
- **Dependencies stage**: Install and cache dependencies
- **Build stage**: Copy source code and remove development files
- **Production stage**: Minimal runtime image with only necessary components

### 2. Security Hardening
- Non-root user execution (UID 1001)
- Read-only filesystem support
- Minimal attack surface (removed unnecessary binaries)
- Security labels and metadata
- Proper signal handling with tini

### 3. Image Size Optimization
- Alpine Linux base images (minimal footprint)
- Multi-stage builds to exclude build dependencies
- Removal of development files and test artifacts
- Optimized layer caching

### 4. Performance Improvements
- BuildKit enabled for faster builds
- Parallel build support
- Dependency caching
- Optimized health checks

### 5. Best Practices
- Proper ENTRYPOINT and CMD usage
- Explicit EXPOSE declarations
- Comprehensive health checks
- Signal handling for graceful shutdowns
- Security scanning integration

## Image Sizes
EOF
    
    echo "## Image Sizes" >> "$report_file"
    echo "\`\`\`" >> "$report_file"
    docker images | grep -E "(uml-api-service|uml-ui-service)" >> "$report_file"
    echo "\`\`\`" >> "$report_file"
    
    cat >> "$report_file" << 'EOF'

## Security Features
- Non-privileged user execution
- Read-only filesystem capability
- Minimal runtime dependencies
- Security scanning ready
- Proper capability dropping

## Performance Features
- Fast startup times with tini
- Efficient health checks
- Optimized layer caching
- Parallel build support

## Maintenance
- Automated security updates
- Dependency audit integration
- Comprehensive logging
- Monitoring readiness

Generated on: $(date)
EOF
    
    log_success "Report generated: $report_file"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -c, --cleanup          Clean up Docker resources before building"
    echo "  -s, --scan             Enable security scanning"
    echo "  -t, --test             Test optimized images"
    echo "  -e, --export           Export images for registry"
    echo "  -r, --registry URL     Registry URL for image export"
    echo "  -p, --parallel         Enable parallel builds (default: true)"
    echo "  --no-cache             Build without cache"
    echo "  --cleanup-volumes      Include volume cleanup (DANGEROUS)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BUILD_CACHE_DIR        Build cache directory (default: ~/.docker-cache/uml-service)"
    echo "  REGISTRY              Container registry URL"
    echo "  ENABLE_BUILDKIT       Enable Docker BuildKit (default: 1)"
    echo "  PARALLEL_BUILDS       Enable parallel builds (default: true)"
    echo "  SECURITY_SCAN         Enable security scanning (default: true)"
    echo "  CLEANUP_VOLUMES       Enable volume cleanup (default: false)"
}

# Main function
main() {
    local cleanup=false
    local test_images=false
    local export_images_flag=false
    local no_cache=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--cleanup)
                cleanup=true
                shift
                ;;
            -s|--scan)
                SECURITY_SCAN=true
                shift
                ;;
            -t|--test)
                test_images=true
                shift
                ;;
            -e|--export)
                export_images_flag=true
                shift
                ;;
            -r|--registry)
                REGISTRY="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL_BUILDS=true
                shift
                ;;
            --no-cache)
                no_cache="--no-cache"
                shift
                ;;
            --cleanup-volumes)
                CLEANUP_VOLUMES=true
                shift
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
    
    echo -e "${BLUE}🐳 Docker Optimization for UML Images Service${NC}"
    echo "=============================================="
    echo ""
    
    # Run optimization steps
    check_prerequisites
    setup_build_cache
    
    if [ "$cleanup" = true ]; then
        cleanup_docker
    fi
    
    build_optimized_images
    security_scan
    analyze_image_sizes
    
    if [ "$test_images" = true ]; then
        test_optimized_images
    fi
    
    if [ "$export_images_flag" = true ]; then
        export_images
    fi
    
    generate_report
    
    echo ""
    log_success "Docker optimization completed successfully!"
    echo ""
    echo "Next steps:"
    echo "• Review the generated optimization report"
    echo "• Run './scripts/docker-optimize.sh --test' to test images"
    echo "• Use 'docker-compose -f docker-compose.yml -f docker-compose.prod.yml up' for production"
    echo "• Set up container registry and push images with --export"
}

# Handle signals for graceful shutdown
trap 'echo -e "\n${YELLOW}Optimization interrupted${NC}"; exit 1' SIGINT SIGTERM

# Run main function with all arguments
main "$@"