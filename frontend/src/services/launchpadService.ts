import { createPublicClient, http, Address, encodeFunctionData, parseEther, decodeEventLog } from "viem";
import { erc20Abi } from "viem";
import { estimateBuyAmountForIp, WRAP_UNIT, type BondingCurveParams } from "@/lib/bondingCurve";

import {
  SOVRY_LAUNCHPAD_ADDRESS,
  launchOnBondingCurveDynamic,
  getRoyaltyLockInfo,
  type RoyaltyLockInfo,
} from "./storyProtocolService";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

// Large approval amount so that subsequent sells can skip additional approve
// transactions as long as the required amount is below the remaining allowance.
const MAX_UINT256 = (1n << 256n) - 1n;

// Legacy ABI placeholder kept only for backwards compatibility with any old deployments.
// The current SovryLaunchpad contract on Aeneid does NOT expose these shapes (no `launches` mapping,
// no `getEstimatedTokensForIP`, etc). All new read paths use `newLaunchpadAbi` instead.
const launchpadAbi = [
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "maxEthCost", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buy",
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

const publicClient = createPublicClient({
  chain: {
    id: 1315,
    name: "Story Aeneid Testnet",
    nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
    rpcUrls: {
      default: { http: [STORY_RPC_URL] },
    },
  },
  transport: http(STORY_RPC_URL),
});

export interface LaunchInfo {
  creator: string;
  token: string;
  royaltyToken: string;
  royaltyVault: string;
  totalRaised: bigint;
  tokensSold: bigint;
  graduated: boolean;
}

const TARGET_RAISE_IP = parseEther("0.8");
const VIRTUAL_IP_RESERVE = parseEther("0.2");

function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  const amountInWithFee = (amountIn * 995n) / 1000n; // 0.5% fee like contract
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  if (denominator === 0n) return 0n;
  return numerator / denominator;
}

function formatBigIntToFloat(amount: bigint, decimals: number = 18): number {
  const base = 10n ** BigInt(decimals);
  const integer = Number(amount / base);
  const fraction = Number(amount % base) / Number(base);
  return integer + fraction;
}

export async function getLaunchInfo(tokenAddress: string): Promise<LaunchInfo | null> {
  try {
    // Prefer the new SovryLaunchpad contract shape if detected
    const version = await detectContractVersion(SOVRY_LAUNCHPAD_ADDRESS);
    if (version === "new") {
      try {
        // Read LaunchedToken + BondingCurve + MarketCap in parallel.
        // viem returns structs as objects with named fields, not iterable tuples.
        const [rawTokenInfo, rawCurve, marketCap] = await Promise.all([
          publicClient.readContract({
            address: SOVRY_LAUNCHPAD_ADDRESS as Address,
            abi: newLaunchpadAbi,
            functionName: "getTokenInfo",
            args: [tokenAddress as Address],
          }) as Promise<any>,
          publicClient.readContract({
            address: SOVRY_LAUNCHPAD_ADDRESS as Address,
            abi: newLaunchpadAbi,
            functionName: "getBondingCurve",
            args: [tokenAddress as Address],
          }) as Promise<any>,
          publicClient.readContract({
            address: SOVRY_LAUNCHPAD_ADDRESS as Address,
            abi: newLaunchpadAbi,
            functionName: "getMarketCap",
            args: [tokenAddress as Address],
          }) as Promise<bigint>,
        ]);

        const tokenInfo = rawTokenInfo as any;
        const curve = rawCurve as any;

        const rtAddress = tokenInfo.rtAddress as string;
        const wrapperAddress = tokenInfo.wrapperAddress as string;
        const creator = tokenInfo.creator as string;
        const totalLocked = BigInt(tokenInfo.totalLocked ?? 0n);
        const graduated = Boolean(tokenInfo.graduated);
        const vaultAddress = tokenInfo.vaultAddress as string;
        const dexReserve = BigInt(tokenInfo.dexReserve ?? 0n);

        // If the wrapper was never launched, wrapperAddress will be zero
        if (!wrapperAddress || wrapperAddress === "0x0000000000000000000000000000000000000000") {
          return null;
        }
        const currentSupply = BigInt(curve.currentSupply ?? 0n);

        // Only the bonding-curve portion is actually tradable on the curve:
        // initialCurveSupply = totalLocked - dexReserve
        const initialCurveSupply =
          totalLocked > dexReserve ? totalLocked - dexReserve : 0n;

        // tokensSold = initialCurveSupply - currentSupply (never negative)
        const tokensSold =
          initialCurveSupply > (currentSupply as bigint)
            ? initialCurveSupply - (currentSupply as bigint)
            : 0n;

        const totalRaised = marketCap ?? 0n;

        return {
          creator,
          token: wrapperAddress,
          royaltyToken: rtAddress,
          royaltyVault: vaultAddress,
          totalRaised,
          tokensSold,
          graduated,
        };
      } catch (error) {
        console.error("Error fetching launch info from new SovryLaunchpad:", error);
        return null;
      }
    }

    // Legacy/old contract path: we no longer support the historical `launches` mapping
    // here. Instead of calling a non-existent function on the current ABI (which
    // causes AbiFunctionNotFoundError), just return null so callers can handle the
    // absence of launch info gracefully.
    console.warn(
      "getLaunchInfo: detected legacy SovryLaunchpad contract without supported read methods; returning null.",
    );
    return null;
  } catch (error) {
    console.error("Error fetching launch info:", error);
    return null;
  }
}

