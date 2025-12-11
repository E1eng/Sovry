// Story Protocol API Service
// Documentation: https://docs.story.foundation/api-reference
// Staging API: https://staging-api.storyprotocol.net/api/v4

const STORY_API_BASE_URL = 'https://staging-api.storyprotocol.net/api/v4';
const STORY_API_KEY = process.env.NEXT_PUBLIC_STORY_API_KEY || "";

// API Types
export interface StoryAPIResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    limit: number;
    offset: number;
    total: number;
  };
}

export interface IPAsset {
  ancestorsCount: number;
  blockNumber: number;
  chainId: string;
  childrenCount: number;
  createdAt: string;
  descendantsCount: number;
  description: string;
  ipId: string;
  ipaMetadataUri: string;
  isInGroup: boolean;
  lastUpdatedAt: string;
  name: string;
  ownerAddress: string;
  parentsCount: number;
  registrationDate: string;
  rootIPs: string[];
  title: string;
  tokenContract: string;
  tokenId: string;
  txHash: string;
  uri: string;
  nftMetadata?: {
    name: string;
    description: string;
    image: {
      cachedUrl: string;
      originalUrl: string;
      thumbnailUrl: string;
    };
    contract: {
      address: string;
      name: string;
      symbol: string;
    };
    collection: {
      name: string;
      slug: string;
      bannerImageUrl: string;
    };
  };
  licenses?: License[];
}

export interface License {
  createdAt: string;
  licenseTemplateId: string;
  licenseTermsId: string;
  templateName: string;
  terms: {
    commercialUse: boolean;
    derivativesAllowed: boolean;
    transferable: boolean;
    commercialRevShare: number;
    royaltyPolicy: string;
    uri: string;
  };
  licensingConfig: {
    commercialRevShare: number;
    mintingFee: string;
    disabled: boolean;
    isSet: boolean;
  };
}

export interface ListIPAssetsParams {
  includeLicenses?: boolean;
  moderated?: boolean;
  orderBy?: 'blockNumber' | 'createdAt' | 'registrationDate';
  orderDirection?: 'asc' | 'desc';
  pagination?: {
    limit: number;
    offset: number;
  };
  where?: {
    ipIds?: string[];
    ownerAddress?: string;
    tokenContract?: string;
  };
}

// API Functions
export async function listIPAssets(params?: ListIPAssetsParams): Promise<StoryAPIResponse<IPAsset>> {
  try {
    const requestBody = {
      includeLicenses: false,
      moderated: false,
      orderBy: 'blockNumber',
      orderDirection: 'desc',
      pagination: {
        limit: 20,
        offset: 0,
      },
      ...params,
    };

    const response = await fetch(`${STORY_API_BASE_URL}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': STORY_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching IP assets:', error);
    throw error;
  }
}

export async function getIPAssetById(ipId: string): Promise<IPAsset | null> {
  try {
    const response = await listIPAssets({
      where: { ipIds: [ipId] },
      includeLicenses: true,
      pagination: { limit: 1, offset: 0 },
    });

    return response.data[0] || null;
  } catch (error) {
    console.error('Error fetching IP asset by ID:', error);
    return null;
  }
}

export async function getIPAssetsByOwner(ownerAddress: string, limit = 20): Promise<StoryAPIResponse<IPAsset>> {
  try {
    return await listIPAssets({
      where: { ownerAddress },
      pagination: { limit, offset: 0 },
    });
  } catch (error) {
    console.error('Error fetching IP assets by owner:', error);
    throw error;
  }
}

export async function searchIPAssets(searchTerm: string, limit = 20): Promise<StoryAPIResponse<IPAsset>> {
  try {
    const response = await fetch(`${STORY_API_BASE_URL}/assets/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': STORY_API_KEY,
      },
      body: JSON.stringify({
        query: searchTerm,
        pagination: { limit, offset: 0 },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching IP assets:', error);
    throw error;
  }
}

// Helper function to format IP asset for UI
export function formatIPAsset(asset: IPAsset) {
  return {
    ipId: asset.ipId,
    name: asset.name || asset.title || 'Untitled IP Asset',
    description: asset.description || 'No description available',
    image: asset.nftMetadata?.image?.cachedUrl || "",
    license: asset.licenses?.[0]?.templateName || 'All Rights Reserved',
    owner: asset.ownerAddress,
    royaltyBps: asset.licenses?.[0]?.terms?.commercialRevShare || 0,
    tokenContract: asset.tokenContract,
    tokenId: asset.tokenId,
    createdAt: asset.createdAt,
    registrationDate: asset.registrationDate,
    totalLicenses: asset.licenses?.length || 0,
    derivativesCount: asset.childrenCount || 0,
    collectionName: asset.nftMetadata?.collection?.name || 'Unknown Collection',
  };
}

// Pool integration helper
export async function getIPAssetsForPools(): Promise<any[]> {
  try {
    const response = await listIPAssets({
      includeLicenses: true,
      pagination: { limit: 50, offset: 0 },
      orderBy: 'registrationDate',
      orderDirection: 'desc',
    });

    return response.data.map(formatIPAsset);
  } catch (error) {
    console.error('Error fetching IP assets for pools:', error);
    return [];
  }
}
