import { Address, encodeFunctionData, parseEther } from "viem";

import { erc20Abi } from "viem";
import { estimateBuyAmountForIp, WRAP_UNIT, type BondingCurveParams } from "@/lib/bondingCurve";
import { logger } from "@/lib/logger";
import { TENDERLY_RPC_URL } from "@/lib/env";
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

// ABI for earlier launchpad deployments; new read paths use `newLaunchpadAbi`.
const launchpadAbi = [
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "maxEthCost", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buyETH",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "minEthProceeds", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sell",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

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
  // exposes consolidated state reads via getTokenState.
  contractVersionCache.set(launchpadAddress, "new");
  return "new";
}

export interface LaunchInfo {
  creator: string;
  token: string;
  royaltyToken: string;
  royaltyVault: string;
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
        // Read consolidated TokenState from the new SovryLaunchpad contract.
        const rawState = (await publicClient.readContract({
          address: SOVRY_EXCHANGE_ADDRESS as Address,
          abi: newLaunchpadAbi,
          functionName: "getTokenState",
          args: [tokenAddress as Address],
        })) as any;

        const tokenState = rawState as any;
        const tokenInfo = tokenState.token as any;
        const curve = tokenState.curve as any;

        const wrapperAddress = tokenInfo.wrapperAddress as string;

        // If the wrapper was never launched, wrapperAddress will be zero
        if (!wrapperAddress || wrapperAddress === "0x0000000000000000000000000000000000000000") {
          return null;
        }

        const rtAddress = tokenInfo.rtAddress as string;
        const creator = tokenInfo.creator as string;
        const graduated = Boolean(tokenInfo.graduated);
        const vaultAddress = tokenInfo.vaultAddress as string;

        const reserveBalance = BigInt(curve.reserveBalance ?? 0n);
        const initialCurveSupply = BigInt(tokenInfo.initialCurveSupply ?? 0n);
        const currentSupply = BigInt(curve.currentSupply ?? 0n);

        // tokensSold = initialCurveSupply - currentSupply (never negative)
        const tokensSold =
          initialCurveSupply > currentSupply ? initialCurveSupply - currentSupply : 0n;

        // For the purposes of the current UI, "totalRaised" is approximated by
        // the current market cap of the token.
        const totalRaised = BigInt(tokenState.marketCap ?? 0n);

