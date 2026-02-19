import { ethers } from 'ethers';
import config from './config/env';
import EXCHANGE_ARTIFACT from './abis/SovryExchange.json';
import { harvestWrapper } from './services/royaltyHarvestService';

const EXCHANGE_ABI = (EXCHANGE_ARTIFACT as any).abi ?? EXCHANGE_ARTIFACT;

const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const RPC_PROVIDER_URL = (
  process.env.RPC_PROVIDER_URL || process.env.MAINNET_RPC_URL || config.rpcUrl || 'https://mainnet.storyrpc.io'
).trim();
const EXCHANGE_ADDRESS = (process.env.SOVRY_EXCHANGE_ADDRESS || process.env.EXCHANGE_ADDRESS || '').trim();
const KEEPER_PRIVATE_KEY = (
  process.env.HARVESTER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY || ''
).trim();

const WIP_ABI = [
  'function deposit() external payable',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
];

const ROYALTY_WORKFLOWS_ABI = [
  'function payRoyaltyOnBehalf(address childIpId, address payer, address currencyToken, uint256 amount) external',
];

const ERC20_READ_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const wrapper = process.argv[2];
  const amountIp = process.argv[3];

  if (!wrapper || !ethers.isAddress(wrapper)) {
    throw new Error('Usage: ts-node royaltyInjectionTest.ts <wrapperToken> <amountIP> [--min <amountIP>] [--no-harvest]');
  }
  if (!amountIp || Number(amountIp) <= 0) {
    throw new Error('Invalid amountIP');
  }

  if (!EXCHANGE_ADDRESS) throw new Error('SOVRY_EXCHANGE_ADDRESS (or EXCHANGE_ADDRESS) is not set');
  if (!ethers.isAddress(EXCHANGE_ADDRESS)) {
    throw new Error(`SOVRY_EXCHANGE_ADDRESS is not a valid 0x address: "${EXCHANGE_ADDRESS}"`);
  }
  if (!KEEPER_PRIVATE_KEY) throw new Error('KEEPER_PRIVATE_KEY / HARVESTER_PRIVATE_KEY / PRIVATE_KEY is not set');

  const normalizedPrivateKey = KEEPER_PRIVATE_KEY.startsWith('0x') ? KEEPER_PRIVATE_KEY : `0x${KEEPER_PRIVATE_KEY}`;
  if (!ethers.isHexString(normalizedPrivateKey, 32)) {
    throw new Error('KEEPER_PRIVATE_KEY must be a 32-byte hex string (with or without 0x prefix)');
  }

  const provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL, undefined, { staticNetwork: true });
  const signer = new ethers.Wallet(normalizedPrivateKey, provider);

  const exchange = new ethers.Contract(ethers.getAddress(EXCHANGE_ADDRESS), EXCHANGE_ABI, signer);

  const tokenInfo = await exchange.launchedTokens(wrapper);
  const ipAsset = (tokenInfo.ipAsset ?? tokenInfo[3]) as string;
  const graduated = Boolean(tokenInfo.graduated ?? tokenInfo[6]);

  const wipToken = (await exchange.wipToken()) as string;
  const royaltyWorkflows = (await exchange.royaltyWorkflows()) as string;

  console.log('[INJECT] wrapper:', wrapper);
  console.log('[INJECT] ipAsset:', ipAsset);
  console.log('[INJECT] graduated:', graduated);
  console.log('[INJECT] wipToken:', wipToken);
  console.log('[INJECT] royaltyWorkflows:', royaltyWorkflows);

  const amountWei = ethers.parseEther(amountIp);

  const wrapperErc20 = new ethers.Contract(wrapper, ERC20_READ_ABI, provider);
  const decimals = (await wrapperErc20.decimals()) as number;
  const deadBefore = (await wrapperErc20.balanceOf(DEAD_ADDRESS)) as bigint;

  const wip = new ethers.Contract(wipToken, WIP_ABI, signer);
  const royalty = new ethers.Contract(royaltyWorkflows, ROYALTY_WORKFLOWS_ABI, signer);

  console.log('[INJECT] Wrapping native IP -> WIP...');
  const wrapTx = await wip.deposit({ value: amountWei });
  await wrapTx.wait();
  console.log('[INJECT] WIP deposit tx:', wrapTx.hash);

  console.log('[INJECT] Approving royaltyWorkflows to pull WIP...');
  const approveTx = await wip.approve(royaltyWorkflows, amountWei);
  await approveTx.wait();
  console.log('[INJECT] WIP approve tx:', approveTx.hash);

  console.log('[INJECT] Paying royalty into vault (payRoyaltyOnBehalf)...');
  const payTx = await royalty.payRoyaltyOnBehalf(ipAsset, signer.address, wipToken, amountWei);
  await payTx.wait();
  console.log('[INJECT] payRoyaltyOnBehalf tx:', payTx.hash);

  const noHarvest = process.argv.includes('--no-harvest');
  if (noHarvest) {
    console.log('[INJECT] Done (no-harvest requested).');
    return;
  }

  const minStr = getArg('--min');
  const minClaimableWei = minStr ? ethers.parseEther(minStr) : undefined;

  console.log('[HARVEST] Running harvestWrapper (backend simulation)...');
  const harvestRes = await harvestWrapper(wrapper, {
    minClaimableWei,
  });

  if (harvestRes.status === 'skipped') {
    console.log('[HARVEST] skipped:', harvestRes.reason, harvestRes.claimableWei ? `(claimable=${harvestRes.claimableWei})` : '');
    return;
  }

  console.log('[HARVEST] tx:', harvestRes.txHash);
  console.log('[HARVEST] harvestedAmountWei:', harvestRes.harvestedAmountWei.toString());
  if (harvestRes.buybackFailedReason) {
    console.log('[HARVEST] buybackFailedReason:', harvestRes.buybackFailedReason);
  }

  const deadAfter = (await wrapperErc20.balanceOf(DEAD_ADDRESS)) as bigint;
  const diff = deadAfter - deadBefore;

  console.log('[CHECK] dead balance before:', ethers.formatUnits(deadBefore, decimals));
  console.log('[CHECK] dead balance after :', ethers.formatUnits(deadAfter, decimals));
  console.log('[CHECK] dead balance delta :', ethers.formatUnits(diff, decimals));

  if (!graduated) {
    console.warn('[NOTE] Token is not graduated; harvestFromVault will NOT buyback+burn. It will add to bonding curve reserves instead.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
