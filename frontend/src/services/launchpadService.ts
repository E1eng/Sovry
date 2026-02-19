import { Address, encodeFunctionData, parseEther } from "viem";

import { erc20Abi } from "viem";
import { estimateBuyAmountForIp, WRAP_UNIT, type BondingCurveParams } from "@/lib/bondingCurve";
import { logger } from "@/lib/logger";
import { exchangeReadAbi, exchangeWriteAbi, routerWriteAbi } from "@/constants/abis";
import { getStoryPublicClient } from "@/services/viem/storyPublicClient";

import {
  launchOnBondingCurveDynamic,
  getRoyaltyLockInfo,
  claimRevenueToWalletAndPump,
} from "./storyProtocolService";
import { SOVRY_EXCHANGE_ADDRESS, SOVRY_ROUTER_ADDRESS } from "./domain/bondingCurve.service";

// Large approval amount so that subsequent sells can skip additional approve
// transactions while allowance remains sufficient.
const MAX_UINT256 = (1n << 256n) - 1n;

const publicClient = getStoryPublicClient();

// Cache for contract version so we don't re-detect on every call
const contractVersionCache = new Map<string, "new" | "old">();

/**
 * Detect which SovryLaunchpad contract version is deployed.
 * For the current deployment we always treat it as "new" to avoid
 * mis-detecting when probing with dummy wrapper addresses.
 */
export async function detectContractVersion(
  launchpadAddress: string = SOVRY_ROUTER_ADDRESS,
): Promise<"new" | "old"> {
  const cached = contractVersionCache.get(launchpadAddress);
  if (cached) return cached;

  // Frontend is wired against the latest SovryLaunchpad deployment which
  // exposes consolidated state reads via Exchange view methods.
  contractVersionCache.set(launchpadAddress, "new");
  return "new";
}

export interface LaunchInfo {
  creator: string;
  token: string;
  royaltyToken: string;
  royaltyVault: string;
  ipAsset?: string;
  totalRaised: bigint;
  tokensSold: bigint;
  graduated: boolean;
  reserveBalance: bigint;
}

const TARGET_RAISE_IP = parseEther("10000");

function formatBigIntToFloat(amount: bigint, decimals: number = 18): number {
  const base = 10n ** BigInt(decimals);
  const integer = Number(amount / base);
  const fraction = Number(amount % base) / Number(base);
  return integer + fraction;
}

export async function getLaunchInfo(tokenAddress: string): Promise<LaunchInfo | null> {
  try {
    // Prefer the new SovryLaunchpad contract shape if detected
    const version = await detectContractVersion(SOVRY_ROUTER_ADDRESS);
    if (version === "new") {
      try {
        const [tokenInfoRaw, curveRaw, marketCapRaw] = await Promise.all([
          publicClient.readContract({
            address: SOVRY_EXCHANGE_ADDRESS as Address,
            abi: exchangeReadAbi,
            functionName: "launchedTokens",
            args: [tokenAddress as Address],
          }),
          publicClient.readContract({
            address: SOVRY_EXCHANGE_ADDRESS as Address,
            abi: exchangeReadAbi,
            functionName: "bondingCurves",
            args: [tokenAddress as Address],
          }),
          publicClient.readContract({
            address: SOVRY_EXCHANGE_ADDRESS as Address,
            abi: exchangeReadAbi,
            functionName: "getMarketCap",
            args: [tokenAddress as Address],
          }),
        ]);

        const tokenInfo = tokenInfoRaw as any;
        const curve = curveRaw as any;

        const wrapperAddress = (tokenInfo?.wrapperAddress ?? tokenInfo?.[1]) as string | undefined;
        if (!wrapperAddress || wrapperAddress === "0x0000000000000000000000000000000000000000") {
          return null;
        }

        const rtAddress = (tokenInfo?.rtAddress ?? tokenInfo?.[0]) as string;
        const creator = (tokenInfo?.creator ?? tokenInfo?.[2]) as string;
        const ipAsset = (tokenInfo?.ipAsset ?? tokenInfo?.[3]) as string | undefined;
        const graduated = Boolean(tokenInfo?.graduated ?? tokenInfo?.[6]);
        const vaultAddress = (tokenInfo?.vaultAddress ?? tokenInfo?.[8]) as string;

        const reserveBalance = BigInt(curve?.reserveBalance ?? curve?.[3] ?? 0n);
        const initialCurveSupply = BigInt(tokenInfo?.initialCurveSupply ?? tokenInfo?.[10] ?? 0n);
        const currentSupply = BigInt(curve?.currentSupply ?? curve?.[2] ?? 0n);

        const tokensSold = initialCurveSupply > currentSupply ? initialCurveSupply - currentSupply : 0n;

        const totalRaised = BigInt((marketCapRaw as bigint | undefined) ?? 0n);

        return {
          creator,
          token: wrapperAddress,
          royaltyToken: rtAddress,
          royaltyVault: vaultAddress,
          ipAsset,
          totalRaised,
          tokensSold,
          graduated,
          reserveBalance,
        };
      } catch (error) {
        logger.error("Error fetching launch info from new SovryLaunchpad:", error);
        return null;
      }
    }

    // Fallback when the launchpad has no supported read methods; treat as no launch info.
    logger.warn("getLaunchInfo: detected legacy SovryLaunchpad contract without supported read methods; returning null.");
    return null;
  } catch (error) {
    logger.error("Error fetching launch info:", error);
    return null;
  }
}

