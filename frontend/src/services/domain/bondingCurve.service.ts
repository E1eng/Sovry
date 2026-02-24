import { encodeFunctionData, getAddress, type Address } from "viem";
import { erc20Abi } from "viem";

import { logger } from "@/lib/logger";

import type { PrimaryWalletLike } from "./types";
import { getStoryPublicClient } from "./clients";

function requireAddress(envName: string, value: string | undefined): Address {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${envName} is required but not set in environment variables`);
  }

  try {
    return getAddress(trimmed);
  } catch {
    // Common footgun: values like " 0xabc..." (leading space) make viem treat it as invalid.
    throw new Error(`${envName} must be a valid 0x address (got: "${trimmed}")`);
  }
}

export const SOVRY_LAUNCHPAD_ADDRESS = requireAddress(
  "NEXT_PUBLIC_LAUNCHPAD_ADDRESS",
  process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS,
);

export const SOVRY_ROUTER_ADDRESS = requireAddress(
  "NEXT_PUBLIC_ROUTER_ADDRESS",
  process.env.NEXT_PUBLIC_ROUTER_ADDRESS,
);

export const SOVRY_EXCHANGE_ADDRESS = requireAddress(
  "NEXT_PUBLIC_EXCHANGE_ADDRESS",
  process.env.NEXT_PUBLIC_EXCHANGE_ADDRESS,
);

const DEFAULT_BASE_PRICE_WEI = BigInt(process.env.NEXT_PUBLIC_BASE_PRICE_WEI || "2500000000000000");
const DEFAULT_PRICE_INCREMENT_WEI = BigInt(process.env.NEXT_PUBLIC_PRICE_INCREMENT_WEI || "15625000000");

const LAUNCH_RT_AMOUNT_WEI = 100n * 10n ** 6n;

const SOVRY_LEGACY_LAUNCHPAD_ABI = [
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

const SOVRY_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "rtAddress", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "ipAsset", type: "address" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "symbol", type: "string" },
    ],
    name: "launchToken",
    outputs: [{ internalType: "address", name: "wrapperAddress", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SOVRY_ROUTER_VIEW_ABI = [
  {
    inputs: [],
    name: "factory",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "exchange",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
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
  const _shortMessage = anyErr && typeof anyErr.shortMessage === "string" ? anyErr.shortMessage : "";
  const _errorName =
    anyErr && anyErr.data && typeof anyErr.data.errorName === "string" ? anyErr.data.errorName : "";
  const message = anyErr && typeof anyErr.message === "string" ? anyErr.message : "";

  const cause = anyErr && anyErr.cause ? anyErr.cause : null;
  const causeShortMessage = cause && typeof cause.shortMessage === "string" ? cause.shortMessage : "";
  const causeErrorName =
    cause && cause.data && typeof cause.data.errorName === "string" ? cause.data.errorName : "";

  const errorName = causeErrorName || _errorName;
  const shortMessage = causeShortMessage || _shortMessage;

  if (errorName) {
    return shortMessage ? `${errorName}: ${shortMessage}` : errorName;
  }

  if (shortMessage) {
    return shortMessage;
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
  _launchPercentage: number,
  ipAssetId?: string,
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

    const amountToLock = LAUNCH_RT_AMOUNT_WEI;
    if (userBalance < amountToLock) {
      throw new Error("Insufficient royalty token balance.");
    }

    let isRouterDeployment = false;
    let factoryAddress: Address | null = null;
    let exchangeAddress: Address | null = null;

    try {
      factoryAddress = (await publicClient.readContract({
        address: SOVRY_ROUTER_ADDRESS as Address,
        abi: SOVRY_ROUTER_VIEW_ABI,
        functionName: "factory",
      })) as Address;

      exchangeAddress = (await publicClient.readContract({
        address: SOVRY_ROUTER_ADDRESS as Address,
        abi: SOVRY_ROUTER_VIEW_ABI,
        functionName: "exchange",
      })) as Address;

      if (
        factoryAddress &&
        exchangeAddress &&
        factoryAddress !== "0x0000000000000000000000000000000000000000" &&
        exchangeAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        isRouterDeployment = true;
      }
    } catch {
      isRouterDeployment = false;
    }

    logger.log("🔎 Launch wiring:", {
      mode: isRouterDeployment ? "router/factory" : "legacy-launchpad",
      router: SOVRY_ROUTER_ADDRESS,
      factory: factoryAddress,
      exchange: exchangeAddress,
      legacyLaunchpad: SOVRY_LAUNCHPAD_ADDRESS,
    });

    const approveSpender = (isRouterDeployment ? exchangeAddress : (SOVRY_LAUNCHPAD_ADDRESS as Address)) as Address;

    logger.log("🔐 Approve spender:", approveSpender);

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [approveSpender, amountToLock],
    });

    logger.log("📤 Sending approve transaction for launch token via Dynamic...");
    const approveTxHash = await walletClient.sendTransaction({
      to: actualToken as Address,
      data: approveData,
    });

    logger.log("✅ Launch token approve success! Tx Hash:", approveTxHash);

    try {
      logger.log("⏳ Waiting for approve transaction confirmation...");
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
      });
      if (approveReceipt.status !== "success") {
        logger.error("❌ Approve transaction reverted on-chain:", approveReceipt);
        return {
          success: false,
          approveTxHash,
          error: "Approve transaction reverted on-chain",
        };
      }
    } catch (waitApproveError) {
      logger.error("❌ Error waiting for approve transaction receipt:", waitApproveError);
      return {
        success: false,
        approveTxHash,
        error: mapLaunchError(waitApproveError),
      };
    }

    let launchTo: Address;
    let launchData: `0x${string}`;

    if (isRouterDeployment) {
      if (!ipAssetId || ipAssetId === "0x0000000000000000000000000000000000000000") {
        throw new Error("Missing ipAssetId for launch");
      }
      if (!factoryAddress) {
        throw new Error("Could not resolve factory address from router");
      }

      launchTo = factoryAddress;

      logger.log("🚀 Launch target (factory):", launchTo);

      // Preflight to surface custom errors like CurveParamsLocked / InvalidLaunchAmount.
      await publicClient.simulateContract({
        address: launchTo,
        abi: SOVRY_FACTORY_ABI,
        functionName: "launchToken",
        args: [actualToken as Address, amountToLock, ipAssetId as Address, tokenName, tokenSymbol],
        account: userAddress as Address,
      });

      launchData = encodeFunctionData({
        abi: SOVRY_FACTORY_ABI,
        functionName: "launchToken",
        args: [actualToken as Address, amountToLock, ipAssetId as Address, tokenName, tokenSymbol],
      });
    } else {
      launchTo = SOVRY_LAUNCHPAD_ADDRESS as Address;
      const basePrice = DEFAULT_BASE_PRICE_WEI;
      const priceIncrement = DEFAULT_PRICE_INCREMENT_WEI;

      logger.log("🚀 Launch target (legacy launchpad):", launchTo);

      await publicClient.simulateContract({
        address: launchTo,
        abi: SOVRY_LEGACY_LAUNCHPAD_ABI,
        functionName: "launchToken",
        args: [actualToken as Address, amountToLock, tokenName, tokenSymbol, basePrice, priceIncrement],
        account: userAddress as Address,
      });

      launchData = encodeFunctionData({
        abi: SOVRY_LEGACY_LAUNCHPAD_ABI,
        functionName: "launchToken",
        args: [actualToken as Address, amountToLock, tokenName, tokenSymbol, basePrice, priceIncrement],
      });
    }

    logger.log("📤 Calling launchToken...");
    const launchTxHash = await walletClient.sendTransaction({
      to: launchTo,
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
      const wrapperReader = (isRouterDeployment ? exchangeAddress : (SOVRY_LAUNCHPAD_ADDRESS as Address)) as Address;
      const mapped = (await publicClient.readContract({
        address: wrapperReader,
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
