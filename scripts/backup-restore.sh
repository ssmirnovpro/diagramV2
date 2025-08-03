#!/bin/bash

# Backup and Restore Script for UML Images Service
# Provides comprehensive backup and disaster recovery capabilities

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/uml-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
S3_BUCKET="${S3_BUCKET:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"
PROMETHEUS_DATA_DIR="${PROMETHEUS_DATA_DIR:-/var/lib/docker/volumes/prometheus-data/_data}"
GRAFANA_DATA_DIR="${GRAFANA_DATA_DIR:-/var/lib/docker/volumes/grafana-data/_data}"
ELASTICSEARCH_DATA_DIR="${ELASTICSEARCH_DATA_DIR:-/var/lib/docker/volumes/elasticsearch-data/_data}"

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
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Check if backup directory is writable
    if [[ ! -w "$BACKUP_DIR" ]]; then
        log_error "Backup directory is not writable: $BACKUP_DIR"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Function to create application configuration backup
backup_configuration() {
    log_message "Backing up application configuration..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local config_backup_dir="$BACKUP_DIR/config_$timestamp"
    
    mkdir -p "$config_backup_dir"
    
    # Backup Docker Compose files
    cp docker-compose*.yml "$config_backup_dir/"
    
    # Backup monitoring configuration
    if [[ -d "monitoring" ]]; then
        cp -r monitoring "$config_backup_dir/"
    fi
    
    # Backup environment files (excluding secrets)
    if [[ -f ".env.example" ]]; then
        cp .env.example "$config_backup_dir/"
    fi
    
    # Backup scripts
    if [[ -d "scripts" ]]; then
        cp -r scripts "$config_backup_dir/"
    fi
    
    # Backup CI/CD configuration
    if [[ -d ".github" ]]; then
        cp -r .github "$config_backup_dir/"
    fi
    
    # Create metadata file
    cat > "$config_backup_dir/backup-metadata.json" << EOF
{
    "backup_type": "configuration",
    "timestamp": "$timestamp",
    "version": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
    "backup_size": "$(du -sh $config_backup_dir | cut -f1)",
    "files_count": $(find "$config_backup_dir" -type f | wc -l)
}
EOF
    
    # Compress the backup
    tar -czf "$config_backup_dir.tar.gz" -C "$BACKUP_DIR" "$(basename "$config_backup_dir")"
    rm -rf "$config_backup_dir"
    
    log_success "Configuration backup created: $config_backup_dir.tar.gz"
    echo "$config_backup_dir.tar.gz"
}

# Function to backup application data and volumes
backup_data() {
    log_message "Backing up application data..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local data_backup_dir="$BACKUP_DIR/data_$timestamp"
    
    mkdir -p "$data_backup_dir"
    
    # Backup Docker volumes
    log_message "Backing up Docker volumes..."
    
    # Get list of volumes
    local volumes=$(docker volume ls --format "table {{.Name}}" | grep -E "(prometheus|grafana|elasticsearch|api-logs|ui-logs)" || true)
    
    if [[ -n "$volumes" ]]; then
        while IFS= read -r volume; do
            if [[ -n "$volume" && "$volume" != "VOLUME" ]]; then
                log_message "Backing up volume: $volume"
                
                # Create volume backup using docker run
                docker run --rm \
                    -v "$volume:/source:ro" \
                    -v "$data_backup_dir:/backup" \
                    alpine:latest \
                    tar -czf "/backup/${volume}.tar.gz" -C /source .
                
                log_success "Volume backup completed: $volume"
            fi
        done <<< "$volumes"
    else
        log_warning "No volumes found to backup"
    fi
    
    # Backup container configurations
    log_message "Backing up container configurations..."
    docker inspect $(docker ps -aq --filter "name=uml-") > "$data_backup_dir/containers.json" 2>/dev/null || true
    
    # Create metadata file
    cat > "$data_backup_dir/backup-metadata.json" << EOF
{
    "backup_type": "data",
    "timestamp": "$timestamp",
    "volumes_backed_up": $(echo "$volumes" | wc -l),
    "backup_size": "$(du -sh $data_backup_dir | cut -f1)",
    "docker_version": "$(docker --version)",
    "compose_version": "$(docker-compose --version)"
}
EOF
    
    # Compress the backup
    tar -czf "$data_backup_dir.tar.gz" -C "$BACKUP_DIR" "$(basename "$data_backup_dir")"
    rm -rf "$data_backup_dir"
    
    log_success "Data backup created: $data_backup_dir.tar.gz"
    echo "$data_backup_dir.tar.gz"
}