export function getBondingProgress(info: LaunchInfo | null, thresholdOverride?: bigint): number {
  const threshold = thresholdOverride && thresholdOverride > 0n ? thresholdOverride : TARGET_RAISE_IP;
  if (!info || threshold === 0n) return 0;
  if (info.graduated) return 100;
  const ratio = Number(info.totalRaised) / Number(threshold);
  return Math.max(0, Math.min(100, ratio * 100));
}

export async function getGraduationThreshold(): Promise<bigint | null> {
  try {
    const threshold = await publicClient.readContract({
      address: SOVRY_EXCHANGE_ADDRESS as Address,
      abi: exchangeReadAbi,
      functionName: "graduationThreshold",
    });
    return BigInt((threshold as bigint | undefined) ?? 0n);
  } catch (error) {
    logger.error("Error fetching graduation threshold:", error);
    return null;
  }
}

/**
 * Get market cap for a wrapper token using the SovryLaunchpad view.
 * Returns a human-readable string (IP units) or null on error.
 */
export async function getMarketCap(
  tokenAddress: string,
  launchpadAddress: string = SOVRY_ROUTER_ADDRESS,
): Promise<string | null> {
  try {
    const version = await detectContractVersion(launchpadAddress);

    if (version === "new") {
      try {
        const marketCap = await publicClient.readContract({
          address: SOVRY_EXCHANGE_ADDRESS as Address,
          abi: exchangeReadAbi,
          functionName: "getMarketCap",
          args: [tokenAddress as Address],
        });
        return formatBigIntToFloat(marketCap as bigint, 18).toString();
      } catch (error) {
        logger.error(`Error fetching market cap (new contract) for ${tokenAddress}:`, error);
        return null;
      }
    } else {
      // Approximate from totalRaised if available
      const launchInfo = await getLaunchInfo(tokenAddress);
      if (!launchInfo) return null;
      return formatBigIntToFloat(launchInfo.totalRaised, 18).toString();
    }
  } catch (error) {
    logger.error(`Error fetching market cap for ${tokenAddress}:`, error);
    return null;
  }
}

export async function getEstimatedTokensForIP(
  tokenAddress: string,
  ipAmount: string
): Promise<string> {
  try {
    const ipAmountWei = parseEther(ipAmount || "0");
    if (ipAmountWei <= 0n) return "0";
    // Wrapper token uses 18 decimals; display estimate in whole tokens.
    const numeric = formatBigIntToFloat(ipAmountWei, 18);
    return numeric.toString();
  } catch (error) {
    logger.error("Error getting estimated tokens for IP:", error);
    return "0";
  }
}

export async function estimateIPForTokens(
  tokenAddress: string,
  tokenAmount: string
): Promise<string> {
  try {
    // Heuristic inverse: 1 wrapper token (18 decimals) -> 1 IP (18 decimals)
    const tokenAmountWei = parseEther(tokenAmount || "0");
    if (tokenAmountWei === 0n) return "0";
    const numeric = formatBigIntToFloat(tokenAmountWei, 18);
    return numeric.toString();
  } catch (error) {
    logger.error("Error estimating IP for tokens:", error);
    return "0";
  }
}

// All new launches go through launchOnBondingCurveDynamic in storyProtocolService.ts.

