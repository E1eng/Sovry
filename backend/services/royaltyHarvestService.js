const { ethers } = require('ethers');
const { querySubgraph } = require('./subgraphService');
const EXCHANGE_ABI = require('../abis/SovryExchange.json');

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL || process.env.AENEID_RPC_URL || 'https://aeneid.storyrpc.io';
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;
const KEEPER_PRIVATE_KEY = process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;

const PUSH_THRESHOLD_WEI = ethers.parseEther('0.01');
const HARVEST_THRESHOLD_WEI = ethers.parseEther('0.01');

let provider;
let signer;
let exchange;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL);
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

async function fetchWrapperIds() {
  const query = `
    query Wrappers($first: Int!, $skip: Int!) {
      wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
        id
      }
    }
  `;

  const json = await querySubgraph(query, { first: 100, skip: 0 });
  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }
  const items = (json.data && json.data.wrapperTokens) || [];
  return items.map((w) => w.id);
}

async function fetchUnclaimedRevenue(ipAsset, exchangeAddr, royaltyModuleAddr) {
  // Placeholder: depends on IRoyaltyModule ABI; ensure module has unclaimedRevenue(ipAsset, recipient)
  if (!royaltyModuleAddr) return ethers.ZeroBigInt;
  const royaltyAbi = ['function unclaimedRevenue(address ipAsset,address recipient) view returns (uint256)'];
  const module = new ethers.Contract(royaltyModuleAddr, royaltyAbi, getProvider());
  try {
    return await module.unclaimedRevenue(ipAsset, exchangeAddr);
  } catch (err) {
    console.warn('[HARVEST] unclaimedRevenue call failed:', err && err.message ? err.message : err);
    return ethers.ZeroBigInt;
  }
}

async function pushFeesJob() {
  const ex = getExchange();
  const wrappers = await fetchWrapperIds();
  if (!wrappers || wrappers.length === 0) {
    console.log('[PUSH] No wrappers found');
    return { processed: 0, pushed: 0, skipped: 0 };
  }

  let processed = 0;
  let pushed = 0;
  let skipped = 0;

  for (const wrapper of wrappers) {
    processed += 1;
    try {
      const pending = await ex.accumulatedRoyaltyNative(wrapper);
      if (pending < PUSH_THRESHOLD_WEI) {
        skipped += 1;
        continue;
      }
      const gas = await ex.pushFeesToVault.estimateGas(wrapper);
      const tx = await ex.pushFeesToVault(wrapper, { gasLimit: gas * 120n / 100n });
      console.log(`[PUSH] pushFeesToVault sent for ${wrapper}: ${tx.hash}`);
      await tx.wait();
      pushed += 1;
    } catch (err) {
      skipped += 1;
      console.warn(`[PUSH] pushFeesToVault failed for ${wrapper}:`, err && err.message ? err.message : err);
    }
  }

  console.log(`[PUSH] Cycle done. processed=${processed}, pushed=${pushed}, skipped=${skipped}`);
  return { processed, pushed, skipped };
}

async function harvestJob() {
  const ex = getExchange();
  const wrappers = await fetchWrapperIds();
  if (!wrappers || wrappers.length === 0) {
    console.log('[HARVEST] No wrappers found');
    return { processed: 0, harvested: 0, skipped: 0 };
  }

  const royaltyModule = await ex.royaltyWorkflows();
  let processed = 0;
  let harvested = 0;
  let skipped = 0;

  for (const wrapper of wrappers) {
    processed += 1;
    try {
      const token = await ex.launchedTokens(wrapper);
      const ipAsset = token.ipAsset;
      const unclaimed = await fetchUnclaimedRevenue(ipAsset, EXCHANGE_ADDRESS, royaltyModule);
      if (unclaimed < HARVEST_THRESHOLD_WEI) {
        skipped += 1;
        continue;
      }
      const gas = await ex.harvestFromVault.estimateGas(wrapper);
      const tx = await ex.harvestFromVault(wrapper, { gasLimit: gas * 120n / 100n });
      console.log(`[HARVEST] harvestFromVault sent for ${wrapper}: ${tx.hash}`);
      await tx.wait();
      harvested += 1;
    } catch (err) {
      skipped += 1;
      console.warn(`[HARVEST] harvestFromVault failed for ${wrapper}:`, err && err.message ? err.message : err);
      // do not throw; continue loop
    }
  }

  console.log(`[HARVEST] Cycle done. processed=${processed}, harvested=${harvested}, skipped=${skipped}`);
  return { processed, harvested, skipped };
}

module.exports = {
  pushFeesJob,
  harvestJob,
};
