const { querySubgraph } = require('./subgraphService');

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL || process.env.AENEID_RPC_URL || 'https://aeneid.storyrpc.io';
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;
const KEEPER_PRIVATE_KEY = process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;

const EXCHANGE_ABI = [
  'function collectDexFees(address wrapperToken, uint256 amountOutMin) external',
  'function lpTokenIds(address wrapperToken) view returns (uint256)',
  'function launchedTokens(address wrapper) view returns (address rt,address wrapperAddress,address creator,address ipAsset,uint256 launchTime,uint256 totalLocked,bool graduated,uint256 totalRoyaltiesHarvested,address vaultAddress,uint256 dexReserve,uint256 initialCurveSupply)',
];

let provider;
let signer;
let exchange;

function getProvider() {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(RPC_PROVIDER_URL);
  }
  return provider;
}

function getSigner() {
  if (!signer) {
    const p = getProvider();
    if (!KEEPER_PRIVATE_KEY) {
      throw new Error('KEEPER_PRIVATE_KEY / HARVESTER_PRIVATE_KEY / PRIVATE_KEY is not set in environment');
    }
    signer = new ethers.Wallet(KEEPER_PRIVATE_KEY, p);
  }
  return signer;
}

function getExchange() {
  if (!exchange) {
    if (!EXCHANGE_ADDRESS) {
      throw new Error('SOVRY_EXCHANGE_ADDRESS (or EXCHANGE_ADDRESS) is not set');
    }
    exchange = new ethers.Contract(EXCHANGE_ADDRESS, EXCHANGE_ABI, getSigner());
  }
  return exchange;
}

async function fetchGraduatedWrappers() {
  const query = `
    query GraduatedWrappers($first: Int!, $skip: Int!) {
      wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
        id
        graduated
        lpTokenId
      }
    }
  `;

  const json = await querySubgraph(query, { first: 100, skip: 0 });
  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }
  const items = (json.data && json.data.wrapperTokens) || [];
  return items
    .filter((w) => w.graduated && w.lpTokenId && w.lpTokenId !== '0')
    .map((w) => w.id);
}

async function runRoyaltyHarvestCycle() {
  try {
    const wrappers = await fetchGraduatedWrappers();
    if (!wrappers || wrappers.length === 0) {
      console.log('[HARVEST] No graduated wrappers with LP NFT found; skipping collectDexFees');
      return { success: true, processed: 0, harvested: 0, skipped: 0 };
    }

    const ex = getExchange();
    const p = getProvider();
    const gasPrice = await p.getGasPrice();

    let processed = 0;
    let harvested = 0;
    let skipped = 0;

    for (const wrapper of wrappers) {
      processed += 1;
      try {
        console.log(`[HARVEST] collectDexFees on ${wrapper}`);
        const gasEstimate = await ex.estimateGas.collectDexFees(wrapper, 0);
        const tx = await ex.collectDexFees(wrapper, 0, {
          gasLimit: gasEstimate.mul(120).div(100),
          gasPrice,
        });
        console.log(`[HARVEST] Sent collectDexFees tx: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(
          `[HARVEST] collectDexFees confirmed for ${wrapper}: status=${receipt.status}, gasUsed=${receipt.gasUsed.toString()}`,
        );
        harvested += 1;
      } catch (error) {
        skipped += 1;
        console.warn(
          `[HARVEST] Skipping ${wrapper} due to error (maybe no fees):`,
          error && error.message ? error.message : error,
        );
      }
    }

    console.log(
      `[HARVEST] collectDexFees cycle completed. processed=${processed}, harvested=${harvested}, skipped=${skipped}`,
    );

    return { success: true, processed, harvested, skipped };
  } catch (error) {
    console.error('[HARVEST] Error in collectDexFees cycle:', error);
    return {
      success: false,
      error: error && error.message ? error.message : 'Unknown error in harvest cycle',
    };
  }
}

module.exports = {
  runRoyaltyHarvestCycle,
};
