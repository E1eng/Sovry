import { logger } from "@/lib/logger";

import type { PrimaryWalletLike } from "./types";
import { getRoyaltyVaultAddress } from "./royalty.service";

const STORY_API_KEY =
  process.env.NEXT_PUBLIC_STORY_API_KEY || "MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U";

const STORY_API_BASE_URL = (process.env.NEXT_PUBLIC_STORY_API_BASE_URL || "https://api.storyapis.com/api/v4").replace(
  /\/$/,
  ""
);

export interface IPAsset {
  ipId: string;
  name: string;
  description: string;
  imageUrl: string;
  mediaType?: string;
  owner: string;
  royaltyVaultAddress: string;
  hasRoyaltyTokens: boolean;
  metadataUri?: string;
  createdAt: string;
}

const WALLET_IP_ASSETS_CACHE_TTL_MS = 60_000;
const walletIpAssetsCache = new Map<string, { assets: IPAsset[]; timestamp: number }>();

export async function fetchWalletIPAssets(walletAddress: string, primaryWallet?: PrimaryWalletLike): Promise<IPAsset[]> {
  try {
    const cacheKey = walletAddress.toLowerCase();
    const cached = walletIpAssetsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WALLET_IP_ASSETS_CACHE_TTL_MS) {
      return cached.assets;
    }

    const listIpAssetsUrl = `${STORY_API_BASE_URL}/assets`;

    const approaches = [
      {
        url: listIpAssetsUrl,
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: "blockNumber",
          orderDirection: "desc",
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress },
        },
      },
      {
        url: listIpAssetsUrl,
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: "blockNumber",
          orderDirection: "desc",
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress.toLowerCase() },
        },
      },
      {
        url: listIpAssetsUrl,
        body: {
          includeLicenses: false,
          moderated: false,
          orderBy: "blockNumber",
          orderDirection: "desc",
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress },
        },
      },
      {
        url: listIpAssetsUrl,
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: "blockNumber",
          orderDirection: "desc",
          pagination: { limit: 100, offset: 0 },
        },
      },
    ];

    let hadOkResponse = false;
    let lastFailureMessage = "";

    for (let i = 0; i < approaches.length; i++) {
      const approach = approaches[i];

      try {
        const response = await fetch(approach.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": STORY_API_KEY,
          },
          body: JSON.stringify(approach.body),
        });

        if (!response.ok) {
          lastFailureMessage = `Story API request failed (${response.status} ${response.statusText})`;
          logger.log(`Approach ${i + 1} failed:`, response.status, response.statusText);
          continue;
        }

        hadOkResponse = true;

        const result = await response.json();

        if (!result.data || result.data.length === 0) {
          continue;
        }

        let assets = result.data;
        if (i === 3) {
          assets = result.data.filter((asset: any) =>
            asset.ownerAddress?.toLowerCase() === walletAddress.toLowerCase() ||
            asset.owner?.toLowerCase() === walletAddress.toLowerCase(),
          );
        }

        if (assets.length === 0) {
          continue;
        }

        const ipAssets: IPAsset[] = await Promise.all(
          assets.map(async (asset: any) => {
            const royaltyVaultAddress = await getRoyaltyVaultAddress(asset.ipId, primaryWallet);
            const hasRoyaltyTokens =
              royaltyVaultAddress !== null &&
              royaltyVaultAddress !== undefined &&
              royaltyVaultAddress !== "0x0000000000000000000000000000000000000000";

            return {
              ipId: asset.ipId,
              name: asset.name || asset.title || `IP Asset ${asset.ipId.slice(0, 8)}`,
              description: asset.description || "IP Asset registered on Story Protocol",
              imageUrl:
                asset.nftMetadata?.image?.cachedUrl ||
                asset.nftMetadata?.image?.originalUrl ||
                "https://example.com/default-ip-image.jpg",
              mediaType: asset.mediaType || asset.nftMetadata?.type || asset.type,
              owner: asset.ownerAddress || asset.owner,
              royaltyVaultAddress: royaltyVaultAddress || "0x0000000000000000000000000000000000000000",
              hasRoyaltyTokens,
              metadataUri: asset.ipaMetadataUri || asset.uri || undefined,
              createdAt: asset.createdAt || new Date().toISOString(),
            };
          }),
        );

        if (ipAssets.length > 0) {
          walletIpAssetsCache.set(cacheKey, {
            assets: ipAssets,
            timestamp: Date.now(),
          });
          return ipAssets;
        }
      } catch (error) {
        lastFailureMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Approach ${i + 1} error:`, error);
      }
    }

    if (hadOkResponse) {
      return [];
    }

    throw new Error(lastFailureMessage || "Failed to fetch IP assets from Story API");
  } catch (error) {
    logger.error("Error fetching wallet IP assets from Story API:", error);

    throw error instanceof Error ? error : new Error("Failed to fetch IP assets from Story API");
  }
}
