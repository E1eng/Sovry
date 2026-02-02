import { createPublicClient, http } from "viem";

import { STORY_RPC_URL, STORYSCAN_BASE_URL } from "@/lib/env";

export type StoryPublicClient = ReturnType<typeof createPublicClient>;

let publicClient: StoryPublicClient | null = null;

export function getStoryPublicClient(): StoryPublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: {
        id: 1514,
        name: "Story Mainnet",
        nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
        rpcUrls: {
          default: { http: [STORY_RPC_URL] },
        },
        blockExplorers: {
          default: { name: "StoryScan", url: STORYSCAN_BASE_URL },
        },
      },
      transport: http(STORY_RPC_URL),
    });
  }

  return publicClient;
}
