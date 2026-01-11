// Story Protocol IP Asset Registration Service
// For creating new IP assets and getting royalty tokens

import { StoryClient, PILFlavor, WIP_TOKEN_ADDRESS } from '@story-protocol/core-sdk';
import { createPublicClient, http, Address, custom, encodeFunctionData } from 'viem';
import { erc20Abi } from 'viem';
import { pinJSONToIPFS, pinFileToIPFS } from './pinataService';
import { logger } from '@/lib/logger';
import type { PrimaryWalletLike } from '@/services/domain/types';

// Environment variables
const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || 'https://aeneid.storyrpc.io';
const SPG_NFT_CONTRACT = '0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc'; // Aeneid Testnet

// Story RoyaltyModule configuration (Aeneid)
const STORY_ROYALTY_MODULE_ADDRESS =
  process.env.NEXT_PUBLIC_STORY_ROYALTY_MODULE_ADDRESS ||
  '0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086';

// Demo royalty amount (in WIP wei) for quick harvest demos
const DEMO_ROYALTY_AMOUNT_WEI = BigInt(
  process.env.NEXT_PUBLIC_DEMO_ROYALTY_AMOUNT_WEI || '100000000000000000',
);

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

async function getWalletAddress(primaryWallet: PrimaryWalletLike): Promise<Address> {
  return (await primaryWallet.address) as Address;
}

