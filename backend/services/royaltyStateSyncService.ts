import { ethers } from 'ethers';
import EXCHANGE_ARTIFACT from '../abis/SovryExchange.json';
import { supabase } from './supabaseClient';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const RPC_PROVIDER_URL = (process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io').trim();
const EXCHANGE_ADDRESS = (process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS || '').trim();

const POLL_INTERVAL_MS = 15_000;
const LOG_LOOKBACK_BLOCKS = 500n;

let provider: ethers.JsonRpcProvider | null = null;
let exchange: ethers.Contract | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let lastPolledBlock = 0n;

function getExchangeAddress(): string {
  if (!EXCHANGE_ADDRESS) {
    throw new Error('SOVRY_EXCHANGE_ADDRESS (or EXCHANGE_ADDRESS) is not set');
  }
  if (!ethers.isAddress(EXCHANGE_ADDRESS)) {
    // If the env var has leading/trailing spaces, ethers may treat it as a name and try ENS.
    throw new Error(`SOVRY_EXCHANGE_ADDRESS is not a valid 0x address: "${EXCHANGE_ADDRESS}"`);
  }
  return ethers.getAddress(EXCHANGE_ADDRESS);
}

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL, undefined, { staticNetwork: true });
  }
  return provider;
}

function getExchange() {
  if (!exchange) {
    const address = getExchangeAddress();
    exchange = new ethers.Contract(address, EXCHANGE_ABI, getProvider());
  }
  return exchange;
}

/**
 * Handle RoyaltyStateUpdated event for Supabase sync
 * This event is emitted whenever royalty state changes to help keep off-chain data consistent
 */
export async function handleRoyaltyStateUpdated(
  wrapperToken: string,
  totalHarvested: bigint,
  accumulatedNative: bigint,
  txHash: string,
  timestamp: Date
) {
  try {
    console.log(`[ROYALTY_SYNC] Handling RoyaltyStateUpdated for ${wrapperToken}`);
    
    // Update tokens table with latest harvested amount
    const { error: tokErr } = await supabase
      .from('tokens')
      .upsert({
        token_address: wrapperToken,
        total_harvested_amount: totalHarvested.toString(),
        unclaimed_amount: accumulatedNative.toString(),
        updated_at: timestamp.toISOString()
      }, { onConflict: 'token_address' })
      .select();

    if (tokErr) {
      console.error('[ROYALTY_SYNC] Failed to update tokens table:', tokErr.message);
      return false;
    }

    // Log sync event
    const { error: syncErr } = await supabase.from('royalty_sync_events').insert({
      tx_hash: txHash,
      token_address: wrapperToken,
      total_harvested: totalHarvested.toString(),
      accumulated_native: accumulatedNative.toString(),
      synced_at: timestamp.toISOString(),
      sync_source: 'RoyaltyStateUpdated_event'
    });

    if (syncErr) {
      console.warn('[ROYALTY_SYNC] Failed to log sync event:', syncErr.message);
      // Don't fail the whole operation if logging fails
    }

    console.log(`[ROYALTY_SYNC] Successfully synced state for ${wrapperToken}`);
    return true;

  } catch (error) {
    console.error('[ROYALTY_SYNC] Error handling RoyaltyStateUpdated:', error);
    return false;
  }
}

async function pollRoyaltyStateEvents() {
  try {
    const p = getProvider();
    const ex = getExchange();
    const exchangeAddress = getExchangeAddress();
    const currentBlock = BigInt(await p.getBlockNumber());

    if (lastPolledBlock === 0n) {
      lastPolledBlock = currentBlock - LOG_LOOKBACK_BLOCKS;
    }

    if (currentBlock <= lastPolledBlock) return;

    const iface = ex.interface;
    const eventFragment = iface.getEvent('RoyaltyStateUpdated');
    if (!eventFragment) return;
    const topic = eventFragment.topicHash;

    const logs = await p.getLogs({
      address: exchangeAddress,
      topics: [topic],
      fromBlock: lastPolledBlock + 1n,
      toBlock: currentBlock,
    });

    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed) continue;
        const [wrapperToken, totalHarvested, accumulatedNative] = parsed.args;
        await handleRoyaltyStateUpdated(
          wrapperToken as string,
          totalHarvested as bigint,
          accumulatedNative as bigint,
          log.transactionHash,
          new Date()
        );
      } catch (err) {
        console.warn('[ROYALTY_SYNC] Failed to parse log:', err);
      }
    }

    lastPolledBlock = currentBlock;
  } catch (err) {
    console.warn('[ROYALTY_SYNC] Poll error:', err);
  }
}

/**
 * Start polling for RoyaltyStateUpdated events (uses eth_getLogs, compatible with Story RPC)
 */
export function startRoyaltyStateListener() {
  console.log('[ROYALTY_SYNC] Starting RoyaltyStateUpdated poll listener...');
  pollRoyaltyStateEvents();
  pollTimer = setInterval(pollRoyaltyStateEvents, POLL_INTERVAL_MS);
  console.log('[ROYALTY_SYNC] RoyaltyStateUpdated listener started (polling every 15s)');
}

/**
 * Stop the poll listener
 */
export function stopRoyaltyStateListener() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log('[ROYALTY_SYNC] RoyaltyStateUpdated listener stopped');
}

/**
 * Manual sync function to reconcile any missed events
 * Can be called periodically or on-demand
 */
export async function manualRoyaltySync(wrapperTokens: string[] = []) {
  try {
    const ex = getExchange();
    console.log('[ROYALTY_SYNC] Starting manual royalty sync...');

    if (wrapperTokens.length === 0) {
      // If no specific tokens provided, could fetch from subgraph or database
      console.log('[ROYALTY_SYNC] No wrapper tokens provided for manual sync');
      return { synced: 0, errors: 0 };
    }

    let synced = 0;
    let errors = 0;

    for (const wrapperToken of wrapperTokens) {
      try {
        // Get current on-chain state
        const token = await ex.launchedTokens(wrapperToken);
        const accumulatedNative = await ex.accumulatedRoyaltyNative(wrapperToken);
        
        const success = await handleRoyaltyStateUpdated(
          wrapperToken,
          token.totalRoyaltiesHarvested,
          accumulatedNative,
          'manual_sync',
          new Date()
        );

        if (success) {
          synced++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error(`[ROYALTY_SYNC] Error syncing ${wrapperToken}:`, error);
        errors++;
      }
    }

    console.log(`[ROYALTY_SYNC] Manual sync complete: synced=${synced}, errors=${errors}`);
    return { synced, errors };

  } catch (error) {
    console.error('[ROYALTY_SYNC] Error in manual sync:', error);
    return { synced: 0, errors: 1 };
  }
}
