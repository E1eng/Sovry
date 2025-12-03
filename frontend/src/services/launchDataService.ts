import { createPublicClient, http, Address, formatEther, parseEther } from "viem";
import { erc20Abi } from "viem";
import { SOVRY_LAUNCHPAD_ADDRESS } from "./storyProtocolService";
import { getLaunchInfo, getBondingProgress, type LaunchInfo } from "./launchpadService";
import { getIPAssetMetadata } from "@/utils/ipMetadata";
import { extractCategory } from "@/utils/ipMetadata";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

// New contract ABI (with getMarketCap, getBondingCurve, etc.)
const newLaunchpadAbi = [
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getMarketCap",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getBondingCurve",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "basePrice", type: "uint256" },
          { internalType: "uint256", name: "priceIncrement", type: "uint256" },
          { internalType: "uint256", name: "currentSupply", type: "uint256" },
          { internalType: "uint256", name: "reserveBalance", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" },
        ],
        internalType: "struct SovryLaunchpad.BondingCurve",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getTokenInfo",
    outputs: [
      {
        components: [
          { internalType: "address", name: "rtAddress", type: "address" },
          { internalType: "address", name: "wrapperAddress", type: "address" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "uint256", name: "launchTime", type: "uint256" },
          { internalType: "uint256", name: "totalLocked", type: "uint256" },
          { internalType: "bool", name: "graduated", type: "bool" },
          { internalType: "uint256", name: "totalRoyaltiesHarvested", type: "uint256" },
          { internalType: "address", name: "vaultAddress", type: "address" },
          { internalType: "uint256", name: "dexReserve", type: "uint256" },
          { internalType: "uint256", name: "initialCurveSupply", type: "uint256" },
        ],
        internalType: "struct SovryLaunchpad.LaunchedToken",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getCurrentPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "wrapperToRt",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
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

// Cache for contract version detection
const contractVersionCache = new Map<string, "new" | "old">();

// Cache for token data
const tokenDataCache = new Map<string, { data: EnrichedLaunchData; timestamp: number }>();
// During active development we want marketCap and bondingProgress to update
// immediately after trades, so we effectively disable caching by setting the
// duration to 0. Increase this later if RPC load becomes a concern.
const CACHE_DURATION = 0; // milliseconds

export interface EnrichedLaunchData {
  symbol?: string;
  name?: string;
  ipId?: string;
  imageUrl?: string;
  marketCap?: string;
  bondingProgress?: number;
  category?: string;
  currentPrice?: string;
  rtAddress?: string;
}

/**
 * Detect which contract version is deployed
 */
async function detectContractVersion(launchpadAddress: string): Promise<"new" | "old"> {
  const cached = contractVersionCache.get(launchpadAddress);
  if (cached) return cached;

  // Frontend is wired against latest SovryLaunchpad deployment on Aeneid
  // which exposes getMarketCap/getBondingCurve/getTokenInfo. To avoid
  // false "old" detection from probing a dummy wrapper, we always
  // treat this address as the new contract.
  contractVersionCache.set(launchpadAddress, "new");
  return "new";
}

/**
 * Fetch token symbol from ERC20 contract
 */
async function fetchTokenSymbol(tokenAddress: string): Promise<string | null> {
  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "symbol",
    });
    return symbol as string;
  } catch (error) {
    console.error(`Error fetching symbol for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fetch token name from ERC20 contract
 */
async function fetchTokenName(tokenAddress: string): Promise<string | null> {
  try {
    const name = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "name",
    });
    return name as string;
  } catch (error) {
    console.error(`Error fetching name for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get RT address from wrapper token using contract
 */
async function getRtAddressFromWrapper(
  wrapperToken: string,
  launchpadAddress: string
): Promise<string | null> {
  try {
    const version = await detectContractVersion(launchpadAddress);
    if (version === "new") {
      const rtAddress = await publicClient.readContract({
        address: launchpadAddress as Address,
        abi: newLaunchpadAbi,
        functionName: "wrapperToRt",
        args: [wrapperToken as Address],
      });
      return rtAddress as string;
    } else {
      // Old contract - get from launchInfo
      const launchInfo = await getLaunchInfo(wrapperToken);
      return launchInfo?.royaltyToken || null;
    }
  } catch (error) {
    console.error(`Error getting RT address for ${wrapperToken}:`, error);
    return null;
  }
}

/**
 * Resolve IP ID from RT address (this is complex - RT is the royalty vault)
 * For now, we'll try to fetch IP metadata by querying Story Protocol API
 * with the RT address, or we can try to reverse lookup
 */
async function resolveIpIdFromRt(rtAddress: string): Promise<string | null> {
  // Note: This is a simplified approach. In production, you might need
  // to query Story Protocol's subgraph or use a reverse mapping service
  // For now, we'll return null and let the UI handle it
  // The IP ID can be fetched from metadata API if available
  return null;
}

/**
 * Fetch market cap for a token
 */
async function fetchMarketCap(
  wrapperToken: string,
  launchpadAddress: string
): Promise<string | null> {
  try {
    const version = await detectContractVersion(launchpadAddress);
    
    if (version === "new") {
      try {
        const marketCap = await publicClient.readContract({
          address: launchpadAddress as Address,
          abi: newLaunchpadAbi,
          functionName: "getMarketCap",
          args: [wrapperToken as Address],
        });
        return formatEther(marketCap as bigint);
      } catch (error) {
        console.error(`Error fetching market cap (new contract) for ${wrapperToken}:`, error);
        return null;
      }
    } else {
      // Old contract - calculate from totalRaised
      const launchInfo = await getLaunchInfo(wrapperToken);
      if (!launchInfo) return null;
      
      // Approximate market cap = totalRaised (in IP)
      return formatEther(launchInfo.totalRaised);
    }
  } catch (error) {
    console.error(`Error fetching market cap for ${wrapperToken}:`, error);
    return null;
  }
}

/**
 * Fetch bonding curve progress
 */
async function fetchBondingProgress(wrapperToken: string): Promise<number> {
  try {
    const launchInfo = await getLaunchInfo(wrapperToken);
    return getBondingProgress(launchInfo);
  } catch (error) {
    console.error(`Error fetching bonding progress for ${wrapperToken}:`, error);
    return 0;
  }
}

/**
 * Fetch current price
 */
async function fetchCurrentPrice(
  wrapperToken: string,
  launchpadAddress: string
): Promise<string | null> {
  try {
    const version = await detectContractVersion(launchpadAddress);
    
    if (version === "new") {
      try {
        const price = await publicClient.readContract({
          address: launchpadAddress as Address,
          abi: newLaunchpadAbi,
          functionName: "getCurrentPrice",
          args: [wrapperToken as Address],
        });
        return formatEther(price as bigint);
      } catch (error) {
        console.error(`Error fetching current price (new contract) for ${wrapperToken}:`, error);
        return null;
      }
    } else {
      // Old contract - calculate from bonding curve formula
      // This would require curve parameters which aren't easily accessible
      return null;
    }
  } catch (error) {
    console.error(`Error fetching current price for ${wrapperToken}:`, error);
    return null;
  }
}

/**
 * Fetch IP metadata and extract category
 */
async function fetchCategory(ipId: string | null): Promise<string> {
  if (!ipId) return "IP Asset";
  
  try {
    const metadata = await getIPAssetMetadata(ipId);
    if (metadata) {
      return extractCategory(metadata);
    }
  } catch (error) {
    console.error(`Error fetching category for IP ${ipId}:`, error);
  }
  
  return "IP Asset";
}

/**
 * Fetch IP image URL
 */
async function fetchImageUrl(ipId: string | null, rtAddress: string | null): Promise<string | null> {
  if (ipId) {
    try {
      const metadata = await getIPAssetMetadata(ipId);
      if (metadata?.image) {
        return metadata.image;
      }
    } catch (error) {
      console.error(`Error fetching image for IP ${ipId}:`, error);
    }
  }
  
  // Try Story Protocol API with RT address as fallback
  if (rtAddress) {
    try {
      const response = await fetch(`https://staging-api.storyprotocol.net/api/v4/assets/${rtAddress}`);
      if (response.ok) {
        const data = await response.json();
        return data?.metadata?.image || data?.image || null;
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  return null;
}

/**
 * Enrich a single launch with additional data
 */
export async function enrichLaunchData(
  wrapperToken: string,
  launchpadAddress: string = SOVRY_LAUNCHPAD_ADDRESS
): Promise<EnrichedLaunchData> {
  // Check cache
  const cached = tokenDataCache.get(wrapperToken);
  if (CACHE_DURATION > 0 && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Fetch data in parallel
    const [symbol, name, rtAddress, marketCap, bondingProgress, currentPrice] = await Promise.all([
      fetchTokenSymbol(wrapperToken),
      fetchTokenName(wrapperToken),
      getRtAddressFromWrapper(wrapperToken, launchpadAddress),
      fetchMarketCap(wrapperToken, launchpadAddress),
      fetchBondingProgress(wrapperToken),
      fetchCurrentPrice(wrapperToken, launchpadAddress),
    ]);

    // Resolve IP ID (for now, we'll try to get it from metadata API if RT address is available)
    let ipId: string | null = null;
    if (rtAddress) {
      // Try to fetch IP metadata using RT address
      // In a real implementation, you might query a subgraph or use Story Protocol's API
      // For now, we'll leave it as null and let the UI handle it
    }

    // Fetch category and image
    const [category, imageUrl] = await Promise.all([
      fetchCategory(ipId),
      fetchImageUrl(ipId, rtAddress),
    ]);

    const enrichedData: EnrichedLaunchData = {
      symbol: symbol || undefined,
      name: name || undefined,
      ipId: ipId || undefined,
      imageUrl: imageUrl || undefined,
      marketCap: marketCap || undefined,
      bondingProgress: bondingProgress || undefined,
      category: category || undefined,
      currentPrice: currentPrice || undefined,
      rtAddress: rtAddress || undefined,
    };

    // Cache the result
    tokenDataCache.set(wrapperToken, {
      data: enrichedData,
      timestamp: Date.now(),
    });

    return enrichedData;
  } catch (error) {
    console.error(`Error enriching launch data for ${wrapperToken}:`, error);
    return {};
  }
}

/**
 * Batch enrich multiple launches
 */
export async function enrichLaunchesData(
  wrapperTokens: string[],
  launchpadAddress: string = SOVRY_LAUNCHPAD_ADDRESS
): Promise<Map<string, EnrichedLaunchData>> {
  const results = new Map<string, EnrichedLaunchData>();
  
  // Process in batches to avoid overwhelming the RPC
  const batchSize = 5;
  for (let i = 0; i < wrapperTokens.length; i += batchSize) {
    const batch = wrapperTokens.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((token) => enrichLaunchData(token, launchpadAddress))
    );
    
    batch.forEach((token, index) => {
      results.set(token, batchResults[index]);
    });
  }
  
  return results;
}

/**
 * Format market cap for display
 */
export function formatMarketCap(marketCap: string | undefined): string {
  if (!marketCap) return "—";
  
  const num = parseFloat(marketCap);
  if (isNaN(num)) return "—";
  
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M IP`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K IP`;
  } else {
    return `${num.toFixed(2)} IP`;
  }
}
