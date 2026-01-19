const { querySubgraph } = require('./subgraphService');

async function getPoolsFromGoldsky() {
  const query = `
    query WrapperTokens($first: Int!, $skip: Int!) {
      wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
        id
        rt
        creator
        launchTime
        totalLocked
        graduated
        dexReserve
        initialCurveSupply
        totalRoyaltiesHarvested
        poolAddress
        lpTokenId
      }
    }
  `;

  const json = await querySubgraph(query, { first: 50, skip: 0 });

  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }

  const raw = (json.data && json.data.wrapperTokens) || [];

  return raw.map((w) => ({
    ...w,
    address: w.id,
  }));
}

module.exports = {
  getPoolsFromGoldsky,
};
