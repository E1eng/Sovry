import { Address, formatEther } from "viem";
import { erc20Abi } from "viem";
import { SOVRY_EXCHANGE_ADDRESS, SOVRY_LAUNCHPAD_ADDRESS } from "./storyProtocolService";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";
import { getStoryPublicClient } from "@/services/viem/storyPublicClient";

const publicClient = getStoryPublicClient();

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

  // Frontend is wired against latest SovryLaunchpad deployment
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
    logger.error(`Error fetching symbol for ${tokenAddress}:`, error);
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
    const { getLaunchInfo, getBondingProgress } = await import("./launchpadService");
    const info = await getLaunchInfo(wrapperToken);
    if (!info) return null;
    return getBondingProgress(info);
  } catch (error) {
    logger.error(`Error fetching bonding progress for ${wrapperToken}:`, error);
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

    const { newLaunchpadAbi } = await import("./launchpadService");

    const [tokenInfoRaw, curveRaw, marketCapRaw] = await Promise.all([
      publicClient.readContract({
        address: launchpadAddress as Address,
        abi: newLaunchpadAbi,
        functionName: "launchedTokens",
        args: [wrapperToken as Address],
      }),
      publicClient.readContract({
        address: launchpadAddress as Address,
        abi: newLaunchpadAbi,
        functionName: "bondingCurves",
        args: [wrapperToken as Address],
      }),
      publicClient.readContract({
        address: launchpadAddress as Address,
        abi: newLaunchpadAbi,
        functionName: "getMarketCap",
        args: [wrapperToken as Address],
      }),
    ]);

    const tokenInfo = tokenInfoRaw as any;
    const curve = curveRaw as any;

    const wrapperAddress = (tokenInfo?.wrapperAddress ?? tokenInfo?.[1]) as string | undefined;
    if (!wrapperAddress || wrapperAddress === "0x0000000000000000000000000000000000000000") {
      return { marketCap: null, currentPrice: null, graduated: null };
    }

    const graduatedRaw = (tokenInfo?.graduated ?? tokenInfo?.[6]) as boolean | undefined;

    const basePrice = BigInt(curve?.basePrice ?? curve?.[0] ?? 0n);
    const priceIncrement = BigInt(curve?.priceIncrement ?? curve?.[1] ?? 0n);
    const currentSupply = BigInt(curve?.currentSupply ?? curve?.[2] ?? 0n);
    const initialCurveSupply = BigInt(tokenInfo?.initialCurveSupply ?? tokenInfo?.[10] ?? 0n);

    // Mirror the Exchange math: WRAP_UNIT = 1e18 because wrapper token uses 18 decimals.
    const WRAP_UNIT_EXCHANGE = 10n ** 18n;
    const soldRaw = initialCurveSupply > currentSupply ? initialCurveSupply - currentSupply : 0n;
    const soldUnits = soldRaw / WRAP_UNIT_EXCHANGE;
    const currentPriceWei = basePrice + soldUnits * priceIncrement;

    const marketCapWei = BigInt((marketCapRaw as bigint | undefined) ?? 0n);

    return {
      marketCap: formatEther(marketCapWei),
      currentPrice: currentPriceWei > 0n ? formatEther(currentPriceWei) : null,
      graduated: graduatedRaw !== undefined ? Boolean(graduatedRaw) : null,
    };
  } catch (error) {
    logger.error(`Error fetching token state for ${wrapperToken}:`, error);
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
    logger.error(`Error fetching name for ${tokenAddress}:`, error);
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
      const { newLaunchpadAbi } = await import("./launchpadService");
      const rtAddress = await publicClient.readContract({
        address: launchpadAddress as Address,
        abi: newLaunchpadAbi,
        functionName: "wrapperToRt",
        args: [wrapperToken as Address],
      });
      return rtAddress as string;
    } else {
      // Old contract - get from launchInfo
      const { getLaunchInfo } = await import("./launchpadService");
      const launchInfo = await getLaunchInfo(wrapperToken);
      return launchInfo?.royaltyToken || null;
    }
  } catch (error) {
    logger.error(`Error getting RT address for ${wrapperToken}:`, error);
    return null;
  }
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
    logger.error("Error fetching image URL from Supabase for RT", rtAddress, error);
    return null;
  }
}

/**
 * Enrich a single launch with additional data
 */
export async function enrichLaunchData(
  wrapperToken: string,
  launchpadAddress: string = SOVRY_EXCHANGE_ADDRESS || SOVRY_LAUNCHPAD_ADDRESS
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
        logger.error("Error resolving ipId from Supabase for", wrapperToken, e);
      }
    }

    // Fetch category and image (socials now come exclusively from Supabase)
    const imageUrl = await fetchImageUrl(ipId, rtAddress);

    const enrichedData: EnrichedLaunchData = {
      symbol: symbol || undefined,
      name: name || undefined,
      ipId: ipId || undefined,
      imageUrl: imageUrl || undefined,
      marketCap: tokenState.marketCap || undefined,
      bondingProgress: bondingProgress || undefined,
      category: "IP Asset",
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
    logger.error(`Error enriching launch data for ${wrapperToken}:`, error);
    return {};
  }
}

/**
 * Batch enrich multiple launches
 */
export async function enrichLaunchesData(
  wrapperTokens: string[],
  launchpadAddress: string = SOVRY_EXCHANGE_ADDRESS || SOVRY_LAUNCHPAD_ADDRESS
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