export function getBondingProgress(info: LaunchInfo | null): number {
  if (!info || TARGET_RAISE_IP === 0n) return 0;
  const ratio = Number(info.totalRaised) / Number(TARGET_RAISE_IP);
  return Math.max(0, Math.min(100, ratio * 100));
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
    console.error("Error getting estimated tokens for IP:", error);
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
    console.error("Error estimating IP for tokens:", error);
    return "0";
  }
}

export async function launchToken(
  tokenAddress: string,
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

    const data = encodeFunctionData({
      abi: launchpadAbi,
      functionName: "launchToken",
      args: [tokenAddress as Address],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data,
    });

    return { success: true, txHash };
  } catch (error) {
    console.error("Error launching token via Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error launching token",
    };
  }
}

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
      functionName: "buy",
      args: [tokenAddress as Address, amount, value, deadline],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
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
      console.error("Error waiting for buy transaction receipt:", waitError);
      return {
        success: false,
        txHash,
        error: "Failed to confirm transaction status",
      };
    }

    return { success: true, txHash };
  } catch (error) {
    console.error("Error buying on Launchpad:", error);
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
        args: [ownerAddress, SOVRY_LAUNCHPAD_ADDRESS as Address],
      }) as bigint;

      if (currentAllowance < amount) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SOVRY_LAUNCHPAD_ADDRESS as Address, MAX_UINT256],
        });

        approveTxHash = await walletClient.sendTransaction({
          to: tokenAddress as Address,
          data: approveData,
        });
      }
    } catch (allowanceError) {
      console.error("Error checking allowance for sell; falling back to approve+sell:", allowanceError);
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SOVRY_LAUNCHPAD_ADDRESS as Address, MAX_UINT256],
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
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
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
      console.error("Error waiting for sell transaction receipt:", waitError);
      return {
        success: false,
        approveTxHash,
        sellTxHash,
        error: "Failed to confirm transaction status",
      };
    }

    return { success: true, approveTxHash, sellTxHash };
  } catch (error) {
    console.error("Error selling on Launchpad:", error);
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
    console.error("Error getting royalty vault balance:", error);
    return null;
  }
}

