# 🖥️ VPS Deployment Guide - Sovry

Deploy Sovry to your own VPS with full control and no limitations.

---

## 📋 VPS Requirements

**Minimum Specs:**
- **CPU:** 1 vCPU (2 vCPU recommended)
- **RAM:** 2GB (4GB recommended)
- **Storage:** 20GB SSD
- **OS:** Ubuntu 22.04 LTS (recommended)
- **Network:** Public IP address

**Recommended VPS Providers:**
- DigitalOcean ($6/mo - 1GB RAM)
- Vultr ($6/mo - 1GB RAM)
- Linode ($5/mo - 1GB RAM)
- Contabo ($4/mo - 4GB RAM, best value)

---

## 🚀 Quick Deploy (Copy-Paste Commands)

### Step 1: Connect to VPS
```bash
ssh root@your_vps_ip
```

### Step 2: Install Dependencies
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install Nginx (reverse proxy)
apt install -y nginx

# Install Certbot (SSL)
apt install -y certbot python3-certbot-nginx

# Install Git
apt install -y git
```

### Step 3: Clone Repository
```bash
# Create app directory
mkdir -p /var/www
cd /var/www

# Clone your repo
git clone https://github.com/E1eng/Sovry.git
cd Sovry

# Install dependencies
npm install
```

### Step 4: Configure Environment Variables

#### Frontend
```bash
nano frontend/.env.production
```

Paste this (replace with your values):
```bash
NEXT_PUBLIC_STORY_RPC_URLS=https://mainnet.storyrpc.io,https://rpc.ankr.com/story_mainnet
NEXT_PUBLIC_SUBGRAPH_URL=your_goldsky_subgraph_url
NEXT_PUBLIC_LAUNCHPAD_ADDRESS=your_launchpad_address
NEXT_PUBLIC_EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=your_dynamic_env_id
NEXT_PUBLIC_PINATA_JWT=your_pinata_jwt
NEXT_PUBLIC_PINATA_GATEWAY=your_pinata_gateway
```

Save: `Ctrl+X`, `Y`, `Enter`

#### Backend
```bash
nano backend/.env
```

Paste this:
```bash
NODE_ENV=production
PORT=3001

FRONTEND_URLS=https://sovry.xyz,https://www.sovry.xyz

RPC_PROVIDER_URL=https://mainnet.storyrpc.io
SUBGRAPH_URL=your_goldsky_subgraph_url

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
LAUNCHPAD_ADDRESS=your_launchpad_address

IP_PRICE_FALLBACK_USD=0.50
PRICE_INTERVAL_MS=60000
PUSH_INTERVAL_MS=3600000
HARVEST_INTERVAL_MS=14400000
GRADUATION_INTERVAL_MS=60000
```

Save: `Ctrl+X`, `Y`, `Enter`

### Step 5: Build Frontend
```bash
cd /var/www/Sovry/frontend
npm run build
```

### Step 6: Start Services with PM2
```bash
# Start backend
cd /var/www/Sovry/backend
pm2 start npm --name "sovry-backend" -- start

# Start frontend
cd /var/www/Sovry/frontend
pm2 start npm --name "sovry-frontend" -- start

# Save PM2 config
pm2 save

