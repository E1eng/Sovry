import { ethers } from 'ethers';
import EXCHANGE_ARTIFACT from '../abis/SovryExchange.json';
import { supabase } from './supabaseClient';
import { txMutex } from './mutex';
import { retryTx } from './utils';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const ROYALTY_MODULE_ABI = [
  'function ipRoyaltyVaults(address ipId) view returns (address)',
];

const VAULT_ABI = [
  'function claimableRevenue(address claimer, address token) view returns (uint256)',
  'function claimRevenueOnBehalfByTokenBatch(address claimer, address[] calldata tokenList) external returns (uint256[] memory)',
];

const RPC_PROVIDER_URL = (process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.storyrpc.io').trim();
const EXCHANGE_ADDRESS = (process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS || '').trim();
const KEEPER_PRIVATE_KEY = (process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();

const PUSH_THRESHOLD_WEI = ethers.parseEther('0.01');
const HARVEST_THRESHOLD_WEI = ethers.parseEther('0.01');

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let exchange: ethers.Contract | null = null;

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
    const p = getProvider();
    signer = new ethers.Wallet(getKeeperPrivateKey(), p);
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

async function getRoyaltyModule(ex: ethers.Contract): Promise<ethers.Contract> {
  const royaltyAddress = (await ex.royaltyWorkflows()) as string;
  return new ethers.Contract(royaltyAddress, ROYALTY_MODULE_ABI, getProvider());
}

function parseHarvestLogs(receipt: ethers.TransactionReceipt) {
  const iface = new ethers.Interface(EXCHANGE_ABI);

  let harvestedAmount: bigint | null = null;
  let buybackFailedReason: string | null = null;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) continue;

      if (parsed.name === 'RoyaltiesHarvested') {
        // event RoyaltiesHarvested(address indexed wrapperToken, uint256 amount)
        harvestedAmount = BigInt(parsed.args[1].toString());
      }

      if (parsed.name === 'BuybackFailed') {
        buybackFailedReason = String(parsed.args[1] ?? 'BuybackFailed');
      }
    } catch {
      // ignore non-exchange logs
    }
  }

  return { harvestedAmount, buybackFailedReason };
}

export async function harvestWrapper(
  wrapper: string,
  opts?: {
    minClaimableWei?: bigint;
    royaltyModule?: ethers.Contract;
  },
): Promise<
  | { status: 'harvested'; wrapper: string; txHash: string; harvestedAmountWei: bigint; claimableWei: bigint; buybackFailedReason: string | null }
  | { status: 'skipped'; wrapper: string; reason: string; claimableWei?: bigint }
