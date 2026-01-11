import { encodeFunctionData, type Address } from "viem";
import { erc20Abi } from "viem";

import { logger } from "@/lib/logger";

import type { PrimaryWalletLike } from "./types";
import { getStoryPublicClient } from "./clients";

export const SOVRY_LAUNCHPAD_ADDRESS =
  process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS || "0xABddc4817c287cCc6F1a170Fa3C364e9df2464E6";

const DEFAULT_BASE_PRICE_WEI = BigInt(process.env.NEXT_PUBLIC_BASE_PRICE_WEI || "100000000000");
const DEFAULT_PRICE_INCREMENT_WEI = BigInt(process.env.NEXT_PUBLIC_PRICE_INCREMENT_WEI || "2000000");

const SOVRY_LAUNCHPAD_ABI = [
  {
    inputs: [
      { internalType: "address", name: "rtAddress", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "basePrice", type: "uint256" },
      { internalType: "uint256", name: "priceIncrement", type: "uint256" },
    ],
    name: "launchToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const LAUNCHPAD_VIEW_ABI = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "rtToWrapper",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function mapLaunchError(error: unknown): string {
  const anyErr = error as any;
  const shortMessage = anyErr && typeof anyErr.shortMessage === "string" ? anyErr.shortMessage : "";
  const errorName =
    anyErr && anyErr.data && typeof anyErr.data.errorName === "string" ? anyErr.data.errorName : "";
  const message = anyErr && typeof anyErr.message === "string" ? anyErr.message : "";
  const combined = `${shortMessage} ${message} ${errorName}`;

  if (combined.includes("MinListingRequired") || errorName === "MinListingRequired") {
    return "Minimal launch 25 RT. Please increase the launch percentage or acquire more royalty tokens.";
  }

  if (message) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error launching on bonding curve";
}

export async function launchOnBondingCurveDynamic(
  royaltyTokenAddress: string,
  primaryWallet: PrimaryWalletLike,
  tokenName: string,
  tokenSymbol: string,
  launchPercentage: number,
): Promise<{ success: boolean; approveTxHash?: string; launchTxHash?: string; wrapperAddress?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    logger.log("🔥 Dynamic Launch - WRITE Operation (Sovry Launchpad)");
    logger.log("Launch params:", {
      royaltyToken: royaltyTokenAddress,
      launchpad: SOVRY_LAUNCHPAD_ADDRESS,
      name: tokenName,
      symbol: tokenSymbol,
      percentage: launchPercentage,
    });

    const publicClient = getStoryPublicClient();
    const walletClient = (await primaryWallet.getWalletClient?.()) as any;
    const userAddress = (await primaryWallet.address) as string;

    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    const code = await publicClient.getBytecode({
      address: royaltyTokenAddress as Address,
    });

    if (!code || code === "0x") {
      throw new Error(`Address ${royaltyTokenAddress} is not a contract`);
    }

    logger.log("✅ Launch token address is a contract");

    const actualToken = royaltyTokenAddress as string;

    try {
      const symbol = await publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: "symbol",
      });
      logger.log("✅ Launch token is ERC20, symbol:", symbol);
    } catch (symbolError) {
      throw new Error(`Launch token ${actualToken} is not a valid ERC20: ${symbolError}`);
    }

    const userBalance = (await publicClient.readContract({
      address: actualToken as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [userAddress as Address],
    })) as bigint;

    logger.log("💰 User launch token balance:", userBalance.toString());

    if (userBalance === 0n) {
      throw new Error("You have no royalty tokens to launch. Please Get Royalty Tokens first.");
    }

    const pct = BigInt(Math.min(Math.max(Math.floor(launchPercentage || 0), 25), 100));

    const amountToLock = (userBalance * pct) / 100n;

    if (amountToLock === 0n) {
      throw new Error("Amount to lock is too small for the selected percentage.");
    }

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [SOVRY_LAUNCHPAD_ADDRESS as Address, amountToLock],
    });

    logger.log("📤 Sending approve transaction for launch token via Dynamic...");
    const approveTxHash = await walletClient.sendTransaction({
      to: actualToken as Address,
      data: approveData,
    });

    logger.log("✅ Launch token approve success! Tx Hash:", approveTxHash);

    const basePrice = DEFAULT_BASE_PRICE_WEI;
    const priceIncrement = DEFAULT_PRICE_INCREMENT_WEI;

    const launchData = encodeFunctionData({
      abi: SOVRY_LAUNCHPAD_ABI,
      functionName: "launchToken",
      args: [actualToken as Address, amountToLock, tokenName, tokenSymbol, basePrice, priceIncrement],
    });

    logger.log("📤 Calling SovryLaunchpad.launchToken...");
    const launchTxHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data: launchData,
    });

    try {
      logger.log("⏳ Waiting for launch transaction confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: launchTxHash,
      });

      if (receipt.status !== "success") {
        logger.error("❌ Launch transaction reverted on-chain:", receipt);
        return {
          success: false,
          approveTxHash,
          launchTxHash,
          error: "Launch transaction reverted on-chain",
        };
      }
    } catch (waitError) {
      logger.error("❌ Error waiting for launch transaction receipt:", waitError);
      return {
        success: false,
        approveTxHash,
        launchTxHash,
        error: mapLaunchError(waitError),
      };
    }

    logger.log("✅ SovryLaunchpad launch success! Tx Hash:", launchTxHash);

    let wrapperAddress: string | undefined;
    try {
      const mapped = (await publicClient.readContract({
        address: SOVRY_LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_VIEW_ABI,
        functionName: "rtToWrapper",
        args: [actualToken as Address],
      })) as string;

      if (mapped && mapped !== "0x0000000000000000000000000000000000000000") {
        wrapperAddress = mapped;
      } else {
        logger.warn("rtToWrapper returned zero address for", actualToken);
      }
    } catch (mapError) {
      logger.error("Error reading rtToWrapper from launchpad:", mapError);
    }

    return {
      success: true,
      approveTxHash,
      launchTxHash,
      wrapperAddress,
    };
  } catch (error) {
    logger.error("❌ Launch on bonding curve failed:", error);
    return {
      success: false,
      error: mapLaunchError(error),
    };
  }
}
