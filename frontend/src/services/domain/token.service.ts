import { type Address } from "viem";

import { logger } from "@/lib/logger";

import { getStoryPublicClient } from "./clients";

export interface TokenBalance {
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

const ERC20_READ_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function getTokenBalance(userAddress: string, tokenAddress: string): Promise<TokenBalance | null> {
  try {
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      logger.warn("getTokenBalance called with zero token address, returning null");
      return null;
    }

    const client = getStoryPublicClient();

    const balance = (await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [userAddress as Address],
    })) as bigint;

    const decimals = (await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_READ_ABI,
      functionName: "decimals",
    })) as number;

    const symbol = (await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_READ_ABI,
      functionName: "symbol",
    })) as string;

    const formattedBalance = (Number(balance) / Math.pow(10, decimals)).toString();

    return {
      address: tokenAddress,
      balance: formattedBalance,
      decimals,
      symbol,
    };
  } catch (error) {
    logger.error("Error getting token balance:", error);
    return null;
  }
}

export async function needsTokenUnlock(userAddress: string, tokenAddress: string): Promise<boolean> {
  try {
    const tokenBalance = await getTokenBalance(userAddress, tokenAddress);

    if (!tokenBalance) {
      return true;
    }

    const balance = Number(tokenBalance.balance);
    return balance <= 0.000001;
  } catch (error) {
    logger.error("Error checking token unlock need:", error);
    return true;
  }
}