> {
  const ex = getExchange();
  const exchangeAddress = getExchangeAddress();

  const tokenInfo = await ex.launchedTokens(wrapper);
  const ipAsset = (tokenInfo.ipAsset ?? tokenInfo[3]) as string;
  const isPostGrad = Boolean(tokenInfo.graduated ?? tokenInfo[6]);

  // Skip if ipAsset is zero address (token not properly registered in Exchange)
  if (!ipAsset || ipAsset === '0x0000000000000000000000000000000000000000') {
    return { status: 'skipped', wrapper, reason: 'ipAsset not set in Exchange (token launched on different Exchange)' };
  }

  const royalty = opts?.royaltyModule ?? (await getRoyaltyModule(ex));
  const minClaimableWei = opts?.minClaimableWei ?? HARVEST_THRESHOLD_WEI;

  let claimableWei = 0n;
  try {
    const vaultAddress = await royalty.ipRoyaltyVaults(ipAsset);
    if (!vaultAddress || vaultAddress === '0x0000000000000000000000000000000000000000') {
       return { status: 'skipped', wrapper, reason: 'No Royalty Vault deployed for IP' };
    }

    const wipToken = await ex.wipToken();
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, getProvider());
    
    // Query claimable revenue for the Exchange contract
    claimableWei = (await vault.claimableRevenue(exchangeAddress, wipToken)) as bigint;
  } catch (err) {
    return { status: 'skipped', wrapper, reason: 'Failed to read claimableRevenue from vault' };
  }

  if (claimableWei < minClaimableWei) {
    return { status: 'skipped', wrapper, reason: 'below harvest threshold', claimableWei };
  }

  try {
    await ex.harvestFromVault.staticCall(wrapper);
  } catch (simErr) {
    return { status: 'skipped', wrapper, reason: 'harvestFromVault would revert' };
  }

  return await txMutex.runExclusive(async () => {
    const tx = await retryTx(async () => {
      const gas = await ex.harvestFromVault.estimateGas(wrapper);
      return await ex.harvestFromVault(wrapper, { gasLimit: (gas * 120n) / 100n });
    });

    console.log(`[HARVEST] harvestFromVault sent for ${wrapper}: ${tx.hash}`);
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('harvestFromVault transaction was dropped (no receipt)');
    }

    const { harvestedAmount, buybackFailedReason } = parseHarvestLogs(receipt);
    const harvestedAmountWei = harvestedAmount ?? 0n;

    // Update DB (best-effort)
    try {
      const { error: evtErr } = await supabase.from('revenue_events').insert({
        tx_hash: tx.hash,
        token_address: wrapper,
        amount: harvestedAmountWei.toString(),
        type: isPostGrad ? 'HARVEST_BUYBACK' : 'HARVEST_RESERVE',
      });
      if (evtErr) console.warn('[HARVEST][DB] revenue_events insert failed:', evtErr.message || evtErr);

      const tokenAfter = await ex.launchedTokens(wrapper);
      const totalHarvested = (tokenAfter.totalRoyaltiesHarvested ?? tokenAfter[7]) as bigint;

      const wrapperKey = String(wrapper || '').toLowerCase();
      const { data: updatedTokens, error: tokErr } = await supabase
        .from('tokens')
        // Don't upsert: manual deletes should stick and not reappear as "ghost" tokens.
        .update({ total_harvested_amount: totalHarvested.toString() })
        .eq('token_address', wrapperKey)
        .select('token_address');
      if (tokErr) {
        console.warn('[HARVEST][DB] tokens update failed:', tokErr.message || tokErr);
      } else if (!updatedTokens || updatedTokens.length === 0) {
        console.log(`[HARVEST][DB] tokens row missing for ${wrapperKey}; skipping tokens update (won't auto-insert)`);
      }
    } catch (dbErr) {
      console.warn('[HARVEST][DB] post-tx updates failed:', dbErr);
    }

    return { status: 'harvested', wrapper, txHash: tx.hash, harvestedAmountWei, claimableWei, buybackFailedReason };
  });
}

async function fetchWrapperIds() {
  // Use Supabase as the source of truth for which tokens we care about.
  // This prevents keeper jobs from looping over stale subgraph wrappers after a redeploy.
  const { data, error } = await supabase
    .from('tokens')
    .select('token_address')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`[DB] tokens select failed: ${error.message || error}`);
  }

  const rows = (data || []) as Array<{ token_address?: string | null }>;
  const wrappers = rows
    .map((r) => String(r.token_address || '').trim())
    .filter((addr) => addr && ethers.isAddress(addr))
    .map((addr) => ethers.getAddress(addr));

  return wrappers;
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
  const royalty = await getRoyaltyModule(ex);
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
      const res = await harvestWrapper(wrapper, { royaltyModule: royalty });
      if (res.status === 'harvested') {
        harvested += 1;
        if (res.buybackFailedReason) {
          console.warn(`[HARVEST] Buyback failed for ${wrapper}:`, res.buybackFailedReason);
        }
      } else {
        skipped += 1;
      }
    } catch (err) {
      skipped += 1;
      console.warn(`[HARVEST] harvestFromVault failed for ${wrapper}:`, err);
    }
  }

  console.log(`[HARVEST] Cycle done. processed=${processed}, harvested=${harvested}, skipped=${skipped}`);
  return { processed, harvested, skipped };
}
