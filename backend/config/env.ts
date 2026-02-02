import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const int = (value: string | undefined, fallback: number) => {
  const n = parseInt(value || '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const toArray = (value: string | undefined, fallback: string[] = []) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3001),
  frontendOrigins: toArray(process.env.FRONTEND_URLS, [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3010', 'http://localhost:3000']),
  rpcUrl: process.env.RPC_PROVIDER_URL || process.env.AENEID_RPC_URL || 'https://aeneid.storyrpc.io',
  subgraphUrl: process.env.SUBGRAPH_URL || process.env.GOLDSKY_ENDPOINT || '',
  storyscanApi: {
    baseUrl: process.env.STORYSCAN_API_BASE || 'https://aeneid.storyscan.io',
    apiKey: process.env.STORYSCAN_API_KEY || '',
  },
  pricing: {
    ipPriceFallbackUsd: process.env.IP_PRICE_FALLBACK_USD || '',
  },
  scheduler: {
    priceIntervalMs: int(process.env.PRICE_INTERVAL_MS, 60_000),
    pushIntervalMs: int(process.env.PUSH_INTERVAL_MS, 3_600_000),
    harvestIntervalMs: int(process.env.HARVEST_INTERVAL_MS, 14_400_000),
  },
};

export default config;