# Auto-start on reboot
pm2 startup
# Copy-paste the command it outputs and run it
```

### Step 7: Configure Nginx

```bash
nano /etc/nginx/sites-available/sovry.xyz
```

Paste this:
```nginx
# Backend API
server {
    listen 80;
    server_name api.sovry.xyz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend
server {
    listen 80;
    server_name sovry.xyz www.sovry.xyz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save and enable:
```bash
# Enable site
ln -s /etc/nginx/sites-available/sovry.xyz /etc/nginx/sites-enabled/

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx
```

### Step 8: Configure DNS

In your DNS provider (Cloudflare, Namecheap, etc.), add:

```
Type: A
Name: @
Value: YOUR_VPS_IP
TTL: Auto

Type: A
Name: www
Value: YOUR_VPS_IP
TTL: Auto

Type: A
Name: api
Value: YOUR_VPS_IP
TTL: Auto
```

Wait 5-30 minutes for DNS propagation.

### Step 9: Setup SSL (HTTPS)

```bash
# Get SSL certificates
certbot --nginx -d sovry.xyz -d www.sovry.xyz -d api.sovry.xyz

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (option 2)

# Auto-renew (already configured by certbot)
certbot renew --dry-run
```

---

## ✅ Verify Deployment

### Check Services
```bash
# Check PM2 status
pm2 status

# Should show:
# sovry-frontend | online
# sovry-backend  | online

# View logs
pm2 logs sovry-frontend --lines 50
pm2 logs sovry-backend --lines 50
```

### Test Endpoints
```bash
# Frontend
curl https://sovry.xyz

# Backend health
curl https://api.sovry.xyz/health
```

### Browser Test
1. Open https://sovry.xyz
2. Connect wallet
3. Test trading
4. Check live notifications

---

## 🔄 Update/Redeploy

When you push new code:

```bash
# SSH to VPS
ssh root@your_vps_ip

# Pull latest code
cd /var/www/Sovry
git pull origin main

# Update dependencies
npm install

# Rebuild frontend
cd frontend
npm run build

# Restart services
pm2 restart all

# Check status
pm2 status
```

---

## 📊 Monitoring

### View Logs
```bash
# Real-time logs
pm2 logs

# Specific service
pm2 logs sovry-backend

# Last 100 lines
pm2 logs --lines 100
```

### Resource Usage
```bash
# PM2 monitoring
pm2 monit

# System resources
htop
```

### Setup Monitoring Dashboard (Optional)
```bash
# Install PM2 web dashboard
pm2 install pm2-server-monit

# Access at: http://your_vps_ip:9615
```

---

## 🔒 Security Hardening

### Firewall
```bash
# Install UFW
apt install -y ufw

# Allow SSH, HTTP, HTTPS
ufw allow 22
ufw allow 80
ufw allow 443

# Enable firewall
ufw enable
```

### Fail2Ban (Prevent brute force)
```bash
# Install
apt install -y fail2ban

# Start service
systemctl start fail2ban
systemctl enable fail2ban
```

### Auto-Updates
```bash
# Install unattended-upgrades
apt install -y unattended-upgrades

# Enable
dpkg-reconfigure -plow unattended-upgrades
```

---

## 🐛 Troubleshooting

### Frontend Not Loading
```bash
# Check if running
pm2 status

# Check logs
pm2 logs sovry-frontend

# Restart
pm2 restart sovry-frontend
```

### Backend Not Responding
```bash
# Check logs
pm2 logs sovry-backend

# Check if port 3001 is listening
netstat -tulpn | grep 3001

# Restart
pm2 restart sovry-backend
```

### SSL Certificate Issues
```bash
# Renew manually
certbot renew

# Check expiry
certbot certificates
```

### Out of Memory
```bash
# Check memory
free -h

# Restart services
pm2 restart all

# Consider upgrading VPS RAM
```

---

## 💰 Cost Breakdown

**VPS (Contabo - Best Value):**
- 4GB RAM, 2 vCPU, 50GB SSD: **$4.50/month**

**Domain (if not owned):**
- sovry.xyz: ~$10/year

**Total: ~$5-6/month** for full control! 🎉

---

## 🎯 Advantages of VPS

✅ **Full control** (no platform limits)
✅ **No execution timeouts** (worker runs 24/7)
✅ **Better performance** (dedicated resources)
✅ **Cheaper long-term** ($4-6/mo vs $20/mo Vercel Pro)
✅ **Can host multiple projects** on same VPS
✅ **Root access** for custom configs

---

## 🚀 Auto-Deploy with GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/Sovry
            git pull origin main
            npm install
            cd frontend && npm run build
            pm2 restart all
```

Add secrets in GitHub:
- `VPS_HOST`: Your VPS IP
- `VPS_SSH_KEY`: Your SSH private key

---

## 📝 Maintenance Checklist

**Weekly:**
- [ ] Check PM2 logs for errors
- [ ] Monitor disk space: `df -h`
- [ ] Check memory usage: `free -h`

**Monthly:**
- [ ] Update system: `apt update && apt upgrade`
- [ ] Check SSL expiry: `certbot certificates`
- [ ] Review PM2 logs for patterns

**Quarterly:**
- [ ] Backup database (Supabase auto-backup)
- [ ] Review and optimize worker intervals
- [ ] Check for security updates

---

## 🎉 Done!

Your Sovry platform is now running on your VPS:
- **Frontend:** https://sovry.xyz
- **Backend:** https://api.sovry.xyz
- **Full control, no limits!** 🚀

Need help? Check logs with `pm2 logs` or restart with `pm2 restart all`.
