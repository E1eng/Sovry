const fs = require('fs');
const path = require('path');

const envCandidates = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    require('dotenv').config({ path: candidate });
    break;
  }
}

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toArray = (value, fallback = []) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3001),
  frontendOrigins: toArray(process.env.FRONTEND_URLS, [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3010',
    'http://localhost:3000'
  ]),
  rpcUrl:
    process.env.RPC_PROVIDER_URL ||
    process.env.AENEID_RPC_URL ||
    'https://aeneid.storyrpc.io',
  subgraphUrl: process.env.SUBGRAPH_URL || process.env.GOLDSKY_ENDPOINT || '',
  storyscanApi: {
    baseUrl: process.env.STORYSCAN_API_BASE || 'https://aeneid.storyscan.io',
    apiKey: process.env.STORYSCAN_API_KEY || ''
  },
  pricing: {
    ipPriceFallbackUsd: process.env.IP_PRICE_FALLBACK_USD || ''
  },
  scheduler: {
    priceIntervalMs: int(process.env.PRICE_INTERVAL_MS, 60_000),
    harvestIntervalMs: int(process.env.HARVEST_INTERVAL_MS, 300_000)
  }
};

module.exports = config;
