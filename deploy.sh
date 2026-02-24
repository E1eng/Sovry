#!/bin/bash

# Sovry VPS Deployment Script
# Run this on your VPS after initial setup

set -e  # Exit on error

echo "🚀 Deploying Sovry..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to project directory
cd /var/www/Sovry

# Pull latest code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Build frontend
echo -e "${YELLOW}🔨 Building frontend...${NC}"
cd frontend
npm run build

# Restart services
echo -e "${YELLOW}🔄 Restarting services...${NC}"
cd ..
pm2 restart all

# Show status
echo -e "${GREEN}✅ Deployment complete!${NC}"
pm2 status

# Show logs
echo -e "${YELLOW}📋 Recent logs:${NC}"
pm2 logs --lines 20 --nostream

echo -e "${GREEN}🎉 Sovry is now running!${NC}"
echo -e "Frontend: https://sovry.xyz"
echo -e "Backend: https://api.sovry.xyz/health"