        return {
          creator,
          token: wrapperAddress,
          royaltyToken: rtAddress,
          royaltyVault: vaultAddress,
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

export function getBondingProgress(info: LaunchInfo | null): number {
  if (!info || TARGET_RAISE_IP === 0n) return 0;
  if (info.graduated) return 100;
  const ratio = Number(info.totalRaised) / Number(TARGET_RAISE_IP);
  return Math.max(0, Math.min(100, ratio * 100));
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
          abi: newLaunchpadAbi,
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
    // Heuristic: 1 IP -> 1 wrapper token, convert 18-decimal IP to 6-decimal tokens
    const ipAmountWei = parseEther(ipAmount || "0");
    if (ipAmountWei <= 0n) return "0";
    const ONE_TOKEN_FACTOR = 10n ** 12n; // 1e12 to go from 18 -> 6
    const tokenAmount = ipAmountWei / ONE_TOKEN_FACTOR;
    if (tokenAmount <= 0n) return "0";
    // Interpret as 6-decimal balance
    const numeric = formatBigIntToFloat(tokenAmount, 6);
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
    // Heuristic inverse: 1 wrapper token (6 decimals) -> 1 IP (18 decimals)
    const tokenAmountWei = parseEther(tokenAmount || "0");
    if (tokenAmountWei === 0n) return "0";
    // Treat tokenAmountWei as IP wei directly for estimation
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
      abi: launchpadAbi,
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

    // Convert 18-decimal UI token amount to 6-decimal wrapper units
    const ONE_TOKEN_FACTOR = 10n ** 12n; // 1e12 to go from 18 -> 6
    let amount = amountEthDecimals / ONE_TOKEN_FACTOR;
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
      abi: launchpadAbi,
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

    const rawState = (await publicClient.readContract({
      address: SOVRY_EXCHANGE_ADDRESS as Address,
      abi: newLaunchpadAbi,
      functionName: "getTokenState",
      args: [tokenAddress as Address],
    })) as any;

    const state = rawState as any;
    const curve = state.curve as any;
    const tokenInfo = state.token as any;

    if (!state.curveActive) return null;

    const basePrice = BigInt(curve.basePrice ?? 0);
    const priceIncrement = BigInt(curve.priceIncrement ?? 0);
    const currentSupply = BigInt(curve.currentSupply ?? 0);
    const initialCurveSupply = BigInt(tokenInfo.initialCurveSupply ?? 0);

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

type TenderlySimulationTx = {
  from: string;
  to: string;
  value?: string;
  data?: string;
};

async function simulateOnTenderly(tx: TenderlySimulationTx): Promise<any> {
  if (!TENDERLY_RPC_URL) {
    throw new Error("TENDERLY_RPC_URL is not configured for Tenderly simulation");
  }

  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tenderly_simulateTransaction",
    params: [tx, "latest"],
  };

  const response = await fetch(TENDERLY_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tenderly simulation RPC error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || "Tenderly simulation failed");
  }

  return json.result;
}

export async function simulateBuy(
  tokenAddress: string,
  ipAmount: string,
  fromAddress: string,
): Promise<any> {
  if (!fromAddress) {
    throw new Error("Wallet address is required for Tenderly simulation");
  }

  const value = parseEther(ipAmount || "0");
  if (value <= 0n) {
    throw new Error("Amount must be greater than 0");
  }

  const curveParams = await getCurveParams(tokenAddress);
  if (!curveParams) {
    throw new Error("Bonding curve not available for this token");
  }

  const { amount } = estimateBuyAmountForIp(curveParams, value);

  if (amount < WRAP_UNIT) {
    throw new Error("Trade amount too small to buy at least 1 token");
  }

  if (curveParams.currentSupply < amount) {
    throw new Error("Insufficient bonding curve supply");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = BigInt(nowSec + 20 * 60); // 20 minutes

  const data = encodeFunctionData({
    abi: launchpadAbi,
    functionName: "buyETH",
    args: [tokenAddress as Address, amount, value, deadline],
  });

  const tx: TenderlySimulationTx = {
    from: fromAddress,
    to: SOVRY_ROUTER_ADDRESS as string,
    value: `0x${value.toString(16)}`,
    data,
  };

  return simulateOnTenderly(tx);
}

export async function simulateSell(
  tokenAddress: string,
  tokenAmount: string,
  minIpOut: string,
  fromAddress: string,
): Promise<any> {
  if (!fromAddress) {
    throw new Error("Wallet address is required for Tenderly simulation");
  }

  const amountEthDecimals = parseEther(tokenAmount || "0");
  const minIpOutWei = parseEther(minIpOut || "0");

  // Convert 18-decimal UI token amount to 6-decimal wrapper units
  const ONE_TOKEN_FACTOR = 10n ** 12n; // 1e12 to go from 18 -> 6
  const amount = amountEthDecimals / ONE_TOKEN_FACTOR;
  if (amount <= 0n) {
    throw new Error("Sell amount too small");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = BigInt(nowSec + 20 * 60); // 20 minutes

  const sellData = encodeFunctionData({
    abi: launchpadAbi,
    functionName: "sell",
    args: [tokenAddress as Address, amount, minIpOutWei, deadline],
  });

  const tx: TenderlySimulationTx = {
    from: fromAddress,
    to: SOVRY_ROUTER_ADDRESS as string,
    value: "0x0",
    data: sellData,
  };

  return simulateOnTenderly(tx);
}

export const launchpadService = {
  getLaunchInfo,
  getBondingProgress,
  getEstimatedTokensForIP,
  estimateIPForTokens,
  launchOnBondingCurve: launchOnBondingCurveDynamic,
  buy,
  sell,
  simulateBuy,
  simulateSell,
  harvestAndPump,
  getRoyaltyLockInfo,
  detectContractVersion,
  getMarketCap,
  getCurveParams,
};

// LaunchInfo and RoyaltyLockInfo are already exported via their interface/type
// declarations; no need to re-export them here.

// New contract ABI for Exchange reads (SovryExchange)
export const newLaunchpadAbi = [
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getMarketCap",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getTokenState",
    outputs: [
      {
        components: [
          {
            components: [
              { internalType: "address", name: "rtAddress", type: "address" },
              { internalType: "address", name: "wrapperAddress", type: "address" },
              { internalType: "address", name: "creator", type: "address" },
              { internalType: "address", name: "ipAsset", type: "address" },
              { internalType: "uint256", name: "launchTime", type: "uint256" },
              { internalType: "uint256", name: "totalLocked", type: "uint256" },
              { internalType: "bool", name: "graduated", type: "bool" },
              { internalType: "uint256", name: "totalRoyaltiesHarvested", type: "uint256" },
              { internalType: "address", name: "vaultAddress", type: "address" },
              { internalType: "uint256", name: "dexReserve", type: "uint256" },
              { internalType: "uint256", name: "initialCurveSupply", type: "uint256" },
            ],
            internalType: "struct SovryExchange.LaunchedToken",
            name: "token",
            type: "tuple",
          },
          {
            components: [
              { internalType: "uint256", name: "basePrice", type: "uint256" },
              { internalType: "uint256", name: "priceIncrement", type: "uint256" },
              { internalType: "uint256", name: "currentSupply", type: "uint256" },
              { internalType: "uint256", name: "reserveBalance", type: "uint256" },
            ],
            internalType: "struct SovryExchange.BondingCurve",
            name: "curve",
            type: "tuple",
          },
          { internalType: "uint256", name: "currentPrice", type: "uint256" },
          { internalType: "uint256", name: "marketCap", type: "uint256" },
          { internalType: "bool", name: "canGraduate", type: "bool" },
          { internalType: "uint256", name: "secondsSinceLaunch", type: "uint256" },
          { internalType: "uint256", name: "secondsToGraduationDelay", type: "uint256" },
          { internalType: "bool", name: "curveActive", type: "bool" },
        ],
        internalType: "struct SovryExchange.TokenState",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "wrapperToRt",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "rtToWrapper",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;