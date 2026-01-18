const axios = require('axios');

const config = require('../config/env');

async function querySubgraph(query, variables) {
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

  return res.data;
}

module.exports = {
  querySubgraph,
};
