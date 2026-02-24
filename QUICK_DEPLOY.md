# ⚡ Quick Deploy Guide - Sovry

Deploy Sovry to production in **5 minutes**.

## 🎯 Prerequisites

- [ ] GitHub account
- [ ] Vercel account (https://vercel.com)
- [ ] Render account (https://render.com)
- [ ] Domain sovry.xyz DNS access
- [ ] All environment variables ready

---

## 📦 Step 1: Push to GitHub

```bash
git add .
git commit -m "Ready for production deployment"
git push origin main
```

---

## 🚀 Step 2: Deploy Frontend to Vercel

### Via Vercel Dashboard (5 clicks)

1. **Import Project**
   - Go to https://vercel.com/new
   - Click "Import Git Repository"
   - Select your Sovry repo

2. **Configure Build**
   - Framework: **Next.js** (auto-detected)
   - Root Directory: **Leave empty** (monorepo detected automatically)
   - Build Command: `npm run build --workspace frontend`
   - Output Directory: `frontend/.next`
   - Install Command: `npm install`

3. **Add Environment Variables**
   Copy-paste these (replace with your actual values):
   ```
   NEXT_PUBLIC_STORY_RPC_URLS=https://mainnet.storyrpc.io,https://rpc.ankr.com/story_mainnet
   NEXT_PUBLIC_SUBGRAPH_URL=<YOUR_GOLDSKY_URL>
   NEXT_PUBLIC_LAUNCHPAD_ADDRESS=<YOUR_LAUNCHPAD_ADDRESS>
   NEXT_PUBLIC_EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
   NEXT_PUBLIC_SUPABASE_URL=<YOUR_SUPABASE_URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<YOUR_SUPABASE_ANON_KEY>
   NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=<YOUR_DYNAMIC_ENV_ID>
   NEXT_PUBLIC_PINATA_JWT=<YOUR_PINATA_JWT>
   NEXT_PUBLIC_PINATA_GATEWAY=<YOUR_PINATA_GATEWAY>
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - You'll get a URL like: `https://sovry-xxx.vercel.app`

5. **Add Custom Domain**
   - Go to Project Settings → Domains
   - Add `sovry.xyz` and `www.sovry.xyz`
   - Copy the DNS records Vercel provides
   - Add to your DNS provider:
     ```
     Type: A
     Name: @
     Value: 76.76.21.21

     Type: CNAME  
     Name: www
     Value: cname.vercel-dns.com
     ```
   - Wait 5-30 minutes for DNS propagation

---

## 🔧 Step 3: Deploy Backend to Render

### Via Render Dashboard (4 clicks)

1. **Create Web Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect GitHub → Select Sovry repo

2. **Configure Service**
   ```
   Name: sovry-backend
   Region: Singapore
   Branch: main
   Root Directory: backend
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Instance Type: Free
   ```

3. **Add Environment Variables**
   Click "Advanced" → Add these:
   ```
   NODE_ENV=production
   PORT=10000
   FRONTEND_URLS=https://sovry.xyz,https://www.sovry.xyz
   RPC_PROVIDER_URL=https://mainnet.storyrpc.io
   SUBGRAPH_URL=<YOUR_GOLDSKY_URL>
   SUPABASE_URL=<YOUR_SUPABASE_URL>
   SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>
   EXCHANGE_ADDRESS=0xA2b90B0c02B422F66cacBe5B6515Fd5702B7074D
   LAUNCHPAD_ADDRESS=<YOUR_LAUNCHPAD_ADDRESS>
   IP_PRICE_FALLBACK_USD=0.50
   PRICE_INTERVAL_MS=60000
   PUSH_INTERVAL_MS=3600000
   HARVEST_INTERVAL_MS=14400000
   GRADUATION_INTERVAL_MS=60000
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait 3-5 minutes
   - Backend will be live at: `https://sovry-backend.onrender.com`

---

## ✅ Step 4: Verify Deployment

### Frontend Checks
```bash
# Test homepage
curl https://sovry.xyz

# Test API route
curl https://sovry.xyz/api/launches?limit=5
```

### Backend Checks
```bash
# Test health endpoint
curl https://sovry-backend.onrender.com/health

# Should return:
# {"status":"ok","timestamp":"...","version":"1.0.0","environment":"production"}
```

### Browser Checks
1. Open https://sovry.xyz
2. Connect wallet (Dynamic should work)
3. Try creating a token
4. Try trading
5. Check live trade notifications appear

---

## 🐛 Common Issues

### Build fails on Vercel
**Error**: `Module not found` or `Type error`
**Fix**: 
```bash
# Test build locally first
cd frontend
npm run build
```
Fix any TypeScript errors, then push again.

### Backend not responding
**Error**: 503 Service Unavailable
**Fix**: Render free tier spins down after 15 min. First request takes ~30s to wake up. This is normal.

### CORS error in browser
**Error**: `Access-Control-Allow-Origin`
**Fix**: Check `FRONTEND_URLS` in Render includes `https://sovry.xyz`

### Wallet won't connect
**Fix**: 
1. Go to Dynamic dashboard
2. Add `sovry.xyz` to allowed domains
3. Verify `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is correct

---

## 🎉 Done!

Your app is live at **https://sovry.xyz** 🚀

**Auto-deploy enabled**: Push to `main` branch → Auto-deploy to production

---

## 💡 Pro Tips

1. **Preview Deployments**: Every PR gets a preview URL on Vercel
2. **Logs**: Check Vercel/Render dashboards for real-time logs
3. **Monitoring**: Set up Vercel Analytics (free) for traffic insights
4. **Upgrade Later**: 
   - Render Starter ($7/mo) = No spin-down
   - Vercel Pro ($20/mo) = More bandwidth + team features

---

## 📞 Need Help?

Check full guide: `DEPLOYMENT.md`
