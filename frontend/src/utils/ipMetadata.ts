// IP Metadata Utility Functions
// Used throughout the app to fetch and cache IP asset metadata

interface IPAssetMetadata {
  ipId: string;
  name: string;
  description: string;
  image: string;
  thumbnail: string;
  category: string;
  owner: string;
  tokenId: string;
  collection: {
    name: string;
    slug: string;
    bannerImageUrl: string;
  };
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  licenseTerms?: {
    commercialUse: boolean;
    derivativesAllowed: boolean;
    commercialRevShare: number;
    royaltyPolicy: string;
    transferable: boolean;
    uri: string;
  };
  createdAt: string;
  registrationDate: string;
  uri: string;
  metadataUri: string;
  animation?: any;
  externalUrl?: string;
}

/**
 * Fetch IP asset metadata with caching
 * @param ipId The IP asset ID
 * @returns Promise<IPAssetMetadata | null>
 */
export async function getIPAssetMetadata(_ipId: string): Promise<IPAssetMetadata | null> {
  // Backend metadata API is currently disabled/not available. Return null so
  // callers can fall back to other data sources (Supabase, subgraph, etc.)
  // without attempting to hit a missing /api route.
  return null;
}

/**
 * Fetch multiple IP asset metadata in parallel
 * @param ipIds Array of IP asset IDs
 * @returns Promise<Array<IPAssetMetadata | null>>
 */
export async function getMultipleIPAssetMetadata(ipIds: string[]): Promise<Array<IPAssetMetadata | null>> {
  const promises = ipIds.map(ipId => getIPAssetMetadata(ipId));
  return Promise.all(promises);
}

/**
 * Extract category from attributes or provide default
 * @param metadata IP asset metadata
 * @returns Category string
 */
export function extractCategory(metadata: IPAssetMetadata): string {
  // Try to find category in attributes
  const categoryAttr = metadata.attributes.find(attr => 
    attr.trait_type.toLowerCase().includes('category') ||
    attr.trait_type.toLowerCase().includes('type') ||
    attr.trait_type.toLowerCase().includes('genre')
  );
  
  if (categoryAttr) {
    return categoryAttr.value;
  }
  
  // Fallback to license-based categorization
  if (metadata.licenseTerms) {
    if (metadata.licenseTerms.commercialUse) {
      return 'Commercial IP';
    } else {
      return 'Personal IP';
    }
  }
  
  return 'IP Asset';
}