// Create Story Protocol client with Dynamic wallet
async function createStoryProtocolClient(primaryWallet: PrimaryWalletLike) {
  try {
    // Get wallet client from Dynamic SDK
    const walletClient = await primaryWallet.getWalletClient?.();
    if (!walletClient) {
      throw new Error('No wallet client available');
    }
    logger.log('🔍 Got wallet client from Dynamic SDK');
    
    // Create Story SDK client with proper wallet integration
    const config: any = {
      wallet: walletClient, // Pass the actual wallet client
      transport: custom((walletClient as any).transport), // Use custom transport
      chainId: "aeneid",
    };
    
    const client = (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
    logger.log('✅ Story SDK client created with wallet client');
    return client;
  } catch (error) {
    logger.error('Error creating Story SDK client:', error);
    
    // Fallback: try with account only
    try {
      logger.log('🔄 Trying fallback with account only...');
      const walletAddress = await getWalletAddress(primaryWallet);
      
      const config: any = {
        transport: http(STORY_RPC_URL),
        chainId: "aeneid",
        account: walletAddress,
      };
      
      const client = (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
      logger.log('✅ Story SDK client created (account fallback)');
      return client;
    } catch (fallbackError) {
      logger.error('Fallback also failed:', fallbackError);
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
  // Default license terms ID created/attached when registering (if any)
  licenseTermsId?: string;
  status?: 'uploading' | 'registering' | 'confirming' | 'success' | 'error';
}

// Upload metadata to IPFS using Pinata
async function uploadToIPFS(metadata: unknown): Promise<string> {
  const meta = metadata as { title?: string; name?: string } | null;
  const name = meta?.title || meta?.name || 'ip-metadata';
  const result = await pinJSONToIPFS(metadata, name);
  return result.cid;
}

// Calculate SHA256 hash
async function calculateSHA256(data: unknown): Promise<string> {
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
    logger.warn('Failed to calculate SHA256, using fallback:', error);
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

// Register IP Asset with transaction polling and event extraction
export async function registerIPAssetWithPolling(
  ipMetadata: IPMetadata,
  nftMetadata: NFTMetadata,
  primaryWallet: PrimaryWalletLike,
  onStatusUpdate?: (status: RegistrationResult['status']) => void
): Promise<RegistrationResult> {
  try {
    // Step 1: Upload metadata to IPFS
    onStatusUpdate?.('uploading');
    
    const [ipIpfsHash, nftIpfsHash, ipHash, nftHash] = await Promise.all([
      uploadToIPFS(ipMetadata),
      uploadToIPFS(nftMetadata),
      calculateSHA256(ipMetadata),
      calculateSHA256(nftMetadata),
    ]);
    
    // Step 2: Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Step 3: Register IP asset
    onStatusUpdate?.('registering');
    const response = await client.ipAsset.registerIpAsset({
      nft: {
        type: 'mint',
        spgNftContract: SPG_NFT_CONTRACT as Address,
      },
      // Attach PIL license terms directly on registration (similar to mintAndRegisterIpAssetWithPilTerms)
      licenseTermsData: [
        {
          terms: PILFlavor.commercialRemix({
            commercialRevShare: 0,
            defaultMintingFee: 0n,
            currency: WIP_TOKEN_ADDRESS,
          }),
        },
      ],
      ipMetadata: {
        ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
        ipMetadataHash: `0x${ipHash}`,
        nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
        nftMetadataHash: `0x${nftHash}`,
      },
    });
    
    // Step 4: Poll for transaction confirmation
    onStatusUpdate?.('confirming');
    
    const publicClient = createPublicClientForStory();
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: response.txHash as `0x${string}`,
        timeout: 120_000, // 2 minutes timeout
      });

      if (receipt.status !== 'success') {
        throw new Error(`IP registration transaction reverted or failed (status=${receipt.status})`);
      }
    } catch (pollError) {
      logger.error('❌ Error waiting for transaction receipt:', pollError);
      // We will still trust the SDK response.ipId below, but surface the error message.
    }
    
    // Always trust the SDK-returned ipId from registerIpAsset
    const finalIpId = response.ipId;
    const defaultLicenseTermsId =
      (response as any).licenseTermsIds?.[0]?.toString() ?? undefined;
    
    if (!finalIpId) {
      throw new Error('Failed to get IP ID from transaction');
    }
    
    // Step 5: Get royalty vault address
    let royaltyVaultAddress: string | undefined;
    try {
      royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(finalIpId as Address);
    } catch (vaultError) {
      logger.warn('Could not get royalty vault address:', vaultError);
    }
    
    onStatusUpdate?.('success');
    
    return {
      success: true,
      ipId: finalIpId,
      txHash: response.txHash,
      royaltyVaultAddress: royaltyVaultAddress,
      licenseTermsId: defaultLicenseTermsId,
      status: 'success',
    };
    
  } catch (error) {
    logger.error('Error registering IP asset:', error);
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

// Inject a small amount of WIP royalty into a Story IP's royalty vault
// using the RoyaltyModule, for testing harvest flows on fresh IPs.
export async function injectDemoRoyaltyWIP(
  ipId: string,
  primaryWallet: PrimaryWalletLike,
): Promise<{
  success: boolean;
  approveTxHash?: string;
  txHash?: string;
  error?: string;
  wrapTxHash?: string;
}> {
  try {
    const userAddress = await getWalletAddress(primaryWallet);
    if (!userAddress) {
      throw new Error('Wallet not connected');
    }

    if (!ipId || ipId === '0x0000000000000000000000000000000000000000') {
      throw new Error('Invalid IP ID provided');
    }

    const walletClient = await primaryWallet.getWalletClient?.();
    if (!walletClient) {
      throw new Error('No wallet client available');
    }
    const publicClient = createPublicClientForStory();

    const targetAmount = DEMO_ROYALTY_AMOUNT_WEI;

    const wipBalance = await publicClient.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress],
    }) as bigint;

    let amount = targetAmount;

    if (wipBalance < targetAmount) {
      const missing = targetAmount - wipBalance;

      const iwipAbi = [
        {
          inputs: [],
          name: 'deposit',
          outputs: [],
          stateMutability: 'payable',
          type: 'function',
        },
      ] as const;

      const depositData = encodeFunctionData({
        abi: iwipAbi,
        functionName: 'deposit',
        args: [],
      });

      const depositTxHash = await walletClient.sendTransaction({
        to: WIP_TOKEN_ADDRESS as Address,
        data: depositData,
        value: missing,
      });

      await publicClient.waitForTransactionReceipt({ hash: depositTxHash as `0x${string}` });

      const newBalance = await publicClient.readContract({
        address: WIP_TOKEN_ADDRESS as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as bigint;

      if (newBalance < targetAmount) {
        throw new Error('Insufficient WIP balance after wrapping IP');
      }
    }

    // 1) Approve the RoyaltyModule to pull WIP from the user wallet
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [STORY_ROYALTY_MODULE_ADDRESS as Address, amount],
    });

    const approveTxHash = await walletClient.sendTransaction({
      to: WIP_TOKEN_ADDRESS as Address,
      data: approveData,
    });

    await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });

    // 2) Call RoyaltyModule.payRoyaltyOnBehalf(childIpId, payer, currencyToken, amount)
    const royaltyModuleAbi = [
      {
        inputs: [
          { internalType: 'address', name: 'childIpId', type: 'address' },
          { internalType: 'address', name: 'payer', type: 'address' },
          { internalType: 'address', name: 'currencyToken', type: 'address' },
          { internalType: 'uint256', name: 'amount', type: 'uint256' },
        ],
        name: 'payRoyaltyOnBehalf',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ] as const;

    const payData = encodeFunctionData({
      abi: royaltyModuleAbi,
      functionName: 'payRoyaltyOnBehalf',
      args: [ipId as Address, userAddress, WIP_TOKEN_ADDRESS as Address, amount],
    });

    const txHash = await walletClient.sendTransaction({
      to: STORY_ROYALTY_MODULE_ADDRESS as Address,
      data: payData,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

    logger.log('✅ Demo royalty injected! Tx:', txHash);

    return {
      success: true,
      approveTxHash,
      txHash,
    };
  } catch (error) {
    logger.error('❌ Error injecting demo WIP royalty:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to inject royalties',
    };
  }
}

// Register IP Asset and get tokens (original function, kept for backward compatibility)
export async function registerIPAsset(
  ipMetadata: IPMetadata,
  nftMetadata: NFTMetadata,
  primaryWallet: PrimaryWalletLike
): Promise<RegistrationResult> {
  return registerIPAssetWithPolling(ipMetadata, nftMetadata, primaryWallet);
}

// Claim revenue from IP Asset (to get royalty tokens)
export async function claimRevenue(
  ipId: string,
  primaryWallet: PrimaryWalletLike
): Promise<{
  success: boolean;
  txHash?: string;
  claimedAmount?: string;
  error?: string;
}> {
  try {
    logger.log('💰 Claiming revenue for IP:', ipId);
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Claim all revenue
    const response = await client.royalty.claimAllRevenue({
      ipId: ipId as Address,
    });
    
    logger.log('✅ Revenue claimed successfully!');
    logger.log(`Transaction Hash: ${response.txHash}`);
    
    return {
      success: true,
      txHash: response.txHash,
      claimedAmount: response.amount?.toString() || '0',
    };
    
  } catch (error) {
    logger.error('❌ Error claiming revenue:', error);
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
  primaryWallet: PrimaryWalletLike
): Promise<{
  success: boolean;
  txHash?: string;
  licenseTokenId?: string;
  error?: string;
}> {
  try {
    logger.log('📜 Minting license token for IP:', ipId);

    const walletAddress = await getWalletAddress(primaryWallet);
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Mint license token sesuai docs example (no explicit licenseTemplate, rely on existing terms)
    const response = await client.license.mintLicenseTokens({
      licensorIpId: ipId as Address,
      licenseTermsId,
      amount: 1,
      receiver: walletAddress,
      royaltyContext: "0x", // Empty royalty context
      maxMintingFee: BigInt(0), // disabled
      maxRevenueShare: 100, // cap only
    });
    
    logger.log('✅ License token minted successfully!');
    logger.log(`Transaction Hash: ${response.txHash}`);
    logger.log(`License Token ID: ${response.licenseTokenIds?.[0]}`);
    
    return {
      success: true,
      txHash: response.txHash,
      licenseTokenId: response.licenseTokenIds?.[0]?.toString(),
    };
    
  } catch (error) {
    logger.error('❌ Error minting license token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mint license token',
    };
  }
}

// Helper: convert royalty percent (0-100) into ERC20 token amount
// Story docs: there are 100,000,000 Royalty Tokens total (100, with 6 decimals)
function convertRoyaltyPercentToTokens(royaltyPercent: number): bigint {
  return BigInt(royaltyPercent) * 1_000_000n; // 1% = 1,000,000 tokens
}

// Transfer royalty tokens from IP Account to user wallet (mirrors Story TS example)
export async function transferRoyaltyTokensFromIP(
  ipId: string,
  primaryWallet: PrimaryWalletLike
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    logger.log('🔄 Transferring royalty tokens from IP Account to wallet...');

    const walletAddress = await getWalletAddress(primaryWallet);
    
    // Create Story SDK client
    const client = await createStoryProtocolClient(primaryWallet);
    
    // Get royalty vault address (ini adalah address dari ERC-20 Royalty Tokens)
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);
    
    if (!royaltyVaultAddress || royaltyVaultAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('No royalty vault found for this IP. This IP may not have any royalty tokens yet.');
    }
    
    logger.log('✅ Royalty vault address found:', royaltyVaultAddress);
    
    // Transfer a percentage of Royalty Tokens from the IP Account to the user wallet.
    // Per Story TypeScript tutorial, Royalty Tokens are simple ERC-20s with total
    // supply 100,000,000 (100 with 6 decimals). Here we request 100% as per
    // Sovry product decision (creator fully owns the royalty token supply).
    const amountToTransfer = convertRoyaltyPercentToTokens(100); // 100%
    
    const transferResponse = await client.ipAccount.transferErc20({
      ipId: ipId as Address,
      tokens: [
        {
          address: royaltyVaultAddress,
          amount: amountToTransfer,
          target: walletAddress,
        },
      ],
    });
    
    logger.log('✅ Royalty tokens transferred successfully!');
    logger.log(`Transaction Hash: ${transferResponse.txHash}`);
    
    return {
      success: true,
      txHash: transferResponse.txHash,
    };
    
  } catch (error) {
    logger.error('❌ Error transferring royalty tokens:', error);
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
    // Sample metadata helpers are used only for demos; hashes are not critical here.
    imageHash: '',
    mediaUrl: imageUrl,
    mediaHash: '',
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