// Get royalty harvest parameters from environment variables
function getRoyaltyHarvestParams() {
  const ancestorIpId = process.env.NEXT_PUBLIC_ANCESTOR_IP_ID || "";
  const childIpIds = process.env.NEXT_PUBLIC_CHILD_IP_IDS
    ? process.env.NEXT_PUBLIC_CHILD_IP_IDS.split(",").map((a) => a.trim()).filter(Boolean)
    : [];
  const royaltyPolicies = process.env.NEXT_PUBLIC_ROYALTY_POLICIES
    ? process.env.NEXT_PUBLIC_ROYALTY_POLICIES.split(",").map((a) => a.trim()).filter(Boolean)
    : [];
  const currencyTokens = process.env.NEXT_PUBLIC_CURRENCY_TOKENS
    ? process.env.NEXT_PUBLIC_CURRENCY_TOKENS.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  return {
    ancestorIpId,
    childIpIds,
    royaltyPolicies,
    currencyTokens,
  };
}

export async function harvestAndPump(
  tokenAddress: string,
  primaryWallet: any
): Promise<{ success: boolean; txHash?: string; harvestedAmount?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    const walletClient = await primaryWallet.getWalletClient();
    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    // Get harvest parameters from environment variables
    const { ancestorIpId, childIpIds, royaltyPolicies, currencyTokens } = getRoyaltyHarvestParams();

    if (!ancestorIpId || childIpIds.length === 0 || royaltyPolicies.length === 0 || currencyTokens.length === 0) {
      throw new Error("Royalty harvest parameters not configured. Please set environment variables.");
    }

    // Encode function data with all required parameters
    // Note: The contract function is called "harvest" but we'll keep the service function name as "harvestAndPump"
    const data = encodeFunctionData({
      abi: newLaunchpadAbi,
      functionName: "harvest",
      args: [
        tokenAddress as Address,
        ancestorIpId as Address,
        childIpIds as Address[],
        royaltyPolicies as Address[],
        currencyTokens as Address[],
      ],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data,
    });

    // Wait for transaction to be mined to get the harvested amount from events
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    // Try to extract harvested amount from RoyaltiesHarvested event
    let harvestedAmount = 0n;
    try {
      // Event ABI for RoyaltiesHarvested
      const royaltiesHarvestedEventAbi = {
        anonymous: false,
        inputs: [
          { indexed: true, name: "wrapperToken", type: "address" },
          { indexed: false, name: "claimedAmount", type: "uint256" },
        ],
        name: "RoyaltiesHarvested",
        type: "event",
      } as const;

      // Look for the event in logs
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === SOVRY_LAUNCHPAD_ADDRESS.toLowerCase()) {
          try {
            const decoded = decodeEventLog({
              abi: [royaltiesHarvestedEventAbi],
              data: log.data,
              topics: log.topics,
            });
            
            if (decoded.eventName === "RoyaltiesHarvested") {
              // Check if it's for our token
              const eventWrapperToken = decoded.args.wrapperToken as string;
              if (eventWrapperToken.toLowerCase() === tokenAddress.toLowerCase()) {
                harvestedAmount = decoded.args.claimedAmount as bigint;
                break;
              }
            }
          } catch {
            // Not the event we're looking for, continue
            continue;
          }
        }
      }
    } catch (err) {
      console.warn("Could not extract harvested amount from events:", err);
    }

    return { 
      success: true, 
      txHash,
      harvestedAmount: harvestedAmount.toString(),
    };
  } catch (error) {
    console.error("Error calling harvestAndPump on Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error harvesting royalties",
    };
  }
}

// New contract ABI for market cap, bonding curve, and token info
const newLaunchpadAbi = [
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getMarketCap",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getBondingCurve",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "basePrice", type: "uint256" },
          { internalType: "uint256", name: "priceIncrement", type: "uint256" },
          { internalType: "uint256", name: "currentSupply", type: "uint256" },
          { internalType: "uint256", name: "reserveBalance", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" },
        ],
        internalType: "struct SovryLaunchpad.BondingCurve",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getTokenInfo",
    outputs: [
      {
        components: [
          { internalType: "address", name: "rtAddress", type: "address" },
          { internalType: "address", name: "wrapperAddress", type: "address" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "uint256", name: "launchTime", type: "uint256" },
          { internalType: "uint256", name: "totalLocked", type: "uint256" },
          { internalType: "bool", name: "graduated", type: "bool" },
          { internalType: "uint256", name: "totalRoyaltiesHarvested", type: "uint256" },
          { internalType: "address", name: "vaultAddress", type: "address" },
          { internalType: "uint256", name: "dexReserve", type: "uint256" },
          { internalType: "uint256", name: "initialCurveSupply", type: "uint256" },
        ],
        internalType: "struct SovryLaunchpad.LaunchedToken",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "address", name: "ancestorIpId", type: "address" },
      { internalType: "address[]", name: "childIpIds", type: "address[]" },
      { internalType: "address[]", name: "royaltyPolicies", type: "address[]" },
      { internalType: "address[]", name: "currencyTokens", type: "address[]" },
    ],
    name: "harvest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Cache for contract version