# Function to backup monitoring data
backup_monitoring() {
    log_message "Backing up monitoring data..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local monitoring_backup_dir="$BACKUP_DIR/monitoring_$timestamp"
    
    mkdir -p "$monitoring_backup_dir"
    
    # Backup Prometheus data
    if docker ps --format "table {{.Names}}" | grep -q "prometheus"; then
        log_message "Backing up Prometheus data..."
        
        # Create Prometheus snapshot
        curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot 2>/dev/null || true
        
        # Backup Prometheus configuration and data
        docker run --rm \
            -v prometheus-data:/source:ro \
            -v "$monitoring_backup_dir:/backup" \
            alpine:latest \
            tar -czf "/backup/prometheus-data.tar.gz" -C /source .
    fi
    
    # Backup Grafana data
    if docker ps --format "table {{.Names}}" | grep -q "grafana"; then
        log_message "Backing up Grafana data..."
        
        # Backup Grafana database
        docker run --rm \
            -v grafana-data:/source:ro \
            -v "$monitoring_backup_dir:/backup" \
            alpine:latest \
            tar -czf "/backup/grafana-data.tar.gz" -C /source .
        
        # Export Grafana dashboards via API
        if [[ -n "$GRAFANA_API_KEY" ]]; then
            log_message "Exporting Grafana dashboards..."
            mkdir -p "$monitoring_backup_dir/grafana-dashboards"
            
            # Get all dashboards
            curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
                "http://localhost:3000/api/search?type=dash-db" \
                > "$monitoring_backup_dir/grafana-dashboards/dashboards-list.json" 2>/dev/null || true
            
            # Export each dashboard
            if [[ -f "$monitoring_backup_dir/grafana-dashboards/dashboards-list.json" ]]; then
                jq -r '.[].uid' "$monitoring_backup_dir/grafana-dashboards/dashboards-list.json" | while read -r uid; do
                    if [[ -n "$uid" && "$uid" != "null" ]]; then
                        curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
                            "http://localhost:3000/api/dashboards/uid/$uid" \
                            > "$monitoring_backup_dir/grafana-dashboards/$uid.json" 2>/dev/null || true
                    fi
                done
            fi
        fi
    fi
    
    # Backup Elasticsearch data
    if docker ps --format "table {{.Names}}" | grep -q "elasticsearch"; then
        log_message "Backing up Elasticsearch data..."
        
        # Create Elasticsearch snapshot
        curl -X PUT "localhost:9200/_snapshot/backup_$(date +%Y%m%d_%H%M%S)" \
            -H 'Content-Type: application/json' \
            -d '{"indices": "*", "ignore_unavailable": true}' 2>/dev/null || true
        
        # Backup Elasticsearch data directory
        docker run --rm \
            -v elasticsearch-data:/source:ro \
            -v "$monitoring_backup_dir:/backup" \
            alpine:latest \
            tar -czf "/backup/elasticsearch-data.tar.gz" -C /source .
    fi
    
    # Create metadata file
    cat > "$monitoring_backup_dir/backup-metadata.json" << EOF
{
    "backup_type": "monitoring",
    "timestamp": "$timestamp",
    "components": {
        "prometheus": $(docker ps --format "table {{.Names}}" | grep -q "prometheus" && echo "true" || echo "false"),
        "grafana": $(docker ps --format "table {{.Names}}" | grep -q "grafana" && echo "true" || echo "false"),
        "elasticsearch": $(docker ps --format "table {{.Names}}" | grep -q "elasticsearch" && echo "true" || echo "false")
    },
    "backup_size": "$(du -sh $monitoring_backup_dir | cut -f1)"
}
EOF
    
    # Compress the backup
    tar -czf "$monitoring_backup_dir.tar.gz" -C "$BACKUP_DIR" "$(basename "$monitoring_backup_dir")"
    rm -rf "$monitoring_backup_dir"
    
    log_success "Monitoring backup created: $monitoring_backup_dir.tar.gz"
    echo "$monitoring_backup_dir.tar.gz"
}

