export function getSubgraphUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  if (!raw) {
    throw new Error("NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables");
  }
  return raw;
}

const RAW_STORY_RPC_URLS =
  process.env.NEXT_PUBLIC_STORY_RPC_URLS ||
  process.env.NEXT_PUBLIC_STORY_RPC_URL ||
  "https://mainnet.storyrpc.io,https://rpc.ankr.com/story_mainnet";

export const STORY_RPC_URLS = RAW_STORY_RPC_URLS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const STORY_RPC_URL = STORY_RPC_URLS[0] || "https://mainnet.storyrpc.io";

export const TENDERLY_RPC_URL = process.env.NEXT_PUBLIC_TENDERLY_RPC_URL || STORY_RPC_URL;

export const STORYSCAN_BASE_URL = process.env.NEXT_PUBLIC_STORYSCAN_BASE_URL || "https://www.storyscan.io";

export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/$/, "") || "https://ipfs.io/ipfs";

export function getLaunchpadAddress(): `0x${string}` {
  const raw = process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS;
  if (!raw) {
    throw new Error("NEXT_PUBLIC_LAUNCHPAD_ADDRESS is required but not set in environment variables");
  }
  return raw as `0x${string}`;
}
