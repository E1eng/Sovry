import { createPublicClient, http, Address, encodeFunctionData, parseEther } from "viem";
import { erc20Abi } from "viem";
import {
  SOVRY_LAUNCHPAD_ADDRESS,
  launchOnBondingCurveDynamic,
  getRoyaltyLockInfo,
  type RoyaltyLockInfo,
} from "./storyProtocolService";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

// Legacy ABI placeholder kept only for backwards compatibility with any old deployments.
// The current SovryLaunchpad contract on Aeneid does NOT expose these shapes (no `launches` mapping,
// no `getEstimatedTokensForIP`, etc). All new read paths use `newLaunchpadAbi` instead.
const launchpadAbi = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "minTokensOut", type: "uint256" },
    ],
    name: "buy",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "tokenAmount", type: "uint256" },
      { internalType: "uint256", name: "minIpOut", type: "uint256" },
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

const TARGET_RAISE_IP = parseEther("1");
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
    const ipAmountWei = parseEther(ipAmount || "0");
    const out = (await publicClient.readContract({
      address: SOVRY_LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      functionName: "getEstimatedTokensForIP",
      args: [tokenAddress as Address, ipAmountWei],
    })) as bigint;

    const numeric = formatBigIntToFloat(out, 18);
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
    const amountIn = parseEther(tokenAmount || "0");
    if (amountIn === 0n) return "0";

    const info = await getLaunchInfo(tokenAddress);
    if (!info) return "0";

    const curveSupply = (await publicClient.readContract({
      address: SOVRY_LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      functionName: "curveSupplies",
      args: [tokenAddress as Address],
    })) as bigint;

    const reserveIn = curveSupply > info.tokensSold ? curveSupply - info.tokensSold : 0n;
    const reserveOut = info.totalRaised + VIRTUAL_IP_RESERVE;

    if (reserveIn === 0n || reserveOut === 0n) return "0";

    const ipOut = getAmountOut(amountIn, reserveIn, reserveOut);
    const numeric = formatBigIntToFloat(ipOut, 18);
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
    const minOutWei = parseEther(minTokensOut || "0");

    const data = encodeFunctionData({
      abi: launchpadAbi,
      functionName: "buy",
      args: [tokenAddress as Address, minOutWei],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data,
      value,
    });

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

    const amountWei = parseEther(tokenAmount || "0");
    const minIpOutWei = parseEther(minIpOut || "0");

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [SOVRY_LAUNCHPAD_ADDRESS as Address, amountWei],
    });

    const approveTxHash = await walletClient.sendTransaction({
      to: tokenAddress as Address,
      data: approveData,
    });

    const sellData = encodeFunctionData({
      abi: launchpadAbi,
      functionName: "sell",
      args: [tokenAddress as Address, amountWei, minIpOutWei],
    });

    const sellTxHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data: sellData,
    });

    return { success: true, approveTxHash, sellTxHash };
  } catch (error) {
    console.error("Error selling on Launchpad:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error selling on Launchpad",
    };
  }
}

export async function harvestAndPump(
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
      functionName: "harvestAndPump",
      args: [tokenAddress as Address],
    });

    const txHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data,
    });

    return { success: true, txHash };
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
        ],
        internalType: "struct SovryLaunchpad.LaunchedToken",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
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
};

export type { LaunchInfo, RoyaltyLockInfo };