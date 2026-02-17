import { ethers } from 'ethers';
import EXCHANGE_ABI from '../abis/SovryExchange.json';
import { supabase } from './supabaseClient';

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io';
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;

let provider: ethers.JsonRpcProvider | null = null;
let exchange: ethers.Contract | null = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL);
  }
  return provider;
}

function getExchange() {
  if (!exchange) {
    if (!EXCHANGE_ADDRESS) {
      throw new Error('SOVRY_EXCHANGE_ADDRESS (or EXCHANGE_ADDRESS) is not set');
    }
    exchange = new ethers.Contract(EXCHANGE_ADDRESS, EXCHANGE_ABI, getProvider());
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

/**
 * Start listening for RoyaltyStateUpdated events
 */
export function startRoyaltyStateListener() {
  const ex = getExchange();
  
  console.log('[ROYALTY_SYNC] Starting RoyaltyStateUpdated event listener...');
  
  // Listen for RoyaltyStateUpdated events
  ex.on('RoyaltyStateUpdated', async (wrapperToken: string, totalHarvested: bigint, accumulatedNative: bigint, event: any) => {
    try {
      const timestamp = new Date();
      await handleRoyaltyStateUpdated(
        wrapperToken,
        totalHarvested,
        accumulatedNative,
        event.transactionHash,
        timestamp
      );
    } catch (error) {
      console.error('[ROYALTY_SYNC] Error in event listener:', error);
    }
  });

  console.log('[ROYALTY_SYNC] RoyaltyStateUpdated listener started');
}

/**
 * Stop the event listener
 */
export function stopRoyaltyStateListener() {
  if (exchange) {
    exchange.removeAllListeners('RoyaltyStateUpdated');
    console.log('[ROYALTY_SYNC] RoyaltyStateUpdated listener stopped');
  }
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
