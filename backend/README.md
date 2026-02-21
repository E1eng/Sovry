# Sovry Backend (API + Worker)

This folder contains:

- API server: Express app exposing HTTP endpoints for the frontend and webhook ingest for revenue events
- Worker: background scheduler (price cache, pool data)

Keeper operations (push fees / harvest from vault / graduation) are handled by the **worker** process.

They can be deployed as separate services.

## Scripts

- `npm run dev` - start the API server with hot reload (nodemon)
- `npm run dev:worker` - start the worker with hot reload (nodemon)
- `npm run start:api` - start the API server (ts-node server.ts)
- `npm run start:worker` - start the worker process (ts-node start-worker.ts)
- `npm run worker` - alias for `start:worker`
- `npm run worker:dev` - alias for `dev:worker`
- `npm run bot` - alias for `npm run worker` (kept for backwards compatibility)

> Windows note: if you run `nodemon start-worker.ts` directly, PowerShell may say **"nodemon is not recognized"**.
> Use `npm run dev` / `npm run dev:worker` (recommended) or `npx nodemon start-worker.ts`.

## API Endpoints

- `GET /health`
- `GET /api/pools`
- `GET /api/ip-price`
- `POST /api/refresh-price`
- `GET /api/worker/status`

## Environment Variables (API + Worker)

### Required (API)
- `SUBGRAPH_URL` – Goldsky GraphQL endpoint for pool data
- `FRONTEND_URLS` – CORS origins
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` – used by webhook to write revenue events/totals
- `GRAPH_WEBHOOK_SECRET` – shared secret header `x-sovry-secret`

### Keeper (Worker)
- `RPC_PROVIDER_URL` – Story RPC
- `KEEPER_PRIVATE_KEY` – holds `KEEPER_ROLE`
- `SOVRY_EXCHANGE_ADDRESS` – Exchange contract

### Graduation (Worker)

Graduation is **not automatic on buy/sell**. It requires calling `SovryExchange.graduate(wrapper)` with an address that has `KEEPER_ROLE`.

The backend **worker** runs an auto-graduation loop:

- checks `getMarketCap(wrapper) >= graduationThreshold()` on-chain
- simulates `graduate()` via `staticCall`
- sends the `graduate()` tx when eligible

Config:

- `GRADUATION_INTERVAL_MS` (default `60000`)

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

## Local Development

This backend loads env variables from the first `.env` found in:

- `backend/.env`
- `<repo-root>/.env`

If you want to run all locally, in separate terminals:

- `npm run dev` (API hot reload)
- `npm run dev:worker` (Worker hot reload)
- `npm run bot`
