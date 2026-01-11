import { NextRequest, NextResponse } from 'next/server';
import { getIPAssetById } from '@/services/storyProtocolAPI';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ipId: string }> }
) {
  try {
    const { ipId } = await params;
    
    if (!ipId) {
      return NextResponse.json(
        { error: 'IP ID is required' },
        { status: 400 }
      );
    }

    // Fetch IP asset data from Story Protocol API
    logger.log(`🔍 Fetching metadata for IP ID: ${ipId}`);
    const ipAsset = await getIPAssetById(ipId);
    
    if (!ipAsset) {
      logger.log(`❌ IP Asset not found: ${ipId}`);
      return NextResponse.json(
        { error: 'IP Asset not found' },
        { status: 404 }
      );
    }

    // Format metadata for frontend consumption
    const metadata = {
      ipId: ipAsset.ipId,
      name: ipAsset.name || ipAsset.title || 'Untitled IP Asset',
      description: ipAsset.description || 'No description available',
      image: ipAsset.nftMetadata?.image?.cachedUrl || ipAsset.nftMetadata?.image?.originalUrl || "",
      thumbnail: ipAsset.nftMetadata?.image?.thumbnailUrl || ipAsset.nftMetadata?.image?.cachedUrl || "",
      category: 'IP Asset', // Can be derived from metadata attributes
      owner: ipAsset.ownerAddress,
      tokenId: ipAsset.tokenId,
      collection: {
        name: ipAsset.nftMetadata?.collection?.name || 'Unknown Collection',
        slug: ipAsset.nftMetadata?.collection?.slug || 'unknown',
        bannerImageUrl: ipAsset.nftMetadata?.collection?.bannerImageUrl || ""
      },
      attributes: (ipAsset.nftMetadata as any)?.raw?.attributes || [],
      licenseTerms: ipAsset.licenses?.[0]?.terms || null,
      createdAt: ipAsset.createdAt,
      registrationDate: ipAsset.registrationDate,
      uri: ipAsset.uri,
      metadataUri: ipAsset.ipaMetadataUri,
      // Additional visual metadata
      animation: (ipAsset.nftMetadata as any)?.animation || null,
      externalUrl: (ipAsset.nftMetadata?.collection as any)?.externalUrl || null
    };

    // Cache the response for 5 minutes
    const response = NextResponse.json(metadata);
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    
    return response;
    
  } catch (error) {
    logger.error('Error fetching IP asset metadata:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IP asset metadata' },
      { status: 500 }
    );
  }
}
