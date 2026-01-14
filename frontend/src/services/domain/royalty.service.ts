import { WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";
import { type Address } from "viem";
import { erc20Abi } from "viem";

import { logger } from "@/lib/logger";

import type { PrimaryWalletLike } from "./types";
import { createStoryProtocolClient, getStoryPublicClient } from "./clients";
import { SOVRY_EXCHANGE_ADDRESS } from "./bondingCurve.service";

const ERC20_ABI = [
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
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ROYALTY_MODULE_ABI = [
  {
    inputs: [{ internalType: "address", name: "ipId", type: "address" }],
    name: "getRoyaltyVaultAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function claimRevenueToWalletAndPump(
  ipId: string,
  wrapperToken: string,
  primaryWallet: PrimaryWalletLike,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("Wallet not connected");
    }

    const hasValidIpId = typeof ipId === "string" && ipId.startsWith("0x") && ipId.length === 42;
    if (!hasValidIpId) {
      throw new Error("Invalid IP ID for royalty claim");
    }

    const client = (await createStoryProtocolClient(primaryWallet)) as any;

    const publicClient = getStoryPublicClient();
    const launchpadAddress = SOVRY_EXCHANGE_ADDRESS as Address;

    await client.royalty.claimAllRevenue({
      ancestorIpId: ipId as Address,
      claimer: ipId as Address,
      currencyTokens: [WIP_TOKEN_ADDRESS as Address],
      childIpIds: [],
      royaltyPolicies: [],
      claimOptions: {
        autoTransferAllClaimedTokensFromIp: false,
        autoUnwrapIpTokens: false,
      },
    });

    const wipOnIp = (await publicClient.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [ipId as Address],
    })) as bigint;

    if (wipOnIp === 0n) {
      throw new Error("No WIP balance on IP Account after claim; nothing to harvest");
    }

    const transferResponse = await client.ipAccount.transferErc20({
      ipId: ipId as Address,
      tokens: [
        {
          address: WIP_TOKEN_ADDRESS as Address,
          amount: wipOnIp,
          target: launchpadAddress,
        },
      ],
    });

    if (!transferResponse || !transferResponse.txHash) {
      throw new Error("Failed to transfer WIP from IP Account to launchpad");
    }

    await publicClient.waitForTransactionReceipt({
      hash: transferResponse.txHash as `0x${string}`,
    });

    return { success: true, txHash: transferResponse.txHash };
  } catch (error) {
    logger.error("Error in claimRevenueToWalletAndPump:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to claim and pump royalties",
    };
  }
}

export async function getRoyaltyVaultAddress(ipId: string, primaryWallet?: PrimaryWalletLike): Promise<string | null> {
  try {
    if (
      !ipId ||
      ipId === "0x0000000000000000000000000000000000000000" ||
      !ipId.startsWith("0x") ||
      ipId.length !== 42
    ) {
      logger.warn("Invalid IP ID format:", ipId);
      return null;
    }

    const client = (await createStoryProtocolClient(primaryWallet)) as any;
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);

    return royaltyVaultAddress;
  } catch (error) {
    logger.error("Error getting royalty vault address from SDK:", error);

    try {
      const client = getStoryPublicClient();
      const royaltyModuleAddress =
        process.env.NEXT_PUBLIC_STORY_ROYALTY_MODULE_ADDRESS || "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086";

      const royaltyVaultAddress = await client.readContract({
        address: royaltyModuleAddress as Address,
        abi: ROYALTY_MODULE_ABI,
        functionName: "getRoyaltyVaultAddress",
        args: [ipId as Address],
      });

      return royaltyVaultAddress;
    } catch (contractError) {
      logger.error("Contract call also failed:", contractError);
      logger.error("This IP might not exist or have no royalty vault:", ipId);
      return null;
    }
  }
}

export async function checkRoyaltyTokens(ipId: string, primaryWallet?: PrimaryWalletLike): Promise<boolean> {
  try {
    const royaltyVaultAddress = await getRoyaltyVaultAddress(ipId, primaryWallet);

    return (
      royaltyVaultAddress !== null &&
      royaltyVaultAddress !== undefined &&
      royaltyVaultAddress !== "0x0000000000000000000000000000000000000000"
    );
  } catch (error) {
    logger.error("Error checking royalty tokens:", error);
    return false;
  }
}

export async function getClaimableRoyaltyForIp(ipId: string, primaryWallet?: PrimaryWalletLike): Promise<number> {
  try {
    const royaltyVaultAddress = await getRoyaltyVaultAddress(ipId, primaryWallet);
    if (!royaltyVaultAddress || royaltyVaultAddress === "0x0000000000000000000000000000000000000000") {
      return 0;
    }

    const client = getStoryPublicClient();

    const balance = (await client.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [royaltyVaultAddress as Address],
    })) as bigint;

    if (balance === 0n) {
      return 0;
    }

    const decimals = (await client.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "decimals",
    })) as number;

    const base = 10n ** BigInt(decimals);
    const integer = Number(balance / base);
    const fraction = Number(balance % base) / Number(base);
    return integer + fraction;
  } catch (error) {
    logger.error("Error getting claimable royalty for IP:", error);
    return 0;
  }
}

export interface RoyaltyLockInfo {
  royaltyToken: string;
  symbol: string;
  decimals: number;
  locked: bigint;
  creatorBalance: bigint;
}

export async function getRoyaltyLockInfo(
  royaltyTokenAddress: string,
  creatorAddress: string,
): Promise<RoyaltyLockInfo | null> {
  try {
    const publicClient = getStoryPublicClient();
    let actualToken = royaltyTokenAddress as string;

    try {
      const tokenResult = await publicClient.readContract({
        address: royaltyTokenAddress as Address,
        abi: [
          {
            inputs: [],
            name: "token",
            outputs: [{ internalType: "address", name: "", type: "address" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "token",
      });

      if (tokenResult && tokenResult !== "0x0000000000000000000000000000000000000000") {
        actualToken = tokenResult as string;
      }
    } catch {
      try {
        const assetResult = await publicClient.readContract({
          address: royaltyTokenAddress as Address,
          abi: [
            {
              inputs: [],
              name: "asset",
              outputs: [{ internalType: "address", name: "", type: "address" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "asset",
        });

        if (assetResult && assetResult !== "0x0000000000000000000000000000000000000000") {
          actualToken = assetResult as string;
        }
      } catch {}
    }

    const [decimals, symbol, launchpadBalance, creatorBalance] = await Promise.all([
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: "symbol",
      }) as Promise<string>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [SOVRY_EXCHANGE_ADDRESS as Address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [creatorAddress as Address],
      }) as Promise<bigint>,
    ]);

    return {
      royaltyToken: actualToken,
      symbol,
      decimals,
      locked: launchpadBalance,
      creatorBalance,
    };
  } catch (error) {
    logger.error("Error loading royalty lock info:", error);
    return null;
  }
}
