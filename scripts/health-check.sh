#!/bin/bash

# Health Check Script for UML Images Service
# Проверяет состояние всех сервисов

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 UML Images Service - Health Check${NC}"
echo "======================================"

# Function to check service health
check_service() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $name... "
    
    if response=$(curl -s -w "%{http_code}" "$url" -o /dev/null --connect-timeout 5 --max-time 10); then
        if [ "$response" = "$expected_status" ]; then
            echo -e "${GREEN}✅ Healthy${NC}"
            return 0
        else
            echo -e "${RED}❌ Unhealthy (HTTP $response)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Unreachable${NC}"
        return 1
    fi
}

# Function to check detailed API status
check_api_status() {
    echo -n "Checking API Service detailed status... "
    
    if response=$(curl -s "http://localhost:9001/api/v1/status" 2>/dev/null); then
        echo -e "${GREEN}✅ Available${NC}"
        echo "API Status Details:"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        echo
        return 0
    else
        echo -e "${RED}❌ API Status endpoint unavailable${NC}"
        return 1
    fi
}

# Function to test diagram generation
test_generation() {
    echo -n "Testing diagram generation... "
    
    local test_uml='@startuml\nAlice -> Bob: Hello\n@enduml'
    
    if curl -s -X POST "http://localhost:9001/api/v1/generate" \
        -H "Content-Type: application/json" \
        -d "{\"uml\":\"$test_uml\"}" \
        -o /tmp/test_diagram.png \
        --connect-timeout 10 \
        --max-time 30 > /dev/null 2>&1; then
        
        if [ -f "/tmp/test_diagram.png" ] && [ -s "/tmp/test_diagram.png" ]; then
            echo -e "${GREEN}✅ Working${NC}"
            echo "Test diagram saved to: /tmp/test_diagram.png"
            return 0
        else
            echo -e "${RED}❌ Failed (empty response)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Failed${NC}"
        return 1
    fi
}

# Check if Docker containers are running
echo -e "${BLUE}📦 Docker Containers Status:${NC}"
if command -v docker >/dev/null 2>&1; then
    docker ps --filter "name=uml-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo -e "${YELLOW}⚠️  Docker not available${NC}"
fi
echo

# Check services
echo -e "${BLUE}🏥 Service Health Checks:${NC}"

health_checks=0
total_checks=0

# Kroki Service
((total_checks++))
if check_service "Kroki Service" "http://localhost:8001/health"; then
    ((health_checks++))
fi

# API Service
((total_checks++))
if check_service "API Service" "http://localhost:9001/health"; then
    ((health_checks++))
fi

# UI Service
((total_checks++))
if check_service "UI Service" "http://localhost:9002/health"; then
    ((health_checks++))
fi

echo

# Detailed API status
if check_api_status; then
    echo
fi

# Test generation functionality
if test_generation; then
    echo
fi

# Summary
echo -e "${BLUE}📊 Summary:${NC}"
echo "======================================"

if [ $health_checks -eq $total_checks ]; then
    echo -e "${GREEN}✅ All services are healthy ($health_checks/$total_checks)${NC}"
    echo
    echo -e "${GREEN}🌐 Access URLs:${NC}"
    echo "  • UI Service:    http://localhost:9002"
    echo "  • API Service:   http://localhost:9001"
    echo "  • Kroki Service: http://localhost:8001"
    exit 0
else
    echo -e "${RED}❌ Some services are unhealthy ($health_checks/$total_checks)${NC}"
    echo
    echo -e "${YELLOW}💡 Troubleshooting:${NC}"
    echo "  • Check if services are running: docker-compose ps"
    echo "  • View logs: docker-compose logs -f"
    echo "  • Restart services: docker-compose restart"
    exit 1
fi