# Function to perform full system backup
backup_full() {
    log_message "Performing full system backup..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local full_backup_dir="$BACKUP_DIR/full_$timestamp"
    
    mkdir -p "$full_backup_dir"
    
    # Backup configuration
    config_backup=$(backup_configuration)
    cp "$config_backup" "$full_backup_dir/"
    
    # Backup data
    data_backup=$(backup_data)
    cp "$data_backup" "$full_backup_dir/"
    
    # Backup monitoring
    monitoring_backup=$(backup_monitoring)
    cp "$monitoring_backup" "$full_backup_dir/"
    
    # Create full backup metadata
    cat > "$full_backup_dir/full-backup-metadata.json" << EOF
{
    "backup_type": "full",
    "timestamp": "$timestamp",
    "components": {
        "configuration": "$(basename "$config_backup")",
        "data": "$(basename "$data_backup")",
        "monitoring": "$(basename "$monitoring_backup")"
    },
    "total_size": "$(du -sh $full_backup_dir | cut -f1)",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "docker_images": $(docker images --format "table {{.Repository}}:{{.Tag}}" | grep -E "(uml-|kroki)" | jq -R . | jq -s .)
}
EOF
    
    # Compress the full backup
    tar -czf "$full_backup_dir.tar.gz" -C "$BACKUP_DIR" "$(basename "$full_backup_dir")"
    rm -rf "$full_backup_dir"
    
    # Encrypt if encryption key is provided
    if [[ -n "$ENCRYPTION_KEY" ]]; then
        log_message "Encrypting backup..."
        gpg --symmetric --cipher-algo AES256 --compress-algo 1 --s2k-mode 3 \
            --s2k-digest-algo SHA512 --s2k-count 65536 \
            --passphrase "$ENCRYPTION_KEY" \
            --batch --yes \
            "$full_backup_dir.tar.gz"
        rm "$full_backup_dir.tar.gz"
        mv "$full_backup_dir.tar.gz.gpg" "$full_backup_dir.tar.gz.encrypted"
        log_success "Backup encrypted"
    fi
    
    log_success "Full backup created: $full_backup_dir.tar.gz"
    echo "$full_backup_dir.tar.gz"
}

# Function to upload backup to S3
upload_to_s3() {
    local backup_file="$1"
    
    if [[ -z "$S3_BUCKET" ]]; then
        log_warning "S3_BUCKET not configured, skipping upload"
        return 0
    fi
    
    log_message "Uploading backup to S3..."
    
    # Check if AWS CLI is available
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        return 1
    fi
    
    # Upload to S3
    aws s3 cp "$backup_file" "s3://$S3_BUCKET/uml-service-backups/$(basename "$backup_file")" \
        --storage-class STANDARD_IA \
        --metadata "service=uml-images,backup-date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    
    log_success "Backup uploaded to S3: s3://$S3_BUCKET/uml-service-backups/$(basename "$backup_file")"
}

