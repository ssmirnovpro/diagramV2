#!/bin/bash

# Development Setup Script for UML Images Service
# Подготавливает среду разработки

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 UML Images Service - Development Setup${NC}"
echo "=========================================="

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
else
    echo -e "${GREEN}✅ Docker is installed${NC}"
fi

# Check Docker Compose
if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  docker-compose not found, checking for 'docker compose'${NC}"
    if ! docker compose version >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker Compose is not available${NC}"
        echo "Please install Docker Compose"
        exit 1
    else
        echo -e "${GREEN}✅ Docker Compose (v2) is available${NC}"
        COMPOSE_CMD="docker compose"
    fi
else
    echo -e "${GREEN}✅ Docker Compose is installed${NC}"
    COMPOSE_CMD="docker-compose"
fi

# Check Node.js (for local development)
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js is installed ($NODE_VERSION)${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js not found (only needed for local development)${NC}"
fi

echo

# Setup environment
echo -e "${BLUE}⚙️  Setting up environment...${NC}"

# Copy .env file if it doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file from .env.example${NC}"
    else
        echo -e "${YELLOW}⚠️  .env.example not found${NC}"
    fi
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

echo

# Install dependencies (if package.json exists in subdirectories)
echo -e "${BLUE}📦 Installing dependencies...${NC}"

if [ -d "api-service" ] && [ -f "api-service/package.json" ]; then
    echo "Installing API Service dependencies..."
    (cd api-service && npm install)
    echo -e "${GREEN}✅ API Service dependencies installed${NC}"
fi

if [ -d "ui-service" ] && [ -f "ui-service/package.json" ]; then
    echo "Installing UI Service dependencies..."
    (cd ui-service && npm install)
    echo -e "${GREEN}✅ UI Service dependencies installed${NC}"
fi

echo

# Build and start services
echo -e "${BLUE}🔨 Building and starting services...${NC}"

echo "This may take a few minutes on the first run..."
$COMPOSE_CMD up --build -d

echo -e "${GREEN}✅ Services are starting up...${NC}"
echo

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Check health
echo -e "${BLUE}🏥 Checking service health...${NC}"
./scripts/health-check.sh

echo
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo
echo -e "${BLUE}📝 Quick commands:${NC}"
echo "  • View logs:        $COMPOSE_CMD logs -f"
echo "  • Stop services:    $COMPOSE_CMD down"
echo "  • Restart:          $COMPOSE_CMD restart"
echo "  • Health check:     ./scripts/health-check.sh"
echo
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo "  • UI Service:       http://localhost:9002"
echo "  • API Service:      http://localhost:9001"
echo "  • Kroki Service:    http://localhost:8001"
echo
echo -e "${BLUE}📚 Next steps:${NC}"
echo "  1. Open http://localhost:9002 in your browser"
echo "  2. Try the example PlantUML code"
echo "  3. Generate your first diagram!"