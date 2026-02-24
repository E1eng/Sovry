# 🚀 Sovry Deployment Guide

This guide covers deploying Sovry to production with domain **sovry.xyz**.

## 📦 Architecture

- **Frontend**: Next.js app deployed on Vercel
- **Backend**: Node.js API + Worker deployed on Render.com (free tier)
- **Database**: Supabase (already configured)
- **Subgraph**: Goldsky (already deployed)
- **Domain**: sovry.xyz

---

## 🎯 Frontend Deployment (Vercel)

### 1. Prerequisites
- GitHub repository with your code
- Vercel account (sign up at https://vercel.com)
- Domain sovry.xyz configured in your DNS provider

### 2. Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

4. Add Environment Variables (copy from `.env` or `.env.example`):
   ```
   NEXT_PUBLIC_STORY_RPC_URLS=https://mainnet.storyrpc.io,https://rpc.ankr.com/story_mainnet
   NEXT_PUBLIC_SUBGRAPH_URL=<your_goldsky_url>
   NEXT_PUBLIC_LAUNCHPAD_ADDRESS=<your_launchpad_address>
   NEXT_PUBLIC_EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
   NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
   NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=<your_dynamic_env_id>
   NEXT_PUBLIC_PINATA_JWT=<your_pinata_jwt>
   NEXT_PUBLIC_PINATA_GATEWAY=<your_pinata_gateway>
   ```

5. Click **Deploy**

#### Option B: Via Vercel CLI
```bash
npm i -g vercel
cd frontend
vercel --prod
```

### 3. Configure Custom Domain (sovry.xyz)

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add domain: `sovry.xyz`
3. Add domain: `www.sovry.xyz`
4. Vercel will provide DNS records (A/CNAME)
5. Add these records to your DNS provider:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```
6. Wait for DNS propagation (5-30 minutes)

---

## 🔧 Backend Deployment (Render.com)

### 1. Prerequisites
- Render account (sign up at https://render.com)
- GitHub repository

### 2. Deploy to Render

1. Go to https://dashboard.render.com/
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `sovry-backend`
   - **Region**: Singapore (closest to your users)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

5. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=10000
   FRONTEND_URLS=https://sovry.xyz,https://www.sovry.xyz
   RPC_PROVIDER_URL=https://mainnet.storyrpc.io
   SUBGRAPH_URL=<your_goldsky_url>
   SUPABASE_URL=<your_supabase_url>
   SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
   EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
   LAUNCHPAD_ADDRESS=<your_launchpad_address>
   IP_PRICE_FALLBACK_USD=0.50
   PRICE_INTERVAL_MS=60000
   PUSH_INTERVAL_MS=3600000
   HARVEST_INTERVAL_MS=14400000
   GRADUATION_INTERVAL_MS=60000
   ```

6. Click **Create Web Service**
7. Render will provide a URL like: `https://sovry-backend.onrender.com`

### 3. Note on Free Tier Limitations
- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- For production, consider upgrading to Starter ($7/month) for always-on

---

## 🔗 Connect Frontend to Backend

**Important**: Currently, your frontend uses Next.js API routes (`/api/*`) which run on Vercel.
The backend worker is separate and handles background jobs (royalty harvesting, price updates, etc.).

**No changes needed** - your architecture is already optimized:
- Frontend API routes → Run on Vercel Edge (fast, global)
- Backend worker → Runs on Render (background jobs)

---

## ✅ Post-Deployment Checklist

### Frontend (Vercel)
- [ ] Build succeeds without errors
- [ ] Environment variables are set
- [ ] Custom domain (sovry.xyz) is connected
- [ ] SSL certificate is active (automatic via Vercel)
- [ ] Test homepage loads: https://sovry.xyz
- [ ] Test wallet connection works
- [ ] Test token creation works
- [ ] Test trading works
- [ ] Check live trade notifications appear

### Backend (Render)
- [ ] Service is running (check logs)
- [ ] Health endpoint works: `https://sovry-backend.onrender.com/health`
- [ ] Worker is running (check logs for "Worker started")
- [ ] CORS allows requests from sovry.xyz
- [ ] Royalty harvesting runs (check Supabase `royalty_state` table)
- [ ] IP price updates (check logs every 60s)

### Database (Supabase)
- [ ] RLS policies are enabled for production
- [ ] Service role key is kept secret (only in backend env)
- [ ] Anon key is used in frontend (public)
- [ ] Check tables: `tokens`, `royalty_state`, `royalty_harvest_log`

### Subgraph (Goldsky)
- [ ] Subgraph is synced to latest block
- [ ] Query works: test in GraphQL playground
- [ ] Frontend can fetch data via `/api/subgraph`

---

## 🐛 Troubleshooting

### Build Fails on Vercel
```bash
# Check build locally first
cd frontend
npm run build
```
- Fix any TypeScript errors
- Ensure all env vars are set in Vercel dashboard

### Backend Not Responding
- Check Render logs for errors
- Verify PORT is set to 10000 (Render default)
- Check CORS settings allow sovry.xyz

### Trades Not Showing
- Check subgraph is synced
- Verify NEXT_PUBLIC_SUBGRAPH_URL is correct
- Check browser console for errors

### Wallet Connection Fails
- Verify NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is correct
- Check Dynamic dashboard for allowed domains (add sovry.xyz)

---

## 🔄 Continuous Deployment

Both Vercel and Render support auto-deploy from Git:
- Push to `main` branch → Auto-deploy to production
- Push to `dev` branch → Deploy to preview (Vercel) or staging (Render)

---

## 💰 Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | **Free** (100GB bandwidth) |
| Render | Free | **Free** (750 hours/month) |
| Supabase | Free | **Free** (500MB database, 2GB bandwidth) |
| Goldsky | Free | **Free** (subgraph indexing) |
| **Total** | | **$0/month** 🎉 |

### When to Upgrade?
- **Vercel Pro ($20/mo)**: If you exceed 100GB bandwidth or need team features
- **Render Starter ($7/mo)**: If you need always-on backend (no spin-down)
- **Supabase Pro ($25/mo)**: If you exceed 500MB database or need more bandwidth

---

## 📝 Environment Variables Reference

### Frontend (Vercel)
All variables must start with `NEXT_PUBLIC_` to be accessible in browser.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_STORY_RPC_URLS` | ✅ | Comma-separated RPC endpoints |
| `NEXT_PUBLIC_SUBGRAPH_URL` | ✅ | Goldsky subgraph URL |
| `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` | ✅ | Launchpad contract address |
| `NEXT_PUBLIC_EXCHANGE_ADDRESS` | ✅ | Exchange contract address |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (public) |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | ✅ | Dynamic wallet environment ID |
| `NEXT_PUBLIC_PINATA_JWT` | ✅ | Pinata JWT for IPFS uploads |
| `NEXT_PUBLIC_PINATA_GATEWAY` | ✅ | Pinata gateway URL |

### Backend (Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | Set to `production` |
| `PORT` | ✅ | Set to `10000` (Render default) |
| `FRONTEND_URLS` | ✅ | Comma-separated allowed origins for CORS |
| `RPC_PROVIDER_URL` | ✅ | Story Protocol RPC |
| `SUBGRAPH_URL` | ✅ | Goldsky subgraph URL |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (secret!) |
| `EXCHANGE_ADDRESS` | ✅ | Exchange contract address |
| `LAUNCHPAD_ADDRESS` | ✅ | Launchpad contract address |

---

## 🎉 You're Done!

Your Sovry platform is now live at **https://sovry.xyz** 🚀

Need help? Check the logs:
- **Vercel**: Dashboard → Your Project → Deployments → View Function Logs
- **Render**: Dashboard → sovry-backend → Logs
- **Supabase**: Dashboard → Logs
