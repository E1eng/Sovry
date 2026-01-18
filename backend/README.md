# Sovry Backend (API + Worker)

This folder contains 2 separate Node.js processes:

- API server: Express app exposing HTTP endpoints for the frontend
- Worker: background scheduler that caches IP price in-memory and aggregates pool data from the subgraph

They are designed to be deployed as **two separate services** (e.g. on Railway).

## Scripts

- `npm run start:api` - start the API server
- `npm run start:worker` - start the worker process

## API Endpoints

- `GET /health`
- `GET /api/pools`
- `GET /api/ip-price`
- `POST /api/refresh-price`
- `GET /api/worker/status`

## Environment Variables

### Required (API + Worker)

- `SUBGRAPH_URL`
  - Goldsky GraphQL endpoint used by the worker to fetch `wrapperTokens`.
- `FRONTEND_URLS`
  - Comma-separated list of allowed CORS origins.

### Optional / Recommended

- `PORT`
  - API port (Railway provides this automatically).
- `RPC_PROVIDER_URL`
  - Story RPC URL used by onchain services (default: `https://aeneid.storyrpc.io`).
- `STORYSCAN_API_BASE`
  - StoryScan base URL (default: `https://aeneid.storyscan.io`).
- `STORYSCAN_API_KEY`
  - StoryScan API key (recommended for production stability).
- `PRICE_INTERVAL_MS`
  - Worker interval for refreshing IP price (default: `60000`).
- `HARVEST_INTERVAL_MS`
  - Worker interval for royalty harvest cycle (default: `300000`).
- `IP_PRICE_FALLBACK_USD`
  - Optional numeric fallback price used only if StoryScan fails.

### Royalty Harvest (Worker only)

- `LAUNCHPAD_ADDRESS`
- `HARVEST_PRIVATE_KEY`

## Railway Deployment

Create **two Railway services** pointing to the same repo:

### 1) API Service

- Root directory: `backend`
- Start command: `npm run start:api`
- Set env vars (at least):
  - `SUBGRAPH_URL`
  - `FRONTEND_URLS`

### 2) Worker Service

- Root directory: `backend`
- Start command: `npm run start:worker`
- Set env vars (at least):
  - `SUBGRAPH_URL`
  - `STORYSCAN_API_KEY` (recommended)
  - `LAUNCHPAD_ADDRESS` / `HARVEST_PRIVATE_KEY` (if enabling royalty harvesting)

## Local Development

This backend loads env variables from the first `.env` found in:

- `backend/.env`
- `<repo-root>/.env`

If you want to run both processes locally, run them in separate terminals:

- `npm run start:api`
- `npm run start:worker`
