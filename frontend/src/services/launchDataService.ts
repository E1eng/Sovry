import { createPublicClient, http, Address, formatEther } from "viem";
import { erc20Abi } from "viem";
import { SOVRY_LAUNCHPAD_ADDRESS } from "./storyProtocolService";
import { getLaunchInfo, getBondingProgress } from "./launchpadService";
import { getIPAssetMetadata } from "@/utils/ipMetadata";
import { extractCategory } from "@/utils/ipMetadata";
import { supabase } from "@/lib/supabaseClient";

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
    name: "getTokenState",
    outputs: [
      {
        components: [
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
            name: "token",
            type: "tuple",
          },
          {
            components: [
              { internalType: "uint256", name: "basePrice", type: "uint256" },
              { internalType: "uint256", name: "priceIncrement", type: "uint256" },
              { internalType: "uint256", name: "currentSupply", type: "uint256" },
              { internalType: "uint256", name: "reserveBalance", type: "uint256" },
              { internalType: "bool", name: "isActive", type: "bool" },
            ],
            internalType: "struct SovryLaunchpad.BondingCurve",
            name: "curve",
            type: "tuple",
          },
          { internalType: "uint256", name: "currentPrice", type: "uint256" },
          { internalType: "uint256", name: "marketCap", type: "uint256" },
          { internalType: "bool", name: "canGraduate", type: "bool" },
          { internalType: "uint256", name: "secondsSinceLaunch", type: "uint256" },
          { internalType: "uint256", name: "secondsToGraduationDelay", type: "uint256" },
        ],
        internalType: "struct SovryLaunchpad.TokenState",
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
  graduated?: boolean;
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
 * Fetch bonding progress for a wrapper token.
 *
 * This reuses the bonding curve target logic from launchpadService
 * (getBondingProgress + LaunchInfo.totalRaised).
 */
async function fetchBondingProgress(wrapperToken: string): Promise<number | null> {
  try {
    const info = await getLaunchInfo(wrapperToken);
    if (!info) return null;
    return getBondingProgress(info);
  } catch (error) {
    console.error(`Error fetching bonding progress for ${wrapperToken}:`, error);
    return null;
  }
}

async function fetchTokenState(
  wrapperToken: string,
  launchpadAddress: string
): Promise<{ marketCap: string | null; currentPrice: string | null; graduated: boolean | null }> {
  try {
    const version = await detectContractVersion(launchpadAddress);
    if (version !== "new") {
      return { marketCap: null, currentPrice: null, graduated: null };
    }

    const rawState = await publicClient.readContract({
      address: launchpadAddress as Address,
      abi: newLaunchpadAbi,
      functionName: "getTokenState",
      args: [wrapperToken as Address],
    });

    const state = rawState as any;
    const marketCap = state?.marketCap as bigint | undefined;
    const currentPrice = state?.currentPrice as bigint | undefined;
    const graduatedRaw = state?.token?.graduated as boolean | undefined;

    return {
      marketCap: marketCap !== undefined ? formatEther(marketCap) : null,
      currentPrice: currentPrice !== undefined ? formatEther(currentPrice) : null,
      graduated: graduatedRaw !== undefined ? Boolean(graduatedRaw) : null,
    };
  } catch (error) {
    console.error(`Error fetching token state for ${wrapperToken}:`, error);
    return { marketCap: null, currentPrice: null, graduated: null };
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
 *
 * We no longer rely on the legacy metadata API or Story Protocol staging
 * API here to avoid noisy 404s. Image URLs for launched tokens are
 * provided via Supabase (see useLaunchDetails) and the UI falls back to a
 * placeholder when none is available.
 */
async function fetchImageUrl(ipId: string | null, rtAddress: string | null): Promise<string | null> {
  try {
    if (!supabase || typeof (supabase as any).from !== "function" || !rtAddress) return null;

    const candidates = new Set<string>();
    candidates.add(rtAddress);
    candidates.add(rtAddress.toLowerCase());

    const { data, error } = await supabase
      .from("launches")
      .select("image_url, royalty_token_address")
      .in("royalty_token_address", Array.from(candidates))
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) {
      return null;
    }

    const row = data[0] as any;
    const imageUrl = row.image_url as string | null | undefined;
    return imageUrl || null;
  } catch (error) {
    console.error("Error fetching image URL from Supabase for RT", rtAddress, error);
    return null;
  }
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
    const [symbol, name, rtAddress, tokenState, bondingProgress] = await Promise.all([
      fetchTokenSymbol(wrapperToken),
      fetchTokenName(wrapperToken),
      getRtAddressFromWrapper(wrapperToken, launchpadAddress),
      fetchTokenState(wrapperToken, launchpadAddress),
      fetchBondingProgress(wrapperToken),
    ]);

    // Resolve backing IP ID from Supabase using the royalty token (RT) address
    // stored at launch time. This gives us the actual IP Account backing the
    // wrapper token instead of incorrectly treating the wrapper as the IP.
    let ipId: string | null = null;
    if (supabase && rtAddress) {
      try {
        const candidates = new Set<string>();
        candidates.add(rtAddress);
        candidates.add(rtAddress.toLowerCase());

        const { data, error } = await supabase
          .from("launches")
          .select("ip_id, royalty_token_address")
          .in("royalty_token_address", Array.from(candidates))
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0] as any;
          const ip = (row.ip_id as string | null | undefined) || null;
          if (ip && ip.startsWith("0x") && ip.length === 42) {
            ipId = ip;
          }
        }
      } catch (e) {
        console.error("Error resolving ipId from Supabase for", wrapperToken, e);
      }
    }

    // Fetch category and image (socials now come exclusively from Supabase)
    const [category, imageUrl] = await Promise.all([
      fetchCategory(ipId),
      fetchImageUrl(ipId, rtAddress),
    ]);

    const enrichedData: EnrichedLaunchData = {
      symbol: symbol || undefined,
      name: name || undefined,
      ipId: ipId || undefined,
      imageUrl: imageUrl || undefined,
      marketCap: tokenState.marketCap || undefined,
      bondingProgress: bondingProgress || undefined,
      category: category || undefined,
      currentPrice: tokenState.currentPrice || undefined,
      rtAddress: rtAddress || undefined,
      graduated: tokenState.graduated ?? undefined,
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
