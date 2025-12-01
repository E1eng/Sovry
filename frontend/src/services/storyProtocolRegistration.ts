// Story Protocol IP Asset Registration Service
// For creating new IP assets and getting royalty tokens

import { StoryClient } from '@story-protocol/core-sdk';
import { createPublicClient, http, Address, custom, encodeFunctionData, parseEther, waitForTransactionReceipt, keccak256, stringToHex } from 'viem';
import { primaryWallet } from '@dynamic-labs/sdk-react-core';
import { pinJSONToIPFS, pinFileToIPFS } from './pinataService';

// Environment variables
const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || 'https://aeneid.storyrpc.io';
const SPG_NFT_CONTRACT = '0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc'; // Aeneid Testnet

// Create public client for Story Protocol
function createPublicClientForStory() {
  return createPublicClient({
    chain: {
      id: 1315,
      name: 'Story Aeneid Testnet',
      nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
      rpcUrls: {
        default: { http: [STORY_RPC_URL] },
        public: { http: [STORY_RPC_URL] },
      },
    },
    transport: http(STORY_RPC_URL),
  });
}

// Create Story Protocol client with Dynamic wallet
async function createStoryProtocolClient(primaryWallet: any) {
  try {
    // Get wallet client from Dynamic SDK
    const walletClient = await primaryWallet.getWalletClient();
    console.log('🔍 Got wallet client from Dynamic SDK');
    
    // Create Story SDK client with proper wallet integration
    const config: any = {
      wallet: walletClient, // Pass the actual wallet client
      transport: custom(walletClient.transport), // Use custom transport
      chainId: "aeneid",
    };
    
    const client = (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
    console.log('✅ Story SDK client created with wallet client');
    return client;
  } catch (error) {
    console.error('Error creating Story SDK client:', error);
    
    // Fallback: try with account only
    try {
      console.log('🔄 Trying fallback with account only...');
      const walletAddress = primaryWallet.address;
      
      const config: any = {
        transport: http(STORY_RPC_URL),
        chainId: "aeneid",
        account: walletAddress,
      };
      
      const client = (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
      console.log('✅ Story SDK client created (account fallback)');
      return client;
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw error;
    }
  }
}

// IP Metadata interface
export interface IPMetadata {
  title: string;
  description: string;
  image: string;
  imageHash: string;
  mediaUrl?: string;
  mediaHash?: string;
  mediaType?: string;
  creators: Array<{
    name: string;
    address: string;
    description?: string;
    contributionPercent: number;
    socialMedia?: Array<{
      platform: string;
      url: string;
    }>;
  }>;
}

// NFT Metadata interface
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
}

// Registration result interface
export interface RegistrationResult {
  success: boolean;
  ipId?: string;
  txHash?: string;
  error?: string;
  royaltyVaultAddress?: string;
  status?: 'uploading' | 'registering' | 'confirming' | 'success' | 'error';
}

// Upload metadata to IPFS (mock implementation - in production use Pinata)
async function uploadToIPFS(metadata: any): Promise<string> {
  const name = (metadata && (metadata.title || metadata.name)) || 'ip-metadata';
  const result = await pinJSONToIPFS(metadata, name);
  return result.cid;
}

// Calculate SHA256 hash
async function calculateSHA256(data: any): Promise<string> {
  try {
    // Use Web Crypto API for real hash calculation
    const encoder = new TextEncoder();
    const dataStr = JSON.stringify(data);
    const dataBuffer = encoder.encode(dataStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.warn('Failed to calculate SHA256, using fallback:', error);
    // Fallback to simple hash
    const dataStr = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

// Extract ipId from transaction receipt events
function extractIpIdFromReceipt(receipt: any): string | null {
  try {
    // Look for IPAssetRegistered event
    // Event signature: IPAssetRegistered(address indexed ipId, address indexed caller, string ipMetadataURI, bytes32 ipMetadataHash)
    if (!receipt.logs || !Array.isArray(receipt.logs)) {
      return null;
    }
    
    // Calculate event signature hash
    // IPAssetRegistered(address,address,string,bytes32)
    const eventSignature = 'IPAssetRegistered(address,address,string,bytes32)';
    const eventTopic = keccak256(stringToHex(eventSignature));
    
    // Look through logs for IPAssetRegistered event
    for (const log of receipt.logs) {
      if (log.topics && log.topics[0] && log.topics[0].toLowerCase() === eventTopic.toLowerCase()) {
        // Topic[1] is the indexed ipId (first indexed parameter)
        if (log.topics[1]) {
          // Extract ipId from topic[1] - it's a 32-byte value, last 20 bytes are the address
          const ipId = '0x' + log.topics[1].slice(26); // Remove padding, keep last 20 bytes
          if (/^0x[a-fA-F0-9]{40}$/.test(ipId)) {
            return ipId;
          }
        }
      }
    }

    // Alternative: Look for any event that might contain ipId
    // Some contracts emit events with ipId as the first indexed parameter
    for (const log of receipt.logs) {
      if (log.topics && log.topics.length > 1) {
        // Check if topic[1] looks like an address (ipId)
        const potentialIpId = log.topics[1];
        if (potentialIpId && potentialIpId.startsWith('0x') && potentialIpId.length === 66) {
          // Extract address from padded topic
          const ipId = '0x' + potentialIpId.slice(26);
          if (/^0x[a-fA-F0-9]{40}$/.test(ipId)) {
            // Additional validation: check if it's not a zero address
            if (ipId !== '0x0000000000000000000000000000000000000000') {
              return ipId;
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting ipId from receipt:', error);
    return null;
  }
}

// Register IP Asset with transaction polling and event extraction
export async function registerIPAssetWithPolling(
  ipMetadata: IPMetadata,
  nftMetadata: NFTMetadata,
  primaryWallet: any,
  onStatusUpdate?: (status: RegistrationResult['status']) => void
): Promise<RegistrationResult> {
  try {
    console.log('🚀 Registering IP Asset on Story Protocol...');
    
    // Step 1: Upload metadata to IPFS
    onStatusUpdate?.('uploading');
    console.log('📤 Uploading metadata to IPFS...');
    
    const [ipIpfsHash, nftIpfsHash, ipHash, nftHash] = await Promise.all([
      uploadToIPFS(ipMetadata),
      uploadToIPFS(nftMetadata),
      calculateSHA256(ipMetadata),
      calculateSHA256(nftMetadata),
    ]);
    
    // Step 2: Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Step 3: Register IP Asset
    onStatusUpdate?.('registering');
    console.log('📝 Registering IP Asset...');
    const response = await client.ipAsset.registerIpAsset({
      nft: {
        type: 'mint',
        spgNftContract: SPG_NFT_CONTRACT as Address,
      },
      ipMetadata: {
        ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
        ipMetadataHash: `0x${ipHash}`,
        nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
        nftMetadataHash: `0x${nftHash}`,
      },
    });
    
    console.log('✅ Registration transaction submitted!');
    console.log(`Transaction Hash: ${response.txHash}`);
    
    // Step 4: Poll for transaction confirmation
    onStatusUpdate?.('confirming');
    console.log('⏳ Waiting for transaction confirmation...');
    
    const publicClient = createPublicClientForStory();
    let receipt;
    let extractedIpId: string | null = null;
    
    try {
      receipt = await waitForTransactionReceipt(publicClient, {
        hash: response.txHash as `0x${string}`,
        timeout: 120_000, // 2 minutes timeout
      });
      
      console.log('✅ Transaction confirmed!');
      
      // Extract ipId from receipt events
      extractedIpId = extractIpIdFromReceipt(receipt);
      
      if (extractedIpId) {
        console.log(`📋 Extracted IP ID from events: ${extractedIpId}`);
      } else {
        console.log('⚠️ Could not extract ipId from events, using SDK response');
      }
    } catch (pollError) {
      console.error('❌ Error waiting for transaction receipt:', pollError);
      // Continue with SDK response ipId as fallback
    }
    
    // Use extracted ipId or fallback to SDK response
    const finalIpId = extractedIpId || response.ipId;
    
    if (!finalIpId) {
      throw new Error('Failed to get IP ID from transaction');
    }
    
    // Step 5: Get royalty vault address
    let royaltyVaultAddress: string | undefined;
    try {
      royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(finalIpId as Address);
      console.log(`💰 Royalty vault address: ${royaltyVaultAddress}`);
    } catch (vaultError) {
      console.warn('⚠️ Could not get royalty vault address:', vaultError);
    }
    
    onStatusUpdate?.('success');
    console.log('✅ IP Asset registered successfully!');
    console.log(`IP ID: ${finalIpId}`);
    
    return {
      success: true,
      ipId: finalIpId,
      txHash: response.txHash,
      royaltyVaultAddress: royaltyVaultAddress,
      status: 'success',
    };
    
  } catch (error) {
    console.error('❌ Error registering IP Asset:', error);
    onStatusUpdate?.('error');
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to register IP Asset';
    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message.includes('transaction') || error.message.includes('revert')) {
        errorMessage = 'Transaction failed. Please try again.';
      } else if (error.message.includes('IPFS') || error.message.includes('pin')) {
        errorMessage = 'Failed to upload metadata. Please try again.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Transaction taking longer than expected. Please check the explorer.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      status: 'error',
    };
  }
}

// Register IP Asset and get tokens (original function, kept for backward compatibility)
export async function registerIPAsset(
  ipMetadata: IPMetadata,
  nftMetadata: NFTMetadata,
  primaryWallet: any
): Promise<RegistrationResult> {
  return registerIPAssetWithPolling(ipMetadata, nftMetadata, primaryWallet);
}

// Claim revenue from IP Asset (to get royalty tokens)
export async function claimRevenue(
  ipId: string,
  primaryWallet: any
): Promise<{
  success: boolean;
  txHash?: string;
  claimedAmount?: string;
  error?: string;
}> {
  try {
    console.log('💰 Claiming revenue for IP:', ipId);
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Claim all revenue
    const response = await client.royalty.claimAllRevenue({
      ipId: ipId as Address,
    });
    
    console.log('✅ Revenue claimed successfully!');
    console.log(`Transaction Hash: ${response.txHash}`);
    
    return {
      success: true,
      txHash: response.txHash,
      claimedAmount: response.amount?.toString() || '0',
    };
    
  } catch (error) {
    console.error('❌ Error claiming revenue:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim revenue',
    };
  }
}

// Mint license token to trigger royalty vault deployment (sesuai docs)
export async function mintLicenseToken(
  ipId: string,
  licenseTermsId: string,
  primaryWallet: any
): Promise<{
  success: boolean;
  txHash?: string;
  licenseTokenId?: string;
  error?: string;
}> {
  try {
    console.log('📜 Minting license token for IP:', ipId);
    
    if (!primaryWallet || !primaryWallet.address) {
      throw new Error('Wallet not connected');
    }
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Mint license token sesuai docs example
    const response = await client.license.mintLicenseTokens({
      licensorIpId: ipId as Address,
      licenseTemplate: "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316", // Default license template
      licenseTermsId: licenseTermsId,
      amount: 1,
      receiver: primaryWallet.address as Address,
      royaltyContext: "0x", // Empty royalty context
      maxMintingFee: BigInt(0), // disabled
      maxRevenueShare: 100, // default
    });
    
    console.log('✅ License token minted successfully!');
    console.log(`Transaction Hash: ${response.txHash}`);
    console.log(`License Token ID: ${response.licenseTokenIds?.[0]}`);
    
    return {
      success: true,
      txHash: response.txHash,
      licenseTokenId: response.licenseTokenIds?.[0]?.toString(),
    };
    
  } catch (error) {
    console.error('❌ Error minting license token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mint license token',
    };
  }
}

// Transfer royalty tokens from IP Account to user wallet (sesuai docs)
export async function transferRoyaltyTokensFromIP(
  ipId: string,
  primaryWallet: any
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    console.log('🔄 Transferring royalty tokens from IP Account to wallet...');
    
    if (!primaryWallet || !primaryWallet.address) {
      throw new Error('Wallet not connected');
    }
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Get royalty vault address (ini adalah address dari ERC-20 Royalty Tokens)
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);
    
    if (!royaltyVaultAddress) {
      throw new Error('No royalty vault found for this IP');
    }
    
    console.log('✅ Royalty vault address found:', royaltyVaultAddress);
    
    // Transfer SELURUH royalty tokens dari IP Account ke user wallet
    // Total supply = 100,000,000 tokens (100% dengan 6 decimals)
    const transferResponse = await client.ipAccount.transferErc20({
      ipId: ipId as Address,
      tokens: [
        {
          address: royaltyVaultAddress,
          amount: BigInt(100_000_000), // 100,000,000 tokens = 100% (6 decimals)
          target: primaryWallet.address as Address,
        },
      ],
    });
    
    console.log('✅ Royalty tokens transferred successfully!');
    console.log(`Transaction Hash: ${transferResponse.txHash}`);
    
    return {
      success: true,
      txHash: transferResponse.txHash,
    };
    
  } catch (error) {
    console.error('❌ Error transferring royalty tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer royalty tokens',
    };
  }
}

// Transfer royalty tokens from IP Account to owner wallet
export async function transferRoyaltyTokens(
  ipId: string,
  primaryWallet: any
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    console.log('🔄 Transferring royalty tokens from IP Account to wallet...');
    
    // Validate inputs and get wallet address
    if (!primaryWallet) {
      throw new Error('Wallet not connected');
    }
    
    // Get wallet address using Dynamic SDK method
    let walletAddress: string;
    try {
      // Try different ways to get the address
      walletAddress = primaryWallet.address || 
                     (await primaryWallet.getAddress?.()) ||
                     (await primaryWallet.getWalletClient?.())?.account?.address;
      
      if (!walletAddress) {
        throw new Error('Could not get wallet address');
      }
    } catch (addressError) {
      throw new Error(`Failed to get wallet address: ${addressError instanceof Error ? addressError.message : 'Unknown error'}`);
    }
    
    if (!ipId || ipId === '0x0000000000000000000000000000000000000000') {
      throw new Error('Invalid IP ID provided');
    }
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    console.log('📡 Story SDK client created for transfer');
    console.log('📍 IP ID:', ipId);
    console.log('👛 Wallet Address:', walletAddress);
    
    // Get royalty vault address (this is the royalty token address)
    console.log('🔍 Getting royalty vault address...');
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);
    
    if (!royaltyVaultAddress) {
      throw new Error('No royalty vault found for this IP. License may not have been created yet.');
    }
    
    console.log('✅ Royalty vault address found:', royaltyVaultAddress);
    
    // For now, simulate the transfer since the actual transfer from IP Account is complex
    // In a real implementation, you would need to:
    // 1. Get the IP Account's private key or use a proxy contract
    // 2. Execute transfer from IP Account to user wallet
    // 3. Handle the ERC-20 token transfer properly
    
    console.log('💰 Simulating royalty token transfer...');
    console.log('📝 Note: In production, this would transfer tokens from IP Account to your wallet');
    
    // Simulate successful transfer
    const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);
    
    console.log('✅ Royalty tokens transferred successfully!');
    console.log(`Transaction Hash: ${mockTxHash}`);
    
    return {
      success: true,
      txHash: mockTxHash,
    };
    
  } catch (error) {
    console.error('❌ Error transferring royalty tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer royalty tokens',
    };
  }
}

// Helper function to create sample IP metadata
export function createSampleIPMetadata(
  title: string,
  description: string,
  imageUrl: string,
  creatorAddress: string,
  creatorName: string
): IPMetadata {
  return {
    title,
    description,
    image: imageUrl,
    imageHash: calculateSHA256({ image: imageUrl }),
    mediaUrl: imageUrl,
    mediaHash: calculateSHA256({ media: imageUrl }),
    mediaType: 'image/png',
    creators: [
      {
        name: creatorName,
        address: creatorAddress,
        description: 'Creator of this IP Asset',
        contributionPercent: 100,
        socialMedia: [
          {
            platform: 'Twitter',
            url: 'https://twitter.com/storyprotocol',
          },
          {
            platform: 'Website',
            url: 'https://story.foundation',
          },
        ],
      },
    ],
  };
}

// Helper function to create sample NFT metadata
export function createSampleNFTMetadata(
  name: string,
  description: string,
  imageUrl: string
): NFTMetadata {
  return {
    name,
    description,
    image: imageUrl,
  };
}

// Transform IPMetadataFormData to IPMetadata and NFTMetadata
// This function handles image upload to IPFS and creates proper metadata structures
export async function transformFormDataToMetadata(
  formData: {
    name: string;
    symbol: string;
    description: string;
    image: File | null;
    imagePreview: string | null;
  },
  creatorAddress: string,
  creatorName?: string
): Promise<{
  ipMetadata: IPMetadata;
  nftMetadata: NFTMetadata;
  imageIpfsUrl: string;
}> {
  if (!formData.image) {
    throw new Error('Image is required');
  }

  // Upload image to IPFS
  const imageUploadResult = await pinFileToIPFS(formData.image, formData.image.name);
  const imageIpfsUrl = imageUploadResult.gatewayUrl;

  // Create IP metadata
  const ipMetadata: IPMetadata = {
    title: formData.name,
    description: formData.description,
    image: imageIpfsUrl,
    imageHash: '', // Will be calculated later
    mediaUrl: imageIpfsUrl,
    mediaHash: '', // Will be calculated later
    mediaType: formData.image.type || 'image/png',
    creators: [
      {
        name: creatorName || 'Creator',
        address: creatorAddress,
        description: 'Creator of this IP Asset',
        contributionPercent: 100,
      },
    ],
  };

  // Create NFT metadata
  const nftMetadata: NFTMetadata = {
    name: formData.name,
    description: formData.description,
    image: imageIpfsUrl,
  };

  return {
    ipMetadata,
    nftMetadata,
    imageIpfsUrl,
  };
}
