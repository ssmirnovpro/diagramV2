#!/bin/bash

# Security Monitoring Script for UML Images Service
# Monitors logs for security events and generates alerts

set -euo pipefail

# Configuration
LOG_DIR="./api-service/logs"
SECURITY_LOG="$LOG_DIR/security.log"
ALERT_THRESHOLD=10
TEMP_DIR="/tmp/uml-security-monitor"
ALERT_EMAIL="${ALERT_EMAIL:-admin@example.com}"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Ensure directories exist
mkdir -p "$TEMP_DIR"
mkdir -p "$LOG_DIR"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$TEMP_DIR/monitor.log"
}

# Function to send alert
send_alert() {
    local severity="$1"
    local message="$2"
    local count="$3"
    
    echo -e "${RED}🚨 SECURITY ALERT [$severity]${NC}"
    echo "Time: $(date)"
    echo "Message: $message"
    echo "Count: $count events"
    echo "---"
    
    # In production, integrate with your alerting system
    # Example: curl -X POST "$SLACK_WEBHOOK" -d "{\"text\":\"Security Alert: $message\"}"
    # Example: echo "$message" | mail -s "Security Alert" "$ALERT_EMAIL"
}

# Function to analyze security events
analyze_security_events() {
    if [[ ! -f "$SECURITY_LOG" ]]; then
        log_message "Security log not found: $SECURITY_LOG"
        return 0
    fi
    
    local current_time=$(date +%s)
    local one_hour_ago=$((current_time - 3600))
    
    # Extract recent events (last hour)
    local recent_events=$(awk -v since="$(date -d @$one_hour_ago '+%Y-%m-%d %H:%M:%S')" '
        $1" "$2 >= since { print }
    ' "$SECURITY_LOG" 2>/dev/null || echo "")
    
    if [[ -z "$recent_events" ]]; then
        log_message "No recent security events found"
        return 0
    fi
    
    # Analyze different types of security events
    local suspicious_count=$(echo "$recent_events" | grep -c "SUSPICIOUS_ACTIVITY" || echo "0")
    local validation_failures=$(echo "$recent_events" | grep -c "VALIDATION_FAILURE" || echo "0")
    local rate_limit_hits=$(echo "$recent_events" | grep -c "RATE_LIMIT_EXCEEDED" || echo "0")
    local dangerous_patterns=$(echo "$recent_events" | grep -c "DANGEROUS_PATTERN_DETECTED" || echo "0")
    local unauthorized_access=$(echo "$recent_events" | grep -c "UNAUTHORIZED_ACCESS" || echo "0")
    
    # Check thresholds and send alerts
    if [[ $dangerous_patterns -gt 0 ]]; then
        send_alert "CRITICAL" "Dangerous PlantUML patterns detected" "$dangerous_patterns"
    fi
    
    if [[ $unauthorized_access -gt 0 ]]; then
        send_alert "HIGH" "Unauthorized access attempts detected" "$unauthorized_access"
    fi
    
    if [[ $suspicious_count -gt $ALERT_THRESHOLD ]]; then
        send_alert "HIGH" "High number of suspicious activities" "$suspicious_count"
    fi
    
    if [[ $validation_failures -gt $((ALERT_THRESHOLD * 2)) ]]; then
        send_alert "MEDIUM" "High number of validation failures" "$validation_failures"
    fi
    
    if [[ $rate_limit_hits -gt $((ALERT_THRESHOLD * 3)) ]]; then
        send_alert "LOW" "High number of rate limit hits" "$rate_limit_hits"
    fi
    
    # Generate summary
    echo -e "${GREEN}📊 Security Summary (Last Hour)${NC}"
    echo "Suspicious Activities: $suspicious_count"
    echo "Validation Failures: $validation_failures"
    echo "Rate Limit Hits: $rate_limit_hits"
    echo "Dangerous Patterns: $dangerous_patterns"
    echo "Unauthorized Access: $unauthorized_access"
    echo "---"
}

# Function to check service health with security focus
check_service_health() {
    local api_url="${API_URL:-http://localhost:9001}"
    local ui_url="${UI_URL:-http://localhost:9002}"
    
    echo -e "${GREEN}🔍 Security Health Check${NC}"
    
    # Check API service
    if curl -s --max-time 5 "$api_url/health" > /dev/null; then
        echo "✅ API Service: Healthy"
    else
        echo "❌ API Service: Unhealthy"
        send_alert "HIGH" "API Service is down" "1"
    fi
    
    # Check UI service
    if curl -s --max-time 5 "$ui_url/health" > /dev/null; then
        echo "✅ UI Service: Healthy"
    else
        echo "❌ UI Service: Unhealthy"
        send_alert "HIGH" "UI Service is down" "1"
    fi
    
    # Check for suspicious processes
    local suspicious_processes=$(ps aux | grep -E "(nc|netcat|nmap|sqlmap|nikto)" | grep -v grep || echo "")
    if [[ -n "$suspicious_processes" ]]; then
        send_alert "HIGH" "Suspicious processes detected" "$(echo "$suspicious_processes" | wc -l)"
    fi
    
    echo "---"
}

# Function to analyze failed requests
analyze_failed_requests() {
    local error_log="$LOG_DIR/error.log"
    
    if [[ ! -f "$error_log" ]]; then
        return 0
    fi
    
    # Find patterns in errors that might indicate attacks
    local current_time=$(date +%s)
    local one_hour_ago=$((current_time - 3600))
    
    local recent_errors=$(awk -v since="$(date -d @$one_hour_ago '+%Y-%m-%d %H:%M:%S')" '
        $1" "$2 >= since { print }
    ' "$error_log" 2>/dev/null || echo "")
    
    if [[ -n "$recent_errors" ]]; then
        local error_count=$(echo "$recent_errors" | wc -l)
        if [[ $error_count -gt $((ALERT_THRESHOLD * 5)) ]]; then
            send_alert "MEDIUM" "High error rate detected" "$error_count"
        fi
        
        # Look for specific attack patterns in errors
        local sqli_attempts=$(echo "$recent_errors" | grep -ci "sql\|union\|select\|insert\|update\|delete" || echo "0")
        local xss_attempts=$(echo "$recent_errors" | grep -ci "script\|javascript\|onload\|onerror" || echo "0")
        
        if [[ $sqli_attempts -gt 0 ]]; then
            send_alert "HIGH" "Potential SQL injection attempts in errors" "$sqli_attempts"
        fi
        
        if [[ $xss_attempts -gt 0 ]]; then
            send_alert "MEDIUM" "Potential XSS attempts in errors" "$xss_attempts"
        fi
    fi
}

# Function to check Docker security
check_docker_security() {
    echo -e "${GREEN}🐳 Docker Security Check${NC}"
    
    # Check if containers are running as root
    local root_containers=$(docker ps --format "table {{.Names}}\t{{.Command}}" | grep -E "(uml-|kroki-)" | xargs -I {} docker exec {} whoami 2>/dev/null | grep -c "root" || echo "0")
    
    if [[ $root_containers -gt 0 ]]; then
        send_alert "MEDIUM" "Containers running as root detected" "$root_containers"
    else
        echo "✅ Containers running as non-root users"
    fi
    
    # Check for privileged containers
    local privileged_containers=$(docker ps --filter "name=uml-" --filter "name=kroki-" --format "{{.Names}}" | xargs -I {} docker inspect {} | grep -c "\"Privileged\": true" || echo "0")
    
    if [[ $privileged_containers -gt 0 ]]; then
        send_alert "HIGH" "Privileged containers detected" "$privileged_containers"
    else
        echo "✅ No privileged containers"
    fi
    
    echo "---"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -c, --continuous    Run in continuous monitoring mode"
    echo "  -o, --once         Run once and exit (default)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  ALERT_EMAIL        Email address for alerts (default: admin@example.com)"
    echo "  API_URL           API service URL (default: http://localhost:9001)"
    echo "  UI_URL            UI service URL (default: http://localhost:9002)"
}

# Main monitoring function
run_monitoring() {
    log_message "Starting security monitoring"
    
    analyze_security_events
    check_service_health
    analyze_failed_requests
    check_docker_security
    
    log_message "Security monitoring completed"
}

# Main script logic
main() {
    local continuous=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--continuous)
                continuous=true
                shift
                ;;
            -o|--once)
                continuous=false
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
    
    if [[ "$continuous" == true ]]; then
        echo -e "${YELLOW}🔄 Starting continuous security monitoring...${NC}"
        while true; do
            run_monitoring
            echo "Sleeping for 5 minutes..."
            sleep 300  # 5 minutes
        done
    else
        run_monitoring
    fi
}

# Handle signals for graceful shutdown
trap 'echo -e "\n${YELLOW}Shutting down security monitor...${NC}"; exit 0' SIGINT SIGTERM

# Run main function with all arguments
main "$@"