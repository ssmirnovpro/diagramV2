#!/bin/bash

# Security Testing Script for UML Images Service
# Tests various security vulnerabilities and configurations

set -euo pipefail

# Configuration
API_URL="${API_URL:-http://localhost:9001}"
UI_URL="${UI_URL:-http://localhost:9002}"
TEMP_DIR="/tmp/uml-security-test"
TEST_RESULTS="$TEMP_DIR/test-results.txt"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Ensure temp directory exists
mkdir -p "$TEMP_DIR"

# Function to log test results
log_test() {
    local status="$1"
    local test_name="$2"
    local details="$3"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    if [[ "$status" == "PASS" ]]; then
        echo -e "${GREEN}✅ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $test_name"
        echo -e "   ${YELLOW}Details${NC}: $details"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    
    echo "[$status] $test_name: $details" >> "$TEST_RESULTS"
}

# Function to test security headers
test_security_headers() {
    echo -e "${BLUE}🔍 Testing Security Headers${NC}"
    
    local response
    response=$(curl -s -I "$API_URL/health" 2>/dev/null || echo "")
    
    # Test for security headers
    if echo "$response" | grep -q "X-Content-Type-Options: nosniff"; then
        log_test "PASS" "X-Content-Type-Options header" "nosniff present"
    else
        log_test "FAIL" "X-Content-Type-Options header" "Missing or incorrect"
    fi
    
    if echo "$response" | grep -q "X-Frame-Options: "; then
        log_test "PASS" "X-Frame-Options header" "Present"
    else
        log_test "FAIL" "X-Frame-Options header" "Missing"
    fi
    
    if echo "$response" | grep -q "Strict-Transport-Security: "; then
        log_test "PASS" "HSTS header" "Present"
    else
        log_test "FAIL" "HSTS header" "Missing"
    fi
    
    # Test UI service headers
    local ui_response
    ui_response=$(curl -s -I "$UI_URL/health" 2>/dev/null || echo "")
    
    if echo "$ui_response" | grep -q "Content-Security-Policy: "; then
        log_test "PASS" "CSP header on UI" "Present"
    else
        log_test "FAIL" "CSP header on UI" "Missing"
    fi
}

# Function to test rate limiting
test_rate_limiting() {
    echo -e "${BLUE}🔍 Testing Rate Limiting${NC}"
    
    local success_count=0
    local rate_limited=false
    
    # Send multiple requests quickly
    for i in {1..15}; do
        local response_code
        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/health" 2>/dev/null || echo "000")
        
        if [[ "$response_code" == "200" ]]; then
            success_count=$((success_count + 1))
        elif [[ "$response_code" == "429" ]]; then
            rate_limited=true
            break
        fi
        
        sleep 0.1
    done
    
    if [[ "$rate_limited" == true ]] || [[ $success_count -lt 15 ]]; then
        log_test "PASS" "Rate limiting active" "Requests limited after $success_count attempts"
    else
        log_test "FAIL" "Rate limiting" "No rate limiting detected"
    fi
}

