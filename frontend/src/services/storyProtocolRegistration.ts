// Story Protocol IP Asset Registration Service
// For creating new IP assets and getting royalty tokens

import { StoryClient } from '@story-protocol/core-sdk';
import { http, Address, custom } from 'viem';
import { logger } from '@/lib/logger';
import { STORY_RPC_URL } from "@/lib/env";
import type { PrimaryWalletLike } from '@/services/domain/types';

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
      chainId: process.env.NEXT_PUBLIC_STORY_SDK_CHAIN_ID || "mainnet",
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
        chainId: process.env.NEXT_PUBLIC_STORY_SDK_CHAIN_ID || "mainnet",
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
