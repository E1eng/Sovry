import { querySubgraph } from './subgraphService';

interface WrapperToken {
  id: string;
  rt: string;
  creator: string;
  launchTime: string;
  totalLocked: string;
  graduated: boolean;
  dexReserve: string;
  initialCurveSupply: string;
  totalRoyaltiesHarvested: string;
  poolAddress: string | null;
  lpTokenId: string | null;
}

export async function getPoolsFromGoldsky() {
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

  const json = await querySubgraph<{ data: { wrapperTokens: WrapperToken[] }; errors?: { message?: string }[] }>(query, {
    first: 50,
    skip: 0,
  });

  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }

  const raw = (json.data && (json.data as any).wrapperTokens) || [];

  return raw.map((w: WrapperToken) => ({
    ...w,
    address: w.id,
  }));
}
