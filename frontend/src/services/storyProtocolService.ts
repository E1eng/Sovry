// Story Protocol service integration
// ARCHITECTURE: Separate READ (Backend API) and WRITE (Dynamic Wallet)

export type { RoyaltyLockInfo } from "./domain/royalty.service";

export { getRoyaltyLockInfo } from "./domain/royalty.service";

export {
  SOVRY_LAUNCHPAD_ADDRESS,
  SOVRY_EXCHANGE_ADDRESS,
  SOVRY_ROUTER_ADDRESS,
  launchOnBondingCurveDynamic,
} from "./domain/bondingCurve.service";

export type { IPAsset } from "./domain/ipAsset.service";

export { fetchWalletIPAssets } from "./domain/ipAsset.service";

export type { TokenBalance } from "./domain/token.service";

export { getTokenBalance, needsTokenUnlock } from "./domain/token.service";

export {
  claimRevenueToWalletAndPump,
  getRoyaltyVaultAddress,
  checkRoyaltyTokens,
  getClaimableRoyaltyForIp,
} from "./domain/royalty.service";