# Function to restore from backup
restore_backup() {
    local backup_file="$1"
    local restore_type="${2:-full}"
    
    log_message "Restoring from backup: $backup_file"
    
    # Check if backup file exists
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    # Create temporary restore directory
    local restore_dir="/tmp/uml-restore-$(date +%s)"
    mkdir -p "$restore_dir"
    
    # Decrypt if needed
    if [[ "$backup_file" =~ \.encrypted$ ]]; then
        if [[ -z "$ENCRYPTION_KEY" ]]; then
            log_error "Encryption key required for encrypted backup"
            exit 1
        fi
        
        log_message "Decrypting backup..."
        gpg --decrypt --quiet --batch --passphrase "$ENCRYPTION_KEY" \
            "$backup_file" > "$restore_dir/backup.tar.gz"
        backup_file="$restore_dir/backup.tar.gz"
    fi
    
    # Extract backup
    log_message "Extracting backup..."
    tar -xzf "$backup_file" -C "$restore_dir"
    
    # Find the backup directory
    local backup_dir=$(find "$restore_dir" -maxdepth 1 -type d -name "*_*" | head -n 1)
    
    if [[ -z "$backup_dir" ]]; then
        log_error "Invalid backup format"
        exit 1
    fi
    
    # Stop services before restore
    log_message "Stopping services..."
    docker-compose down || true
    
    case "$restore_type" in
        "configuration"|"config")
            restore_configuration "$backup_dir"
            ;;
        "data")
            restore_data "$backup_dir"
            ;;
        "monitoring")
            restore_monitoring "$backup_dir"
            ;;
        "full")
            restore_configuration "$backup_dir"
            restore_data "$backup_dir"
            restore_monitoring "$backup_dir"
            ;;
        *)
            log_error "Invalid restore type: $restore_type"
            exit 1
            ;;
    esac
    
    # Cleanup
    rm -rf "$restore_dir"
    
    log_success "Restore completed successfully"
}

