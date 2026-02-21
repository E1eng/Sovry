import { ethers } from 'ethers';
import EXCHANGE_ARTIFACT from '../abis/SovryExchange.json';
import { supabase } from './supabaseClient';
import { txMutex } from './mutex';
import { retryTx } from './utils';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const RPC_PROVIDER_URL = (process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io').trim();
const EXCHANGE_ADDRESS = (process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS || '').trim();
const KEEPER_PRIVATE_KEY = (process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let exchange: ethers.Contract | null = null;

function shortEthersError(err: unknown): string {
  const e = err as any;
  return String(e?.shortMessage || e?.reason || e?.message || err);
}

function getExchangeAddress(): string {
  if (!EXCHANGE_ADDRESS) {
    throw new Error('SOVRY_EXCHANGE_ADDRESS (or EXCHANGE_ADDRESS) is not set');
  }
  if (!ethers.isAddress(EXCHANGE_ADDRESS)) {
    throw new Error(`SOVRY_EXCHANGE_ADDRESS is not a valid 0x address: "${EXCHANGE_ADDRESS}"`);
  }
  return ethers.getAddress(EXCHANGE_ADDRESS);
}

function getKeeperPrivateKey(): string {
  if (!KEEPER_PRIVATE_KEY) {
    throw new Error('KEEPER_PRIVATE_KEY / HARVESTER_PRIVATE_KEY / PRIVATE_KEY is not set in environment');
  }

  const pk = KEEPER_PRIVATE_KEY.startsWith('0x') ? KEEPER_PRIVATE_KEY : `0x${KEEPER_PRIVATE_KEY}`;
  if (!ethers.isHexString(pk, 32)) {
    throw new Error('KEEPER_PRIVATE_KEY must be a 32-byte hex string (with or without 0x prefix)');
  }
  return pk;
}

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL, undefined, { staticNetwork: true });
  }
  return provider;
}

function getSigner() {
  if (!signer) {
    signer = new ethers.Wallet(getKeeperPrivateKey(), getProvider());
  }
  return signer;
}

function getExchange() {
  if (!exchange) {
    const address = getExchangeAddress();
    exchange = new ethers.Contract(address, EXCHANGE_ABI, getSigner());
  }
  return exchange;
}

async function fetchWrapperIds(limit = 100): Promise<string[]> {
  // Use Supabase tokens as the authoritative list of wrapper tokens we care about.
  // This keeps graduation working even if the subgraph still points at an old deployment.
  const { data, error } = await supabase
    .from('tokens')
    .select('token_address')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[DB] tokens select failed: ${error.message || error}`);
  }

  const rows = (data || []) as Array<{ token_address?: string | null }>;
  return rows
    .map((r) => String(r.token_address || '').trim())
    .filter((addr) => addr && ethers.isAddress(addr))
    .map((addr) => ethers.getAddress(addr));
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
  const wrappers = await fetchWrapperIds(limit);

  if (!wrappers.length) {
    console.log('[GRADUATION] No wrappers found');
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
      console.log(`[GRADUATION] ${wrapper} marketCap=${ethers.formatEther(marketCap)} IP, threshold=${thresholdFmt} IP`);
      if (marketCap < threshold) {
        skipped += 1;
        console.log(`[GRADUATION] Below threshold — skipping`);
        continue;
      }

      console.log(`[GRADUATION] Eligible: ${wrapper} marketCap=${ethers.formatEther(marketCap)} threshold=${thresholdFmt}`);

      // The contract requires there to be non-zero curve reserves (nativeLiquidity) at graduation.
      // With the current economics, marketCap can hit the threshold immediately at launch while
      // reserveBalance is still 0 (no buys/harvest yet) -> graduate() reverts InvalidAmount.
      try {
        const curve = await ex.bondingCurves(wrapper);
        const reserveBalance = (curve.reserveBalance ?? curve[3] ?? 0n) as bigint;
        if (reserveBalance === 0n) {
          skipped += 1;
          console.log(`[GRADUATION] Skipping ${wrapper}: reserveBalance=0 (would revert InvalidAmount)`);
          continue;
        }
      } catch {
        // Best-effort: if curve read fails, fall back to staticCall simulation below.
      }

      // Prevent repeated reverted txs (DexLiquidityFailed, missing pool preconditions, etc)
      // by simulating first.
      try {
        await ex.graduate.staticCall(wrapper);
      } catch (err: any) {
        skipped += 1;
        const msg = shortEthersError(err);
        if (msg.includes('TokenGraduated') || msg.includes('already graduated')) {
          console.log(`[GRADUATION] ${wrapper} already graduated (subgraph not yet synced). Skipping.`);
        } else {
          console.warn(`[GRADUATION] graduate() would revert for ${wrapper} (staticCall). Skipping tx. ${msg}`);
        }
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
      console.warn(`[GRADUATION] graduate() failed for ${wrapper}: ${shortEthersError(err)}`);
    }
  }

  console.log(`[GRADUATION] Cycle done. processed=${processed}, graduated=${graduated}, skipped=${skipped}`);
  return { processed, graduated, skipped };
}