export async function buy(
  tokenAddress: string,
  ipAmount: string,
  minTokensOut: string,
  primaryWallet: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    const walletClient = await primaryWallet.getWalletClient();
    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    const value = parseEther(ipAmount || "0");
    if (value <= 0n) {
      throw new Error("Amount must be greater than 0");
    }

    // Fetch real bonding curve parameters for accurate amount calculation
    const curveParams = await getCurveParams(tokenAddress);
    if (!curveParams) {
      throw new Error("Bonding curve not available for this token");
    }

    // Use the same BigInt bonding-curve math as the UI to determine how many
    // wrapper tokens can be bought with the provided IP amount. This avoids
    // sending an 'amount' that is smaller than WRAP_UNIT or not a multiple of it,
    // which would cause InvalidStep() reverts on-chain.
    const { amount } = estimateBuyAmountForIp(curveParams, value);

    // Enforce minimum trade size: at least 1 whole wrapper token (1 * WRAP_UNIT)
    if (amount < WRAP_UNIT) {
      throw new Error("Trade amount too small to buy at least 1 token");
    }

    // Extra safety: ensure we do not exceed the curve's current supply
    if (curveParams.currentSupply < amount) {
      throw new Error("Insufficient bonding curve supply");
    }

    // Use a generous deadline based on current wall-clock time
    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = BigInt(nowSec + 20 * 60); // 20 minutes

    const data = encodeFunctionData({
      abi: routerWriteAbi,
      functionName: "buyETH",
      args: [tokenAddress as Address, amount, value, deadline],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_ROUTER_ADDRESS as Address,
      data,
      value,
    });

    // Wait for confirmation so we can distinguish between successful and
    // reverted transactions and surface accurate status to the UI.
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        return {
          success: false,
          txHash,
          error: "Transaction reverted on-chain",
        };
      }
    } catch (waitError) {
      logger.error("Error waiting for buy transaction receipt:", waitError);
      return {
        success: false,
        txHash,
        error: "Failed to confirm transaction status",
      };
    }

    return { success: true, txHash };
  } catch (error) {
    logger.error("Error buying on Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error buying on Launchpad",
    };
  }
}

export async function sell(
  tokenAddress: string,
  tokenAmount: string,
  minIpOut: string,
  primaryWallet: any
): Promise<{ success: boolean; approveTxHash?: string; sellTxHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    const walletClient = await primaryWallet.getWalletClient();
    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    const amountEthDecimals = parseEther(tokenAmount || "0");
    const minIpOutWei = parseEther(minIpOut || "0");

    // Wrapper token uses 18 decimals; amount is already in smallest units.
    let amount = amountEthDecimals;
    if (amount <= 0n) {
      throw new Error("Sell amount too small");
    }

    const ownerAddress = primaryWallet.address as Address | undefined;
    if (!ownerAddress) {
      throw new Error("No wallet address available");
    }

    let approveTxHash: string | undefined;

    // Check current allowance; only send approve if needed. This avoids
    // redundant approve transactions when the user has already granted
    // sufficient allowance in a previous sell.
    try {
      const currentAllowance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [ownerAddress, SOVRY_EXCHANGE_ADDRESS as Address],
      }) as bigint;

      if (currentAllowance < amount) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SOVRY_EXCHANGE_ADDRESS as Address, MAX_UINT256],
        });

        approveTxHash = await walletClient.sendTransaction({
          to: tokenAddress as Address,
          data: approveData,
        });
      }
    } catch (allowanceError) {
      logger.error("Error checking allowance for sell; falling back to approve+sell:", allowanceError);
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SOVRY_EXCHANGE_ADDRESS as Address, MAX_UINT256],
      });

      approveTxHash = await walletClient.sendTransaction({
        to: tokenAddress as Address,
        data: approveData,
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = BigInt(nowSec + 20 * 60); // 20 minutes

    const sellData = encodeFunctionData({
      abi: routerWriteAbi,
      functionName: "sell",
      args: [tokenAddress as Address, amount, minIpOutWei, deadline],
    });

    const sellTxHash = await walletClient.sendTransaction({
      to: SOVRY_ROUTER_ADDRESS as Address,
      data: sellData,
    });

    // Wait for confirmation to know if the transaction actually succeeded
    // or was reverted on-chain.
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: sellTxHash });
      if (receipt.status !== "success") {
        return {
          success: false,
          approveTxHash,
          sellTxHash,
          error: "Transaction reverted on-chain",
        };
      }
    } catch (waitError) {
      logger.error("Error waiting for sell transaction receipt:", waitError);
      return {
        success: false,
        approveTxHash,
        sellTxHash,
        error: "Failed to confirm transaction status",
      };
    }

    return { success: true, approveTxHash, sellTxHash };
  } catch (error) {
    logger.error("Error selling on Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error selling on Launchpad",
    };
  }
}

