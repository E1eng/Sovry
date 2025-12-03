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

// Cache for metadata to avoid repeated API calls
const metadataCache = new Map<string, IPAssetMetadata>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch IP asset metadata with caching
 * @param ipId The IP asset ID
 * @returns Promise<IPAssetMetadata | null>
 */
export async function getIPAssetMetadata(ipId: string): Promise<IPAssetMetadata | null> {
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
 * Clear metadata cache (useful for refresh functionality)
 * @param ipId Optional specific IP ID to clear, or clear all if not provided
 */
export function clearMetadataCache(ipId?: string): void {
  if (ipId) {
    metadataCache.delete(ipId);
  } else {
    metadataCache.clear();
  }
}

/**
 * Get cached metadata without API call (returns null if not cached)
 * @param ipId The IP asset ID
 * @returns IPAssetMetadata | null
 */
export function getCachedMetadata(ipId: string): IPAssetMetadata | null {
  const cached = metadataCache.get(ipId);
  if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_DURATION) {
    return cached;
  }
  return null;
}

/**
 * Format IP asset metadata for display
 * @param metadata Raw IP asset metadata
 * @returns Formatted metadata for UI components
 */
export function formatIPAssetForDisplay(metadata: IPAssetMetadata) {
  return {
    id: metadata.ipId,
    name: metadata.name,
    description: metadata.description,
    image: metadata.image,
    thumbnail: metadata.thumbnail,
    category: metadata.category,
    owner: metadata.owner,
    tokenId: metadata.tokenId,
    collectionName: metadata.collection.name,
    attributes: metadata.attributes,
    licenseTerms: metadata.licenseTerms,
    createdAt: metadata.createdAt,
    registrationDate: metadata.registrationDate,
    // Helper properties
    displayName: metadata.name || `IP Asset #${metadata.tokenId}`,
    displayDescription: metadata.description || 'No description available',
    hasImage: !!metadata.image,
    isLicensed: !!metadata.licenseTerms,
  };
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

/**
 * Generate fallback image URL based on category
 * @param category Asset category
 * @returns Fallback image URL
 */
export function generateFallbackImage(category: string): string {
  const fallbacks: Record<string, string> = {
    'Music': '/placeholders/music.png',
    'Art': '/placeholders/art.png',
    'Gaming': '/placeholders/gaming.png',
    'Photography': '/placeholders/photography.png',
    '3D Art': '/placeholders/3d-art.png',
    'Commercial IP': '/placeholders/commercial.png',
    'Personal IP': '/placeholders/personal.png',
  };
  
  return fallbacks[category] || '/placeholders/ip-asset.png';
}
