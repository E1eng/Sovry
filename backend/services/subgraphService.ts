import axios from 'axios';
import config from '../config/env';

export async function querySubgraph<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!config.subgraphUrl) {
    throw new Error('SUBGRAPH_URL (or GOLDSKY_ENDPOINT) is not set');
  }

  const res = await axios.post(
    config.subgraphUrl,
    { query, variables },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20_000,
    },
  );

  return res.data as T;
}
