import { StoryClient } from "@story-protocol/core-sdk";
import { createPublicClient, custom, http, type Address } from "viem";

import { logger } from "@/lib/logger";

import type { PrimaryWalletLike } from "./types";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

type StoryPublicClient = ReturnType<typeof createPublicClient>;

let publicClient: StoryPublicClient | null = null;

export function getStoryPublicClient(): StoryPublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: {
        id: 1315,
        name: "Story Aeneid Testnet",
        nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
        rpcUrls: {
          default: { http: [STORY_RPC_URL] },
        },
        blockExplorers: {
          default: { name: "StoryScan", url: "https://storyscan.xyz" },
        },
      },
      transport: http(STORY_RPC_URL),
    });
  }
  return publicClient;
}

export async function createStoryProtocolClient(primaryWallet?: PrimaryWalletLike): Promise<unknown> {
  if (!primaryWallet) {
    logger.warn("No wallet provided for Story SDK - using read-only client");
    return (
      (StoryClient as any).new?.({
        transport: http(STORY_RPC_URL),
        chainId: 1315,
      }) ||
      new (StoryClient as any)({
        transport: http(STORY_RPC_URL),
        chainId: 1315,
      })
    );
  }

  try {
    if (typeof primaryWallet.getWalletClient !== "function") {
      throw new Error("Wallet does not expose getWalletClient; falling back to address-only client");
    }

    const walletClient = await primaryWallet.getWalletClient();

    const config: any = {
      wallet: walletClient,
      transport: custom((walletClient as any).transport),
      chainId: "aeneid",
    };

    return (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
  } catch (error) {
    logger.error("Error creating Story SDK client with Dynamic wallet:", error);

    const walletAddress = await primaryWallet.address;
    return (
      (StoryClient as any).new?.({
        transport: http(STORY_RPC_URL),
        chainId: 1315,
        account: walletAddress as Address,
      }) ||
      new (StoryClient as any)({
        transport: http(STORY_RPC_URL),
        chainId: 1315,
        account: walletAddress as Address,
      })
    );
  }
}