const contractVersionCache = new Map<string, "new" | "old">();

/**
 * Detect which contract version is deployed
 */
export async function detectContractVersion(
  launchpadAddress: string = SOVRY_LAUNCHPAD_ADDRESS
): Promise<"new" | "old"> {
  const cached = contractVersionCache.get(launchpadAddress);
  if (cached) return cached;

  // This frontend is wired against the latest SovryLaunchpad deployment
  // on Story Aeneid, which exposes getMarketCap/getBondingCurve/getTokenInfo.
  // To avoid false "old" detection (due to calling getMarketCap on a dummy
  // wrapper address that reverts), we explicitly treat this contract as "new".
  contractVersionCache.set(launchpadAddress, "new");
  return "new";
}

/**
 * Get market cap for a token (supports both contract versions)
 */
export async function getMarketCap(
  tokenAddress: string,
  launchpadAddress: string = SOVRY_LAUNCHPAD_ADDRESS
): Promise<string | null> {
  try {
    const version = await detectContractVersion(launchpadAddress);
    
    if (version === "new") {
      try {
        const marketCap = await publicClient.readContract({
          address: launchpadAddress as Address,
          abi: newLaunchpadAbi,
          functionName: "getMarketCap",
          args: [tokenAddress as Address],
        });
        return formatBigIntToFloat(marketCap as bigint, 18).toString();
      } catch (error) {
        console.error(`Error fetching market cap (new contract) for ${tokenAddress}:`, error);
        return null;
      }
    } else {
      // Old contract - calculate from totalRaised
      const launchInfo = await getLaunchInfo(tokenAddress);
      if (!launchInfo) return null;
      
      // Approximate market cap = totalRaised (in IP)
      return formatBigIntToFloat(launchInfo.totalRaised, 18).toString();
    }
  } catch (error) {
    console.error(`Error fetching market cap for ${tokenAddress}:`, error);
    return null;
  }
}

export async function getCurveParams(tokenAddress: string): Promise<BondingCurveParams | null> {
  try {
    const version = await detectContractVersion(SOVRY_LAUNCHPAD_ADDRESS);
    if (version !== "new") return null;

    const [rawCurve, rawToken] = await Promise.all([
      publicClient.readContract({
        address: SOVRY_LAUNCHPAD_ADDRESS as Address,
        abi: newLaunchpadAbi,
        functionName: "getBondingCurve",
        args: [tokenAddress as Address],
      }) as Promise<any>,
      publicClient.readContract({
        address: SOVRY_LAUNCHPAD_ADDRESS as Address,
        abi: newLaunchpadAbi,
        functionName: "getTokenInfo",
        args: [tokenAddress as Address],
      }) as Promise<any>,
    ]);

    const curve = rawCurve as any;
    const tokenInfo = rawToken as any;

    if (!curve?.isActive) return null;

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
    console.error("Error fetching bonding curve params:", error);
    return null;
  }
}

export const launchpadService = {
  getLaunchInfo,
  getBondingProgress,
  getEstimatedTokensForIP,
  estimateIPForTokens,
  launchOnBondingCurve: launchOnBondingCurveDynamic,
  launchToken,
  buy,
  sell,
  harvestAndPump,
  getRoyaltyLockInfo,
  detectContractVersion,
  getMarketCap,
  getCurveParams,
};

export type { LaunchInfo, RoyaltyLockInfo };