# Function to restore configuration
restore_configuration() {
    local backup_dir="$1"
    
    log_message "Restoring configuration..."
    
    # Find configuration backup
    local config_backup=$(find "$backup_dir" -name "config_*.tar.gz" | head -n 1)
    
    if [[ -n "$config_backup" ]]; then
        local config_restore_dir="/tmp/config-restore-$(date +%s)"
        mkdir -p "$config_restore_dir"
        
        tar -xzf "$config_backup" -C "$config_restore_dir"
        
        local config_dir=$(find "$config_restore_dir" -maxdepth 1 -type d -name "config_*" | head -n 1)
        
        if [[ -n "$config_dir" ]]; then
            # Restore Docker Compose files
            cp "$config_dir"/docker-compose*.yml ./ 2>/dev/null || true
            
            # Restore monitoring configuration
            if [[ -d "$config_dir/monitoring" ]]; then
                cp -r "$config_dir/monitoring" ./ 2>/dev/null || true
            fi
            
            # Restore scripts
            if [[ -d "$config_dir/scripts" ]]; then
                cp -r "$config_dir/scripts" ./ 2>/dev/null || true
                chmod +x scripts/*.sh 2>/dev/null || true
            fi
            
            log_success "Configuration restored"
        fi
        
        rm -rf "$config_restore_dir"
    else
        log_warning "No configuration backup found in $backup_dir"
    fi
}

# Function to restore data
restore_data() {
    local backup_dir="$1"
    
    log_message "Restoring data..."
    
    # Find data backup
    local data_backup=$(find "$backup_dir" -name "data_*.tar.gz" | head -n 1)
    
    if [[ -n "$data_backup" ]]; then
        local data_restore_dir="/tmp/data-restore-$(date +%s)"
        mkdir -p "$data_restore_dir"
        
        tar -xzf "$data_backup" -C "$data_restore_dir"
        
        local data_dir=$(find "$data_restore_dir" -maxdepth 1 -type d -name "data_*" | head -n 1)
        
        if [[ -n "$data_dir" ]]; then
            # Restore Docker volumes
            for volume_backup in "$data_dir"/*.tar.gz; do
                if [[ -f "$volume_backup" ]]; then
                    local volume_name=$(basename "$volume_backup" .tar.gz)
                    
                    log_message "Restoring volume: $volume_name"
                    
                    # Remove existing volume
                    docker volume rm "$volume_name" 2>/dev/null || true
                    
                    # Create new volume
                    docker volume create "$volume_name"
                    
                    # Restore volume data
                    docker run --rm \
                        -v "$volume_name:/target" \
                        -v "$data_dir:/backup:ro" \
                        alpine:latest \
                        tar -xzf "/backup/$(basename "$volume_backup")" -C /target
                    
                    log_success "Volume restored: $volume_name"
                fi
            done
            
            log_success "Data restored"
        fi
        
        rm -rf "$data_restore_dir"
    else
        log_warning "No data backup found in $backup_dir"
    fi
}

# Function to restore monitoring
restore_monitoring() {
    local backup_dir="$1"
    
    log_message "Restoring monitoring data..."
    
    # Find monitoring backup
    local monitoring_backup=$(find "$backup_dir" -name "monitoring_*.tar.gz" | head -n 1)
    
    if [[ -n "$monitoring_backup" ]]; then
        local monitoring_restore_dir="/tmp/monitoring-restore-$(date +%s)"
        mkdir -p "$monitoring_restore_dir"
        
        tar -xzf "$monitoring_backup" -C "$monitoring_restore_dir"
        
        local monitoring_dir=$(find "$monitoring_restore_dir" -maxdepth 1 -type d -name "monitoring_*" | head -n 1)
        
        if [[ -n "$monitoring_dir" ]]; then
            # Restore Prometheus data
            if [[ -f "$monitoring_dir/prometheus-data.tar.gz" ]]; then
                log_message "Restoring Prometheus data..."
                
                docker volume rm prometheus-data 2>/dev/null || true
                docker volume create prometheus-data
                
                docker run --rm \
                    -v prometheus-data:/target \
                    -v "$monitoring_dir:/backup:ro" \
                    alpine:latest \
                    tar -xzf "/backup/prometheus-data.tar.gz" -C /target
                
                log_success "Prometheus data restored"
            fi
            
            # Restore Grafana data
            if [[ -f "$monitoring_dir/grafana-data.tar.gz" ]]; then
                log_message "Restoring Grafana data..."
                
                docker volume rm grafana-data 2>/dev/null || true
                docker volume create grafana-data
                
                docker run --rm \
                    -v grafana-data:/target \
                    -v "$monitoring_dir:/backup:ro" \
                    alpine:latest \
                    tar -xzf "/backup/grafana-data.tar.gz" -C /target
                
                log_success "Grafana data restored"
            fi
            
            # Restore Elasticsearch data
            if [[ -f "$monitoring_dir/elasticsearch-data.tar.gz" ]]; then
                log_message "Restoring Elasticsearch data..."
                
                docker volume rm elasticsearch-data 2>/dev/null || true
                docker volume create elasticsearch-data
                
                docker run --rm \
                    -v elasticsearch-data:/target \
                    -v "$monitoring_dir:/backup:ro" \
                    alpine:latest \
                    tar -xzf "/backup/elasticsearch-data.tar.gz" -C /target
                
                log_success "Elasticsearch data restored"
            fi
            
            log_success "Monitoring data restored"
        fi
        
        rm -rf "$monitoring_restore_dir"
    else
        log_warning "No monitoring backup found in $backup_dir"
    fi
}

# Function to list available backups
list_backups() {
    log_message "Available backups in $BACKUP_DIR:"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local backups=$(find "$BACKUP_DIR" -maxdepth 1 -name "*.tar.gz*" -o -name "*.encrypted" | sort -r)
        
        if [[ -n "$backups" ]]; then
            echo ""
            printf "%-30s %-15s %-10s %-20s\n" "BACKUP FILE" "TYPE" "SIZE" "DATE"
            echo "--------------------------------------------------------------------------------"
            
            while IFS= read -r backup; do
                if [[ -f "$backup" ]]; then
                    local filename=$(basename "$backup")
                    local type="unknown"
                    local size=$(du -h "$backup" | cut -f1)
                    local date=$(date -r "$backup" "+%Y-%m-%d %H:%M:%S")
                    
                    if [[ "$filename" =~ ^config_ ]]; then
                        type="configuration"
                    elif [[ "$filename" =~ ^data_ ]]; then
                        type="data"
                    elif [[ "$filename" =~ ^monitoring_ ]]; then
                        type="monitoring"
                    elif [[ "$filename" =~ ^full_ ]]; then
                        type="full"
                    fi
                    
                    printf "%-30s %-15s %-10s %-20s\n" "$filename" "$type" "$size" "$date"
                fi
            done <<< "$backups"
        else
            echo "No backups found"
        fi
    else
        echo "Backup directory does not exist: $BACKUP_DIR"
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    log_message "Cleaning up backups older than $RETENTION_DAYS days..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local deleted_count=0
        
        while IFS= read -r backup; do
            if [[ -f "$backup" ]]; then
                rm "$backup"
                ((deleted_count++))
                log_message "Deleted old backup: $(basename "$backup")"
            fi
        done < <(find "$BACKUP_DIR" -maxdepth 1 -name "*.tar.gz*" -o -name "*.encrypted" -mtime +$RETENTION_DAYS)
        
        if [[ $deleted_count -gt 0 ]]; then
            log_success "Cleaned up $deleted_count old backups"
        else
            log_message "No old backups to clean up"
        fi
    fi
}

# Function to verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log_message "Verifying backup integrity: $backup_file"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Test archive integrity
    if [[ "$backup_file" =~ \.encrypted$ ]]; then
        if [[ -z "$ENCRYPTION_KEY" ]]; then
            log_error "Encryption key required for verification"
            return 1
        fi
        
        log_message "Verifying encrypted backup..."
        if gpg --decrypt --quiet --batch --passphrase "$ENCRYPTION_KEY" \
               "$backup_file" | tar -tzf - > /dev/null 2>&1; then
            log_success "Encrypted backup integrity verified"
            return 0
        else
            log_error "Encrypted backup integrity check failed"
            return 1
        fi
    else
        log_message "Verifying backup archive..."
        if tar -tzf "$backup_file" > /dev/null 2>&1; then
            log_success "Backup integrity verified"
            return 0
        else
            log_error "Backup integrity check failed"
            return 1
        fi
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  backup [config|data|monitoring|full]  Create backup"
    echo "  restore <backup-file> [type]          Restore from backup"
    echo "  list                                  List available backups"
    echo "  cleanup                               Remove old backups"
    echo "  verify <backup-file>                  Verify backup integrity"
    echo ""
    echo "Options:"
    echo "  -h, --help                           Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BACKUP_DIR                           Backup directory (default: /opt/uml-backups)"
    echo "  RETENTION_DAYS                       Backup retention in days (default: 30)"
    echo "  ENCRYPTION_KEY                       Encryption passphrase for backups"
    echo "  S3_BUCKET                            S3 bucket for remote backup storage"
    echo "  GRAFANA_API_KEY                      Grafana API key for dashboard export"
}

# Main function
main() {
    local command="${1:-}"
    
    case "$command" in
        "backup")
            check_prerequisites
            local backup_type="${2:-full}"
            case "$backup_type" in
                "config"|"configuration")
                    backup_file=$(backup_configuration)
                    ;;
                "data")
                    backup_file=$(backup_data)
                    ;;
                "monitoring")
                    backup_file=$(backup_monitoring)
                    ;;
                "full")
                    backup_file=$(backup_full)
                    ;;
                *)
                    log_error "Invalid backup type: $backup_type"
                    usage
                    exit 1
                    ;;
            esac
            
            # Upload to S3 if configured
            if [[ -n "$backup_file" ]]; then
                upload_to_s3 "$backup_file"
                cleanup_old_backups
            fi
            ;;
        "restore")
            check_prerequisites
            local backup_file="${2:-}"
            local restore_type="${3:-full}"
            
            if [[ -z "$backup_file" ]]; then
                log_error "Backup file required for restore"
                usage
                exit 1
            fi
            
            restore_backup "$backup_file" "$restore_type"
            ;;
        "list")
            list_backups
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "verify")
            local backup_file="${2:-}"
            
            if [[ -z "$backup_file" ]]; then
                log_error "Backup file required for verification"
                usage
                exit 1
            fi
            
            verify_backup "$backup_file"
            ;;
        "-h"|"--help"|"help")
            usage
            exit 0
            ;;
        "")
            log_error "Command required"
            usage
            exit 1
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Handle signals for graceful shutdown
trap 'echo -e "\n${YELLOW}Backup operation interrupted${NC}"; exit 1' SIGINT SIGTERM

# Run main function with all arguments
main "$@"