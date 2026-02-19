import 'dotenv/config';
import axios from 'axios';
import { ethers } from 'ethers';
import exchangeArtifact from './abis/SovryExchange.json';
import { txMutex } from './services/mutex';
import { retryTx } from './services/utils';
import { AlertLevel, sendDiscordAlert } from './services/alerts';

const exchangeAbi = (exchangeArtifact as any).abi ?? exchangeArtifact;

const RPC_URL = process.env.RPC_URL || process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL;
const KEEPER_PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const EXCHANGE_ADDRESS = process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS;
const SUBGRAPH_URL = process.env.SUBGRAPH_URL || process.env.GOLDSKY_ENDPOINT || '';

if (!RPC_URL) throw new Error('RPC_URL (or RPC_PROVIDER_URL) is required');
if (!KEEPER_PRIVATE_KEY) throw new Error('KEEPER_PRIVATE_KEY (or PRIVATE_KEY) is required');
if (!EXCHANGE_ADDRESS) throw new Error('SOVRY_EXCHANGE_ADDRESS is required');
if (!SUBGRAPH_URL) throw new Error('SUBGRAPH_URL is required for token discovery');

const HARVEST_THRESHOLD = ethers.parseEther('0.01'); // 0.01 WIP
const PUSH_THRESHOLD = ethers.parseEther('0.05'); // 0.05 ETH
const HARVEST_INTERVAL_MS = Number(process.env.HARVEST_INTERVAL_MS || 10 * 60 * 1000);
const PUSH_INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS || 60 * 60 * 1000);
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 60 * 1000); // 1 min
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.GRAPH_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

const LOW_BALANCE_THRESHOLD = ethers.parseEther('0.1');

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(KEEPER_PRIVATE_KEY, provider);
const exchange = new ethers.Contract(EXCHANGE_ADDRESS, exchangeAbi, signer);

const royaltyAbi = ['function unclaimedRevenue(address ipAsset,address recipient) view returns (uint256)'];

let lastSyncedBlock = 0n;

async function fetchWrappers(): Promise<{ id: string; ipAsset: string }[]> {
  const query = `{
    wrapperTokens(first: 100, orderBy: launchTime, orderDirection: desc) {
      id
      ipAsset
    }
  }`;
  const res = await axios.post(SUBGRAPH_URL, { query });
  if (res.data?.errors?.length) {
    throw new Error(res.data.errors[0].message || 'Subgraph error');
  }
  return res.data?.data?.wrapperTokens || [];
}

async function getUnclaimed(ipAsset: string, royaltyModule: string): Promise<bigint> {
  if (!royaltyModule || royaltyModule === ethers.ZeroAddress) return 0n;
  const mod = new ethers.Contract(royaltyModule, royaltyAbi, provider);
  try {
    const result: bigint = await mod.unclaimedRevenue(ipAsset, EXCHANGE_ADDRESS);
    return result || 0n;
  } catch (err) {
    console.warn('[HARVEST] unclaimedRevenue failed:', err);
    return 0n;
  }
}

function mapToPayload(evt: any) {
  const base = {
    txHash: evt.txHash as string,
    tokenAddress: (evt.token.id as string) || (evt.token as string),
    amount: evt.amount as string,
    blockNumber: Number(evt.blockNumber || 0),
  };

  if (evt.type === 'PUSH') {
    return { ...base, event: 'RoyaltyRevenueProcessed' as const };
  }
  if (evt.type === 'HARVEST_BUYBACK') {
    return { ...base, event: 'RevenueHarvested' as const, isPostGrad: true };
  }
  return { ...base, event: 'RevenueHarvested' as const, isPostGrad: false };
}

async function runSyncJob() {
  if (!WEBHOOK_URL) {
    console.warn('[SYNC] Skipping: WEBHOOK_URL not set');
    return;
  }

  const since = lastSyncedBlock;
  const query = `{
    revenueEvents(first: 50, orderBy: blockNumber, orderDirection: desc, where: { blockNumber_gt: ${since.toString()} }) {
      txHash
      amount
      type
      blockNumber
      token { id }
    }
  }`;

  try {
    const res = await axios.post(SUBGRAPH_URL, { query });
    if (res.data?.errors?.length) throw new Error(res.data.errors[0].message || 'subgraph error');
    const events: any[] = res.data?.data?.revenueEvents || [];
    if (!events.length) return;

    // Process from oldest to newest to keep ordering
    const ordered = [...events].sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));
    for (const evt of ordered) {
      try {
        const payload = mapToPayload(evt);
        await axios.post(WEBHOOK_URL, payload, {
          headers: WEBHOOK_SECRET ? { 'x-sovry-secret': WEBHOOK_SECRET } : undefined,
          timeout: 10_000,
        });
      } catch (err) {
        console.warn('[SYNC] Forward failed for tx', evt.txHash, err);
      }
    }

    const maxBlock = ordered.reduce<bigint>((acc, e) => {
      const b = BigInt(e.blockNumber || 0);
      return b > acc ? b : acc;
    }, since);
    lastSyncedBlock = maxBlock;
    console.log(`[SYNC] Processed ${ordered.length} events up to block ${maxBlock.toString()}`);
  } catch (err) {
    console.error('[SYNC] Job error:', err);
  }
}

