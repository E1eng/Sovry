import { ethers } from 'ethers';
import { querySubgraph } from './subgraphService';
import EXCHANGE_ARTIFACT from '../abis/SovryExchange.json';
import { supabase } from './supabaseClient';
import { txMutex } from './mutex';
import { retryTx } from './utils';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io';
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;
const KEEPER_PRIVATE_KEY = process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;

const PUSH_THRESHOLD_WEI = ethers.parseEther('0.01');
const HARVEST_THRESHOLD_WEI = ethers.parseEther('0.01');

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

  const json = await querySubgraph<any>(query, { first: 100, skip: 0 });
  if (json.errors && json.errors.length) {
    const first = json.errors[0];
    throw new Error(first && first.message ? first.message : 'Subgraph query failed');
  }
  const items = (json.data && (json.data as any).wrapperTokens) || [];
  return items.map((w: any) => w.id as string);
}


export async function pushFeesJob() {
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
      await txMutex.runExclusive(async () => {
        const tx = await retryTx(async () => {
          const gas = await ex.pushFeesToVault.estimateGas(wrapper);
          return await ex.pushFeesToVault(wrapper, { gasLimit: (gas * 120n) / 100n });
        });
        console.log(`[PUSH] pushFeesToVault sent for ${wrapper}: ${tx.hash}`);
        await tx.wait();
        pushed += 1;

        const { error: evtErr } = await supabase.from('revenue_events').insert({
          tx_hash: tx.hash,
          token_address: wrapper,
          amount: pending.toString(),
          type: 'PUSH',
        });
        if (evtErr) console.warn('[PUSH][DB] revenue_events insert failed:', evtErr.message || evtErr);
      });
    } catch (err) {
      skipped += 1;
      console.warn(`[PUSH] pushFeesToVault failed for ${wrapper}:`, err);
    }
  }

  console.log(`[PUSH] Cycle done. processed=${processed}, pushed=${pushed}, skipped=${skipped}`);
  return { processed, pushed, skipped };
}

export async function harvestJob() {
  const ex = getExchange();
  const wrappers = await fetchWrapperIds();
  if (!wrappers || wrappers.length === 0) {
    console.log('[HARVEST] No wrappers found');
    return { processed: 0, harvested: 0, skipped: 0 };
  }

  let processed = 0;
  let harvested = 0;
  let skipped = 0;

  for (const wrapper of wrappers) {
    processed += 1;
    try {
      const accumulatedNative = (await ex.accumulatedRoyaltyNative(wrapper)) as bigint;
      if (accumulatedNative < HARVEST_THRESHOLD_WEI) {
        skipped += 1;
        continue;
      }

      try {
        await ex.harvestFromVault.staticCall(wrapper);
      } catch (simErr) {
        skipped += 1;
        console.warn(`[HARVEST] harvestFromVault would revert for ${wrapper} (staticCall). Skipping.`, simErr);
        continue;
      }

      await txMutex.runExclusive(async () => {
        const tx = await retryTx(async () => {
          const gas = await ex.harvestFromVault.estimateGas(wrapper);
          return await ex.harvestFromVault(wrapper, { gasLimit: (gas * 120n) / 100n });
        });
        console.log(`[HARVEST] harvestFromVault sent for ${wrapper}: ${tx.hash}`);
        await tx.wait();
        harvested += 1;

        const amountStr = accumulatedNative.toString();
        const { error: evtErr } = await supabase.from('revenue_events').insert({
          tx_hash: tx.hash,
          token_address: wrapper,
          amount: amountStr,
          type: 'HARVEST_BUYBACK',
        });
        if (evtErr) console.warn('[HARVEST][DB] revenue_events insert failed:', evtErr.message || evtErr);

        const { error: tokErr } = await supabase
          .from('tokens')
          .upsert({ token_address: wrapper, total_harvested_amount: amountStr }, { onConflict: 'token_address' })
          .select();
        if (tokErr) console.warn('[HARVEST][DB] tokens upsert failed:', tokErr.message || tokErr);
      });
    } catch (err) {
      skipped += 1;
      console.warn(`[HARVEST] harvestFromVault failed for ${wrapper}:`, err);
    }
  }

  console.log(`[HARVEST] Cycle done. processed=${processed}, harvested=${harvested}, skipped=${skipped}`);
  return { processed, harvested, skipped };
}
