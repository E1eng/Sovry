import { createPublicClient, http, Address, encodeFunctionData, parseEther } from "viem";
import { erc20Abi } from "viem";
import {
  SOVRY_LAUNCHPAD_ADDRESS,
  launchOnBondingCurveDynamic,
  getRoyaltyLockInfo,
  type RoyaltyLockInfo,
} from "./storyProtocolService";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

const launchpadAbi = [
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "launchToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
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
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "launches",
    outputs: [
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "royaltyToken", type: "address" },
      { internalType: "address", name: "royaltyVault", type: "address" },
      { internalType: "uint256", name: "totalRaised", type: "uint256" },
      { internalType: "uint256", name: "tokensSold", type: "uint256" },
      { internalType: "bool", name: "graduated", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "curveSupplies",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "ipAmount", type: "uint256" },
    ],
    name: "getEstimatedTokensForIP",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "harvestAndPump",
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
    const [creator, token, royaltyToken, royaltyVault, totalRaised, tokensSold, graduated] =
      await publicClient.readContract({
        address: SOVRY_LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: "launches",
        args: [tokenAddress as Address],
      });

    if (!token || token === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    return {
      creator,
      token,
      royaltyToken,
      royaltyVault,
      totalRaised,
      tokensSold,
      graduated,
    };
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
};

export type { LaunchInfo, RoyaltyLockInfo };
