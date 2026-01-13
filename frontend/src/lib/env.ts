export function getSubgraphUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  if (!raw) {
    throw new Error("NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables");
  }
  return raw;
}

export const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

export const TENDERLY_RPC_URL = process.env.NEXT_PUBLIC_TENDERLY_RPC_URL || STORY_RPC_URL;

export const STORYSCAN_BASE_URL = process.env.NEXT_PUBLIC_STORYSCAN_BASE_URL || "https://aeneid.storyscan.io";

export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/$/, "") || "https://ipfs.io/ipfs";
