# Backend Sync Flow (Supabase + Subgraph + Keeper)

## Roles
- **Next.js Webhook**: `/api/webhooks/graph` (Supabase service-role write)
- **Keeper Bot (backend/bot.ts)**: runs three jobs
  - Pull harvest: `harvestFromVault` if unclaimed revenue > 0.01 WIP
  - Push fees: `pushFeesToVault` if accumulated native > 0.05 ETH
  - Syncer: poll `revenueEvents` from subgraph every 60s and forward to the webhook
- **Goldsky Subgraph**: indexes pull/push events (`RoyaltyRevenueProcessed`, `RevenueHarvested`, `BuybackExecuted`)
- **Supabase**: stores `revenue_events`, aggregates `tokens.total_harvested_amount`

## Env Summary
- Subgraph: `SUBGRAPH_URL`
- Keeper: `RPC_URL`, `KEEPER_PRIVATE_KEY`, `SOVRY_EXCHANGE_ADDRESS`
- Webhook: `GRAPH_WEBHOOK_SECRET` (same as keeper header `x-sovry-secret`)
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Webhook URL for keeper: `WEBHOOK_URL` (Next.js `/api/webhooks/graph`)
- Intervals (defaults): `HARVEST_INTERVAL_MS=600000`, `PUSH_INTERVAL_MS=3600000`, `SYNC_INTERVAL_MS=60000`

## Data Flow
1) Keeper Syncer queries subgraph `revenueEvents` > last synced block.
2) For each event, POST to webhook with header `x-sovry-secret=GRAPH_WEBHOOK_SECRET`.
3) Webhook inserts into `revenue_events` (idempotent on duplicate tx_hash) and upserts `tokens.total_harvested_amount` for harvest events.
4) Supabase becomes the single DB; no Drizzle/Postgres drivers in code.

## Required Tables (run in Supabase SQL Editor)
```sql
create table if not exists tokens (
  address text primary key,
  name text,
  symbol text,
  total_harvested_amount text not null default '0',
  created_at timestamptz default now()
);

create table if not exists revenue_events (
  id bigserial primary key,
  tx_hash text not null unique,
  token_address text not null references tokens(address) on delete cascade on update cascade,
  amount numeric(78,0) not null,
  type text not null, -- PUSH | HARVEST_RESERVE | HARVEST_BUYBACK
  block_number numeric(78,0),
  created_at timestamptz default now()
);
```

## Addresses (Aeneid)
- Factory: `0x2eC6513800426cA9B3530bd04cdB5A8f47c9C038`
- Exchange: `0xc7E8fc2C1da57eB7103bdf180B5D82E24e5e3d8D`
- Router: `0xa3B5471F43FFac986E66100E901D6cb4247D12C9`
- Royalty Workflows: `0x9515faE61E0c0447C6AC6dEe5628A2097aFE1890`