# Function to test input validation
test_input_validation() {
    echo -e "${BLUE}🔍 Testing Input Validation${NC}"
    
    # Test malicious PlantUML patterns
    local dangerous_patterns=(
        '!include /etc/passwd'
        '!includeurl file:///etc/passwd'
        '!define DANGEROUS ${java.lang.Runtime.getRuntime().exec("id")}'
        '<script>alert("xss")</script>'
        'javascript:alert("xss")'
        '!include ../../../etc/passwd'
    )
    
    for pattern in "${dangerous_patterns[@]}"; do
        local response_code
        local json_payload="{\"uml\":\"$pattern\"}"
        
        response_code=$(curl -s -w "%{http_code}" -o /dev/null \
            -X POST \
            -H "Content-Type: application/json" \
            -d "$json_payload" \
            "$API_URL/api/v1/generate" 2>/dev/null || echo "000")
        
        if [[ "$response_code" == "400" ]]; then
            log_test "PASS" "Dangerous pattern blocked" "Pattern: ${pattern:0:30}..."
        else
            log_test "FAIL" "Dangerous pattern allowed" "Pattern: ${pattern:0:30}... (HTTP $response_code)"
        fi
    done
    
    # Test oversized payload
    local large_payload
    large_payload=$(printf 'A%.0s' {1..60000})  # 60KB payload
    local large_json="{\"uml\":\"$large_payload\"}"
    
    local large_response_code
    large_response_code=$(curl -s -w "%{http_code}" -o /dev/null \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$large_json" \
        "$API_URL/api/v1/generate" 2>/dev/null || echo "000")
    
    if [[ "$large_response_code" == "400" ]]; then
        log_test "PASS" "Large payload rejection" "Oversized request blocked"
    else
        log_test "FAIL" "Large payload acceptance" "Oversized request allowed (HTTP $large_response_code)"
    fi
}

# Function to test CORS configuration
test_cors() {
    echo -e "${BLUE}🔍 Testing CORS Configuration${NC}"
    
    # Test with malicious origin
    local cors_response
    cors_response=$(curl -s -H "Origin: http://malicious-site.com" "$API_URL/health" 2>/dev/null || echo "")
    
    local cors_header
    cors_header=$(curl -s -I -H "Origin: http://malicious-site.com" "$API_URL/health" | grep -i "access-control-allow-origin" || echo "")
    
    if [[ -z "$cors_header" ]] || [[ "$cors_header" != *"malicious-site.com"* ]]; then
        log_test "PASS" "CORS restriction" "Malicious origin blocked"
    else
        log_test "FAIL" "CORS misconfiguration" "Malicious origin allowed"
    fi
    
    # Test preflight request
    local preflight_response
    preflight_response=$(curl -s -w "%{http_code}" -o /dev/null \
        -X OPTIONS \
        -H "Origin: http://localhost:9002" \
        -H "Access-Control-Request-Method: POST" \
        "$API_URL/api/v1/generate" 2>/dev/null || echo "000")
    
    if [[ "$preflight_response" == "200" ]] || [[ "$preflight_response" == "204" ]]; then
        log_test "PASS" "CORS preflight" "Preflight request handled"
    else
        log_test "FAIL" "CORS preflight" "Preflight request failed (HTTP $preflight_response)"
    fi
}

# Function to test information disclosure
test_information_disclosure() {
    echo -e "${BLUE}🔍 Testing Information Disclosure${NC}"
    
    # Test health endpoint for sensitive information
    local health_response
    health_response=$(curl -s "$API_URL/health" 2>/dev/null || echo "")
    
    if echo "$health_response" | grep -q '"port":'; then
        log_test "FAIL" "Port disclosure" "Health endpoint reveals port information"
    else
        log_test "PASS" "Port information hidden" "No port information disclosed"
    fi
    
    if echo "$health_response" | grep -q '"kroki_url":'; then
        log_test "FAIL" "Internal URL disclosure" "Health endpoint reveals internal URLs"
    else
        log_test "PASS" "Internal URLs hidden" "No internal URLs disclosed"
    fi
    
    # Test error responses for stack traces
    local error_response
    error_response=$(curl -s -X POST -H "Content-Type: application/json" -d '{"invalid": "data"}' "$API_URL/api/v1/generate" 2>/dev/null || echo "")
    
    if echo "$error_response" | grep -q '"stack":'; then
        log_test "FAIL" "Stack trace disclosure" "Error responses contain stack traces"
    else
        log_test "PASS" "Stack traces hidden" "No stack traces in error responses"
    fi
}

# Function to test container security
test_container_security() {
    echo -e "${BLUE}🔍 Testing Container Security${NC}"
    
    # Check if containers are running as non-root
    local api_user
    api_user=$(docker exec uml-api-service whoami 2>/dev/null || echo "unknown")
    
    if [[ "$api_user" != "root" ]]; then
        log_test "PASS" "API container non-root" "Running as user: $api_user"
    else
        log_test "FAIL" "API container root" "Running as root user"
    fi
    
    local ui_user
    ui_user=$(docker exec uml-ui-service whoami 2>/dev/null || echo "unknown")
    
    if [[ "$ui_user" != "root" ]]; then
        log_test "PASS" "UI container non-root" "Running as user: $ui_user"
    else
        log_test "FAIL" "UI container root" "Running as root user"
    fi
    
    # Check Kroki configuration
    local kroki_config
    kroki_config=$(docker exec uml-kroki-service env | grep KROKI_SAFE_MODE 2>/dev/null || echo "")
    
    if echo "$kroki_config" | grep -q "secure"; then
        log_test "PASS" "Kroki safe mode" "Running in secure mode"
    else
        log_test "FAIL" "Kroki unsafe mode" "Not running in secure mode"
    fi
}

# Function to test SSL/TLS (if applicable)
test_ssl_configuration() {
    echo -e "${BLUE}🔍 Testing SSL/TLS Configuration${NC}"
    
    # Check if HTTPS is enforced
    local https_test
    if [[ "$API_URL" == https://* ]]; then
        https_test=$(curl -s -k -I "$API_URL/health" | grep -i "strict-transport-security" || echo "")
        
        if [[ -n "$https_test" ]]; then
            log_test "PASS" "HSTS enforcement" "HTTPS properly configured"
        else
            log_test "FAIL" "Missing HSTS" "HTTPS configured but HSTS missing"
        fi
    else
        log_test "INFO" "HTTP in development" "Testing against HTTP endpoint"
    fi
}

# Function to test authentication bypass (if applicable)
test_authentication() {
    echo -e "${BLUE}🔍 Testing Authentication Bypass${NC}"
    
    # Test direct access to protected endpoints
    local protected_response
    protected_response=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/api/v1/generate" 2>/dev/null || echo "000")
    
    if [[ "$protected_response" == "405" ]]; then
        log_test "PASS" "Method restriction" "GET method properly restricted"
    else
        log_test "INFO" "Method handling" "GET returns HTTP $protected_response"
    fi
}

# Function to generate security report
generate_report() {
    echo -e "${BLUE}📊 Security Test Report${NC}"
    echo "=================================="
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    
    local success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    echo "Success Rate: $success_rate%"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}🎉 All security tests passed!${NC}"
    elif [[ $success_rate -ge 80 ]]; then
        echo -e "${YELLOW}⚠️  Some security issues found. Review failed tests.${NC}"
    else
        echo -e "${RED}🚨 Critical security issues detected! Immediate action required.${NC}"
    fi
    
    echo ""
    echo "Detailed results saved to: $TEST_RESULTS"
    echo "Review logs in: api-service/logs/"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -a, --api-url URL      API service URL (default: http://localhost:9001)"
    echo "  -u, --ui-url URL       UI service URL (default: http://localhost:9002)"
    echo "  -v, --verbose          Verbose output"
    echo "  -h, --help             Show this help message"
}

# Main function
main() {
    local verbose=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--api-url)
                API_URL="$2"
                shift 2
                ;;
            -u|--ui-url)
                UI_URL="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
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
    
    echo -e "${BLUE}🛡️  UML Images Service Security Testing${NC}"
    echo "API URL: $API_URL"
    echo "UI URL: $UI_URL"
    echo "Test Results: $TEST_RESULTS"
    echo ""
    
    # Clear previous results
    > "$TEST_RESULTS"
    
    # Run all security tests
    test_security_headers
    test_rate_limiting
    test_input_validation
    test_cors
    test_information_disclosure
    test_container_security
    test_ssl_configuration
    test_authentication
    
    # Generate final report
    echo ""
    generate_report
    
    # Exit with error code if tests failed
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
}

# Run main function with all arguments
main "$@"