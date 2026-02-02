# Sovry Backend (API + Worker + Keeper Bot)

This folder contains:

- API server: Express app exposing HTTP endpoints for the frontend and webhook ingest for revenue events
- Worker: background scheduler (price cache, pool data)
- Keeper bot (`bot.ts`): executes royalty pull/push jobs and syncs revenue events from subgraph to Supabase via webhook

They can be deployed as separate services.

## Scripts

- `npm run start:api` - start the API server (ts-node server.ts)
- `npm run start:worker` - start the worker process (ts-node start-worker.ts)
- `npm run bot` - run keeper bot (harvest + push + sync jobs, ts-node bot.ts)

## API Endpoints

- `GET /health`
- `GET /api/pools`
- `GET /api/ip-price`
- `POST /api/refresh-price`
- `GET /api/worker/status`

## Environment Variables (API + Worker + Bot)

### Required (API)
- `SUBGRAPH_URL` – Goldsky GraphQL endpoint for pool data
- `FRONTEND_URLS` – CORS origins
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` – used by webhook to write revenue events/totals
- `GRAPH_WEBHOOK_SECRET` – shared secret header `x-sovry-secret`

### Keeper Bot (bot.ts)
- `RPC_URL` – Story RPC (Aeneid)
- `KEEPER_PRIVATE_KEY` – holds `KEEPER_ROLE`
- `SOVRY_EXCHANGE_ADDRESS` – Exchange contract
- `SUBGRAPH_URL` – same Goldsky endpoint
- `WEBHOOK_URL` – Next.js webhook endpoint (`/api/webhooks/graph`)
- `GRAPH_WEBHOOK_SECRET` – same secret as above
- `DISCORD_WEBHOOK_URL` – for alerts (startup, tx success/fail, low balance)
- Intervals (optional): `HARVEST_INTERVAL_MS` (default 10m), `PUSH_INTERVAL_MS` (default 1h), `SYNC_INTERVAL_MS` (default 60s)

### Optional / Recommended
- `PORT` – API port (default 3001)
- `STORYSCAN_API_KEY` – for price endpoints

Notes:
- DB access is via Supabase REST (supabase-js); no Drizzle/Postgres drivers used now.

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
- Set env vars: `SUBGRAPH_URL`, `FRONTEND_URLS`, (optional) `STORYSCAN_API_KEY`

### 3) Keeper Bot

- Root directory: `backend`
- Start command: `npm run bot`
- Env: `RPC_URL`, `KEEPER_PRIVATE_KEY`, `SOVRY_EXCHANGE_ADDRESS`, `SUBGRAPH_URL`, `WEBHOOK_URL`, `GRAPH_WEBHOOK_SECRET`, `DISCORD_WEBHOOK_URL` (optional alerts), optional intervals

## Local Development

This backend loads env variables from the first `.env` found in:

- `backend/.env`
- `<repo-root>/.env`

If you want to run all locally, in separate terminals:

- `npm run start:api`
- `npm run start:worker`
- `npm run bot`
