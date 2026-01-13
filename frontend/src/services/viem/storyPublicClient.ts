import { createPublicClient, http } from "viem";

import { STORY_RPC_URL } from "@/lib/env";

export type StoryPublicClient = ReturnType<typeof createPublicClient>;

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
