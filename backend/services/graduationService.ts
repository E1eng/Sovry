import { ethers } from 'ethers';
import EXCHANGE_ARTIFACT from '../abis/SovryExchange.json';
import { querySubgraph } from './subgraphService';
import { txMutex } from './mutex';
import { retryTx } from './utils';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io';
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;
const KEEPER_PRIVATE_KEY = process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let exchange: ethers.Contract | null = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL);
  }
  return provider;
}

function getSigner() {
  if (!signer) {
    if (!KEEPER_PRIVATE_KEY) {
      throw new Error('KEEPER_PRIVATE_KEY / HARVESTER_PRIVATE_KEY / PRIVATE_KEY is not set in environment');
    }
    signer = new ethers.Wallet(KEEPER_PRIVATE_KEY, getProvider());
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

async function fetchUngraduatedWrapperIds(limit = 100): Promise<string[]> {
  const query = `
    query UngraduatedWrappers($first: Int!, $skip: Int!) {
      wrapperTokens(first: $first, skip: $skip, where: { graduated: false }, orderBy: launchTime, orderDirection: desc) {
        id
      }
    }
  `;

  const json = await querySubgraph<any>(query, { first: limit, skip: 0 });
  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }

  const items = (json.data && (json.data as any).wrapperTokens) || [];
  return items.map((w: any) => w.id as string);
}

async function hasKeeperRole(): Promise<boolean> {
  const ex = getExchange();
  const addr = await getSigner().getAddress();

  try {
    const role = (await ex.KEEPER_ROLE()) as string;
    return (await ex.hasRole(role, addr)) as boolean;
  } catch {
    // Not fatal; just skip the check if ABI/provider doesn't support it.
    return true;
  }
}

export async function graduationJob(opts?: { limit?: number }) {
  const ex = getExchange();

  const ok = await hasKeeperRole();
  if (!ok) {
    const addr = await getSigner().getAddress();
    console.warn(`[GRADUATION] Signer ${addr} missing KEEPER_ROLE. Skipping graduation job.`);
    return { processed: 0, graduated: 0, skipped: 0 };
  }

  const limit = opts?.limit ?? 100;
  const wrappers = await fetchUngraduatedWrapperIds(limit);

  if (!wrappers.length) {
    console.log('[GRADUATION] No ungraduated wrappers found');
    return { processed: 0, graduated: 0, skipped: 0 };
  }

  const threshold = (await ex.graduationThreshold()) as bigint;
  const thresholdFmt = ethers.formatEther(threshold);

  let processed = 0;
  let graduated = 0;
  let skipped = 0;

  for (const wrapper of wrappers) {
    processed += 1;
    try {
      const marketCap = (await ex.getMarketCap(wrapper)) as bigint;
      if (marketCap < threshold) {
        skipped += 1;
        continue;
      }

      console.log(`[GRADUATION] Eligible: ${wrapper} marketCap=${ethers.formatEther(marketCap)} threshold=${thresholdFmt}`);

      // Prevent repeated reverted txs (DexLiquidityFailed, missing pool preconditions, etc)
      // by simulating first.
      try {
        await ex.graduate.staticCall(wrapper);
      } catch (err) {
        skipped += 1;
        console.warn(`[GRADUATION] graduate() would revert for ${wrapper} (staticCall). Skipping tx.`, err);
        continue;
      }

      await txMutex.runExclusive(async () => {
        const tx = await retryTx(async () => {
          const gas = (await ex.graduate.estimateGas(wrapper)) as bigint;
          return await ex.graduate(wrapper, { gasLimit: (gas * 120n) / 100n });
        });

        console.log(`[GRADUATION] graduate() sent for ${wrapper}: ${tx.hash}`);
        await tx.wait();
      });

      graduated += 1;
    } catch (err) {
      skipped += 1;
      console.warn(`[GRADUATION] graduate() failed for ${wrapper}:`, err);
    }
  }

  console.log(`[GRADUATION] Cycle done. processed=${processed}, graduated=${graduated}, skipped=${skipped}`);
  return { processed, graduated, skipped };
}
