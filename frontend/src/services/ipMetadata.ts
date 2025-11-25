import { getIPAssetById } from "@/services/storyProtocolAPI";
import type { License } from "@/services/storyProtocolAPI";

const DEFAULT_IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/$/, "") || "https://ipfs.io/ipfs";

export interface ResolvedLicenseTerms extends License["terms"] {
  name?: string;
}

export interface StoryIPMetadata {
  ipId: string;
  title: string;
  description: string;
  image: string | null;
  attributes: Array<{ trait_type: string; value: string }>;
  owner?: string;
  collection?: string;
  licenseTerms: ResolvedLicenseTerms | null;
  metadataUri: string | null;
  metadataGatewayUri: string | null;
  rawMetadata: any;
}

const resolveUri = (uri?: string | null): string | null => {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace("ipfs://", "");
    return `${DEFAULT_IPFS_GATEWAY}/${path}`;
  }
  return uri;
};

export async function fetchIPMetadata(ipId: string): Promise<StoryIPMetadata> {
  if (!ipId) {
    throw new Error("ipId is required to fetch metadata");
  }

  const asset = await getIPAssetById(ipId);
  if (!asset) {
    throw new Error(`IP asset ${ipId} not found on Story Protocol`);
  }

  const metadataUri = asset.ipaMetadataUri || asset.uri || null;
  const metadataGatewayUri = resolveUri(metadataUri);

  let tokenMetadata: any = null;
  if (metadataGatewayUri) {
    try {
      const resp = await fetch(metadataGatewayUri);
      if (resp.ok) {
        tokenMetadata = await resp.json();
      } else {
        console.warn(`Unable to fetch metadata JSON for ${ipId}`, resp.statusText);
      }
    } catch (err) {
      console.warn(`Failed to fetch metadata JSON for ${ipId}`, err);
    }
  }

  const attributes =
    tokenMetadata?.attributes ||
    (asset.nftMetadata as any)?.attributes ||
    tokenMetadata?.properties?.attributes ||
    [];

  const license = asset.licenses?.[0];
  const licenseTerms: ResolvedLicenseTerms | null = license
    ? { ...license.terms, name: license.templateName }
    : null;

  const imageFromMetadata =
    resolveUri(tokenMetadata?.image || tokenMetadata?.image_url) ||
    resolveUri((asset.nftMetadata as any)?.image?.cachedUrl) ||
    resolveUri((asset.nftMetadata as any)?.image?.originalUrl);

  return {
    ipId,
    title:
      tokenMetadata?.title ||
      tokenMetadata?.name ||
      asset.name ||
      asset.title ||
      `IP Asset ${ipId.slice(0, 6)}…${ipId.slice(-4)}`,
    description:
      tokenMetadata?.description || asset.description || "No description available",
    image: imageFromMetadata,
    attributes,
    owner: asset.ownerAddress,
    collection: asset.nftMetadata?.collection?.name,
    licenseTerms,
    metadataUri,
    metadataGatewayUri,
    rawMetadata: tokenMetadata,
  };
}