export async function redeem(
  tokenAddress: string,
  tokenAmount: string,
  primaryWallet: any,
): Promise<{ success: boolean; approveTxHash?: string; redeemTxHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    const walletClient = await primaryWallet.getWalletClient();
    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    const amount = parseEther(tokenAmount || "0");
    if (amount <= 0n) {
      throw new Error("Redeem amount too small");
    }

    const ownerAddress = primaryWallet.address as Address | undefined;
    if (!ownerAddress) {
      throw new Error("No wallet address available");
    }

    let approveTxHash: string | undefined;

    // Redeem pulls wrapper tokens via transferFrom, so the Exchange needs allowance.
    try {
      const currentAllowance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [ownerAddress, SOVRY_EXCHANGE_ADDRESS as Address],
      }) as bigint;

      if (currentAllowance < amount) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SOVRY_EXCHANGE_ADDRESS as Address, MAX_UINT256],
        });

        approveTxHash = await walletClient.sendTransaction({
          to: tokenAddress as Address,
          data: approveData,
        });
      }
    } catch (allowanceError) {
      logger.error("Error checking allowance for redeem; falling back to approve+redeem:", allowanceError);
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SOVRY_EXCHANGE_ADDRESS as Address, MAX_UINT256],
      });

      approveTxHash = await walletClient.sendTransaction({
        to: tokenAddress as Address,
        data: approveData,
      });
    }

    const redeemData = encodeFunctionData({
      abi: exchangeWriteAbi,
      functionName: "redeem",
      args: [tokenAddress as Address, amount, ownerAddress],
    });

    const redeemTxHash = await walletClient.sendTransaction({
      to: SOVRY_EXCHANGE_ADDRESS as Address,
      data: redeemData,
    });

    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemTxHash });
      if (receipt.status !== "success") {
        return {
          success: false,
          approveTxHash,
          redeemTxHash,
          error: "Transaction reverted on-chain",
        };
      }
    } catch (waitError) {
      logger.error("Error waiting for redeem transaction receipt:", waitError);
      return {
        success: false,
        approveTxHash,
        redeemTxHash,
        error: "Failed to confirm transaction status",
      };
    }

    return { success: true, approveTxHash, redeemTxHash };
  } catch (error) {
    logger.error("Error redeeming on Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error redeeming on Launchpad",
    };
  }
}

// Get royalty vault native token balance
export async function getRoyaltyVaultBalance(
  vaultAddress: string
): Promise<bigint | null> {
  try {
    if (!vaultAddress || vaultAddress === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    const balance = await publicClient.getBalance({
      address: vaultAddress as Address,
    });

    return balance;
  } catch (error) {
    logger.error("Error getting royalty vault balance:", error);
    return null;
  }
}

export async function harvestAndPump(
  ipId: string,
  tokenAddress: string,
  primaryWallet: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    if (!ipId || !ipId.startsWith("0x") || ipId.length !== 42) {
      throw new Error("Invalid IP ID for harvest");
    }

    return await claimRevenueToWalletAndPump(ipId, tokenAddress, primaryWallet);
  } catch (error) {
    logger.error("Error in harvestAndPump flow:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error harvesting royalties",
    };
  }
}

export async function getCurveParams(tokenAddress: string): Promise<BondingCurveParams | null> {
  try {
    const version = await detectContractVersion(SOVRY_ROUTER_ADDRESS);
    if (version !== "new") return null;

    const [curveActive, curveRaw, tokenInfoRaw] = await Promise.all([
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: exchangeReadAbi,
        functionName: "bondingCurveActive",
        args: [tokenAddress as Address],
      }),
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: exchangeReadAbi,
        functionName: "bondingCurves",
        args: [tokenAddress as Address],
      }),
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: exchangeReadAbi,
        functionName: "launchedTokens",
        args: [tokenAddress as Address],
      }),
    ]);

    if (!curveActive) return null;

    const curve = curveRaw as any;
    const tokenInfo = tokenInfoRaw as any;

    const basePrice = BigInt(curve?.basePrice ?? curve?.[0] ?? 0n);
    const priceIncrement = BigInt(curve?.priceIncrement ?? curve?.[1] ?? 0n);
    const currentSupply = BigInt(curve?.currentSupply ?? curve?.[2] ?? 0n);
    const initialCurveSupply = BigInt(tokenInfo?.initialCurveSupply ?? tokenInfo?.[10] ?? 0n);

    if (basePrice === 0n && priceIncrement === 0n) {
      return null;
    }

    return {
      basePrice,
      priceIncrement,
      currentSupply,
      initialCurveSupply,
    };
  } catch (error) {
    logger.error("Error fetching bonding curve params:", error);
    return null;
  }
}

export const launchpadService = {
  getLaunchInfo,
  getBondingProgress,
  getEstimatedTokensForIP,
  estimateIPForTokens,
  launchOnBondingCurve: launchOnBondingCurveDynamic,
  buy,
  sell,
  redeem,
  harvestAndPump,
  getRoyaltyLockInfo,
  detectContractVersion,
  getMarketCap,
  getCurveParams,
  getGraduationThreshold,
};

// LaunchInfo and RoyaltyLockInfo are already exported via their interface/type
// declarations; no need to re-export them here.

export { exchangeReadAbi as newLaunchpadAbi } from "@/constants/abis";