async function runHarvestJob() {
  try {
    const wrappers = await fetchWrappers();
    if (!wrappers.length) {
      console.log('[HARVEST] No wrappers found');
      return;
    }

    const royaltyModule: string = await exchange.royaltyWorkflows();

    for (const w of wrappers) {
      try {
        const token = await exchange.launchedTokens(w.id);
        const ipAsset = token.ipAsset as string;
        const unclaimed = await getUnclaimed(ipAsset, royaltyModule);
        if (unclaimed < HARVEST_THRESHOLD) continue;

        await txMutex.runExclusive(async () => {
          const tx = await retryTx(async () => {
            const gas = await exchange.harvestFromVault.estimateGas(w.id);
            return exchange.harvestFromVault(w.id, { gasLimit: (gas * 120n) / 100n });
          });
          console.log(`[HARVEST] Sent harvestFromVault for ${w.id} tx=${tx.hash}`);
          await tx.wait();
          await sendDiscordAlert('Harvest success', `Harvested for ${w.id} tx=${tx.hash}`, AlertLevel.INFO);
        });
      } catch (err) {
        console.warn(`[HARVEST] Harvest failed for ${w.id}:`, err);
        await sendDiscordAlert('Harvest failed', `Wrapper ${w.id}: ${String(err)}`, AlertLevel.ERROR);
      }
    }
  } catch (err) {
    console.error('[HARVEST] Job error:', err);
    await sendDiscordAlert('Harvest job error', String(err), AlertLevel.ERROR);
  }
}

async function runPushJob() {
  try {
    const wrappers = await fetchWrappers();
    if (!wrappers.length) {
      console.log('[PUSH] No wrappers found');
      return;
    }

    for (const w of wrappers) {
      try {
        const pending: bigint = await exchange.accumulatedRoyaltyNative(w.id);
        if (pending < PUSH_THRESHOLD) continue;

        await txMutex.runExclusive(async () => {
          const tx = await retryTx(async () => {
            const gas = await exchange.pushFeesToVault.estimateGas(w.id);
            return exchange.pushFeesToVault(w.id, { gasLimit: (gas * 120n) / 100n });
          });
          console.log(`[PUSH] Sent pushFeesToVault for ${w.id} tx=${tx.hash}`);
          await tx.wait();
          await sendDiscordAlert('Push success', `Pushed fees for ${w.id} tx=${tx.hash}`, AlertLevel.INFO);
        });
      } catch (err) {
        console.warn(`[PUSH] Push failed for ${w.id}:`, err);
        await sendDiscordAlert('Push failed', `Wrapper ${w.id}: ${String(err)}`, AlertLevel.ERROR);
      }
    }
  } catch (err) {
    console.error('[PUSH] Job error:', err);
    await sendDiscordAlert('Push job error', String(err), AlertLevel.ERROR);
  }
}

async function checkBalanceAndAlert() {
  try {
    const bal = await provider.getBalance(signer.address);
    if (bal < LOW_BALANCE_THRESHOLD) {
      await sendDiscordAlert('Low balance warning', `Keeper balance ${ethers.formatEther(bal)} ETH`, AlertLevel.WARNING);
    }
  } catch (err) {
    console.warn('[BALANCE] Failed to fetch balance:', err);
  }
}

async function main() {
  console.log('Keeper bot starting...');
  console.log(`Harvest interval: ${HARVEST_INTERVAL_MS / 1000}s`);
  console.log(`Push interval: ${PUSH_INTERVAL_MS / 1000}s`);
  console.log(`Sync interval: ${SYNC_INTERVAL_MS / 1000}s`);

  await sendDiscordAlert('Keeper bot started', `Harvest ${HARVEST_INTERVAL_MS / 1000}s, Push ${PUSH_INTERVAL_MS / 1000}s, Sync ${SYNC_INTERVAL_MS / 1000}s`, AlertLevel.INFO);
  await checkBalanceAndAlert();

  // run immediately
  runHarvestJob();
  runPushJob();
  runSyncJob();

  setInterval(runHarvestJob, HARVEST_INTERVAL_MS);
  setInterval(runPushJob, PUSH_INTERVAL_MS);
  setInterval(runSyncJob, SYNC_INTERVAL_MS);
  setInterval(checkBalanceAndAlert, 5 * 60 * 1000);
}

main().catch((err) => {
  console.error('Keeper bot fatal error:', err);
  process.exit(1);
});
