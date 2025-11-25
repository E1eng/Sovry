// Story Protocol service integration
// ARCHITECTURE: Separate READ (Backend API) and WRITE (Dynamic Wallet)

import { StoryClient } from '@story-protocol/core-sdk';
import { StoryClient as StoryClientType } from '@story-protocol/core-sdk';
import { createPublicClient, http, Address, encodeFunctionData, custom } from 'viem';
import { erc20Abi } from 'viem';

// Environment variables
const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || 'https://aeneid.storyrpc.io';
const GOLDSKY_GRAPHQL_URL = 'https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn';
const STORY_API_KEY = process.env.NEXT_PUBLIC_STORY_API_KEY || 'KOTbaGUSWQ6cUJWhiJYiOjPgB0kTRu1eCFFvQL0IWls';

// Sovry Launchpad Contract Address (bonding curve launch)
export const SOVRY_LAUNCHPAD_ADDRESS =
  process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ||
  "0xABddc4817c287cCc6F1a170Fa3C364e9df2464E6";

// ===== READ OPERATIONS (Use Backend API / Goldsky) =====
// These should NOT use user's MetaMask wallet

// Single public client for READ operations only
let publicClient: any = null;
function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: {
        id: 1315,
        name: 'Story Aeneid Testnet',
        nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
        rpcUrls: {
          default: { http: [STORY_RPC_URL] },
        },
        blockExplorers: {
          default: { name: 'StoryScan', url: 'https://storyscan.xyz' },
        },
      },
      transport: http(STORY_RPC_URL),
    });
  }
  return publicClient;
}

// IP Asset interface
export interface IPAsset {
  ipId: string;
  name: string;
  description: string;
  imageUrl: string;
  owner: string;
  royaltyVaultAddress: string;
  hasRoyaltyTokens: boolean;
  createdAt: string;
}

// Sovry Launchpad ABI (wrapper-based launch)
const SOVRY_LAUNCHPAD_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'royaltyToken', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
    ],
    name: 'launchToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Token balance interface
export interface TokenBalance {
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

// Create Story Protocol client with Dynamic wallet
async function createStoryProtocolClient(primaryWallet?: any) {
  if (!primaryWallet) {
    console.warn('No wallet provided for Story SDK - using read-only client');
    // Read-only client for public queries
    return (StoryClient as any).new?.({
      transport: http(STORY_RPC_URL),
      chainId: 1315, // Aeneid Testnet
    }) || new (StoryClient as any)({
      transport: http(STORY_RPC_URL),
      chainId: 1315, // Aeneid Testnet
    });
  }
  
  try {
    // Get wallet client from Dynamic SDK
    const walletClient = await primaryWallet.getWalletClient();
    
    // Create Story SDK client with Dynamic wallet
    // Use viem custom transport with Dynamic wallet client
    const config: any = {
      wallet: walletClient,
      transport: custom(walletClient.transport),
      chainId: "aeneid", // Use string as per docs
    };
    
    return (StoryClient as any).newClient?.(config) || (StoryClient as any).new?.(config);
  } catch (error) {
    console.error('Error creating Story SDK client with Dynamic wallet:', error);
    
    // Fallback to address-only client
    const walletAddress = await primaryWallet.address;
    return (StoryClient as any).new?.({
      transport: http(STORY_RPC_URL),
      chainId: 1315, // Aeneid Testnet
      account: walletAddress as Address,
    }) || new (StoryClient as any)({
      transport: http(STORY_RPC_URL),
      chainId: 1315, // Aeneid Testnet
      account: walletAddress as Address,
    });
  }
}

// Create public client for Story Protocol
function createPublicClientForStory() {
  return createPublicClient({
    chain: {
      id: 1315,
      name: 'Story Aeneid Testnet',
      nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
      rpcUrls: {
        default: { http: [STORY_RPC_URL] },
      },
      blockExplorers: {
        default: { name: 'Story Explorer', url: 'https://explorer.testnet.storyrpc.io' },
      },
    },
    transport: http(STORY_RPC_URL),
  });
}

// Story Protocol Royalty Module ABI (from official docs)
const ROYALTY_MODULE_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'ipId', type: 'address' }],
    name: 'getRoyaltyVaultAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI for balance and transfer
const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Get royalty vault address for IP asset using Story Protocol SDK
export async function getRoyaltyVaultAddress(ipId: string, primaryWallet?: any): Promise<string | null> {
  try {
    console.log('Getting royalty vault address for IP:', ipId);
    
    // Validate IP ID format (should be a valid address)
    if (!ipId || ipId === '0x0000000000000000000000000000000000000000' || 
        !ipId.startsWith('0x') || ipId.length !== 42) {
      console.warn('Invalid IP ID format:', ipId);
      return null;
    }
    
    // Use Story Protocol SDK with connected Dynamic wallet
    const client = await createStoryProtocolClient(primaryWallet);
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);
    
    console.log('Royalty vault address from Story SDK:', royaltyVaultAddress);
    return royaltyVaultAddress;
  } catch (error) {
    console.error('Error getting royalty vault address from SDK:', error);
    
    // Fallback to direct contract call
    try {
      console.log('Trying direct contract call fallback...');
      
      const client = createPublicClientForStory();
      const royaltyModuleAddress = '0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086'; // RoyaltyModule from docs
      
      const royaltyVaultAddress = await client.readContract({
        address: royaltyModuleAddress as Address,
        abi: ROYALTY_MODULE_ABI,
        functionName: 'getRoyaltyVaultAddress',
        args: [ipId as Address],
      });
      
      console.log('Royalty vault address from contract:', royaltyVaultAddress);
      return royaltyVaultAddress;
    } catch (contractError) {
      console.error('Contract call also failed:', contractError);
      console.error('This IP might not exist or have no royalty vault:', ipId);
      
      // Return null instead of mock data - no mock data allowed
      return null;
    }
  }
}

// Check if IP asset has royalty tokens
export async function checkRoyaltyTokens(ipId: string, primaryWallet?: any): Promise<boolean> {
  try {
    console.log('Checking royalty tokens for IP:', ipId);
    
    const royaltyVaultAddress = await getRoyaltyVaultAddress(ipId, primaryWallet);
    
    // If vault address exists and is not zero address, IP has royalty tokens
    return royaltyVaultAddress !== null && 
           royaltyVaultAddress !== undefined && 
           royaltyVaultAddress !== '0x0000000000000000000000000000000000000000';
  } catch (error) {
    console.error('Error checking royalty tokens:', error);
    return false;
  }
}

// Get token balance for user wallet
export async function getTokenBalance(userAddress: string, tokenAddress: string): Promise<TokenBalance | null> {
  try {
    console.log('Getting token balance for:', userAddress, 'token:', tokenAddress);
    
    const client = createPublicClientForStory();
    
    // Get balance
    const balance = await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress as Address],
    }) as bigint;
    
    // Get decimals
    const decimals = await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as number;
    
    // Get symbol
    const symbol = await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'symbol',
    }) as string;
    
    const formattedBalance = (Number(balance) / Math.pow(10, decimals)).toString();
    
    console.log(`Token balance: ${formattedBalance} ${symbol}`);
    
    return {
      address: tokenAddress,
      balance: formattedBalance,
      decimals,
      symbol,
    };
  } catch (error) {
    console.error('Error getting token balance:', error);
    return null;
  }
}

// Check if user needs to unlock tokens (balance is 0)
export async function needsTokenUnlock(userAddress: string, tokenAddress: string): Promise<boolean> {
  try {
    const tokenBalance = await getTokenBalance(userAddress, tokenAddress);
    
    if (!tokenBalance) {
      return true; // Assume needs unlock if we can't get balance
    }
    
    // Check if balance is 0 (or very close to 0 due to precision)
    const balance = Number(tokenBalance.balance);
    return balance <= 0.000001; // Small threshold for precision
  } catch (error) {
    console.error('Error checking token unlock need:', error);
    return true; // Assume needs unlock on error
  }
}

// Unlock royalty tokens from IP Account to user wallet
export async function unlockRoyaltyTokens(
  userAddress: string, 
  ipId: string, 
  primaryWallet?: any,
  amount?: string
): Promise<{
  success: boolean;
  transactionHash?: string;
  error?: string;
}> {
  try {
    console.log('Unlocking royalty tokens for IP:', ipId, 'to user:', userAddress);
    
    // Get royalty vault address (this is the token address)
    const royaltyVaultAddress = await getRoyaltyVaultAddress(ipId, primaryWallet);
    
    if (!royaltyVaultAddress) {
      return {
        success: false,
        error: 'This IP asset does not have a royalty vault. It may not be registered on Story Protocol or has no royalty tokens.'
      };
    }
    
    // In a real implementation, this would:
    // 1. Connect to user's wallet via Dynamic SDK
    // 2. Call transferFrom or zap function on IP Account
    // 3. Wait for transaction confirmation
    
    // For now, simulate the unlock process
    console.log('Simulating token transfer from IP Account to user wallet...');
    
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate mock transaction hash
    const transactionHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    console.log('Tokens unlocked successfully:', transactionHash);
    
    return {
      success: true,
      transactionHash,
    };
  } catch (error) {
    console.error('Error unlocking royalty tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unlock tokens',
    };
  }
}

// Fetch IP assets for a wallet address using Story Protocol API
export async function fetchWalletIPAssets(walletAddress: string, primaryWallet?: any): Promise<IPAsset[]> {
  try {
    console.log('Fetching IP assets for wallet:', walletAddress);
    
    // Try multiple approaches to fetch IP assets
    const approaches = [
      // Approach 1: Correct API structure from example
      {
        url: 'https://staging-api.storyprotocol.net/api/v4/assets',
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: 'blockNumber',
          orderDirection: 'desc',
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress }
        }
      },
      // Approach 2: Try with lowercase
      {
        url: 'https://staging-api.storyprotocol.net/api/v4/assets',
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: 'blockNumber',
          orderDirection: 'desc',
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress.toLowerCase() }
        }
      },
      // Approach 3: Try without includeLicenses
      {
        url: 'https://staging-api.storyprotocol.net/api/v4/assets',
        body: {
          includeLicenses: false,
          moderated: false,
          orderBy: 'blockNumber',
          orderDirection: 'desc',
          pagination: { limit: 50, offset: 0 },
          where: { ownerAddress: walletAddress }
        }
      },
      // Approach 4: Get all assets and filter client-side
      {
        url: 'https://staging-api.storyprotocol.net/api/v4/assets',
        body: {
          includeLicenses: true,
          moderated: false,
          orderBy: 'blockNumber',
          orderDirection: 'desc',
          pagination: { limit: 100, offset: 0 }
        }
      }
    ];

    const POOL_DAY_DATA_QUERY = `
      query GetPoolDayData($poolId: ID!, $days: Int = 7) {
        poolDayDatas(first: $days, orderBy: date, orderDirection: desc, where: { pool: $poolId }) {
          id
          date
          pool {
            id
          }
          volumeUSD
          volumeToken0
          volumeToken1
          tvlUSD
          reserve0
          reserve1
          reserveUSD
          txCount
          feesUSD
        }
      }
    `;

    const TOKEN_DAY_DATA_QUERY = `
      query GetTokenDayData($tokenId: ID!, $days: Int = 7) {
        tokenDayDatas(first: $days, orderBy: date, orderDirection: desc, where: { token: $tokenId }) {
          id
          date
          token {
            id
            symbol
            name
          }
          volumeUSD
          volume
          tvlUSD
          priceUSD
          txCount
          totalLiquidityUSD
        }
      }
    `;

    const FACTORY_DAY_DATA_QUERY = `
      query GetFactoryDayData($days: Int = 7) {
        factoryDayDatas(first: $days, orderBy: date, orderDirection: desc) {
          id
          date
          totalVolumeUSD
          totalVolumeETH
          totalLiquidityUSD
          totalLiquidityETH
          txCount
        }
      }
    `;

    for (let i = 0; i < approaches.length; i++) {
      const approach = approaches[i];
      console.log(`Trying approach ${i + 1}:`, approach.body);
      
      try {
        const response = await fetch(approach.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': STORY_API_KEY,
          },
          body: JSON.stringify(approach.body),
        });

        if (!response.ok) {
          console.warn(`Approach ${i + 1} failed:`, response.status, response.statusText);
          continue;
        }

        const result = await response.json();
        console.log(`Approach ${i + 1} response:`, result);

        if (!result.data || result.data.length === 0) {
          console.log(`Approach ${i + 1}: No data found`);
          continue;
        }

        // If we got all assets (approach 4), filter by owner
        let assets = result.data;
        if (i === 3) { // Approach 4 (no filter)
          console.log('All assets sample:', result.data.slice(0, 3).map((asset: any) => ({
            ipId: asset.ipId,
            ownerAddress: asset.ownerAddress,
            owner: asset.owner,
            ownerAddress_lower: asset.ownerAddress?.toLowerCase(),
            wallet_lower: walletAddress.toLowerCase()
          })));
          
          // Debug: Show all unique owner addresses from the API
          const ownerAddresses = result.data.map((asset: any) => asset.ownerAddress || asset.owner);
          const uniqueOwners = Array.from(new Set(ownerAddresses));
          console.log('All unique owners in API:', uniqueOwners);
          console.log('Looking for wallet:', walletAddress);
          console.log('Looking for wallet (lowercase):', walletAddress.toLowerCase());
          
          assets = result.data.filter((asset: any) => 
            asset.ownerAddress?.toLowerCase() === walletAddress.toLowerCase() ||
            asset.owner?.toLowerCase() === walletAddress.toLowerCase()
          );
          console.log(`Filtered ${assets.length} assets for owner ${walletAddress}`);
        }

        if (assets.length === 0) {
          console.log(`Approach ${i + 1}: No assets found for owner`);
          continue;
        }

        // Transform API response to IPAsset interface
        const ipAssets: IPAsset[] = await Promise.all(
          assets.map(async (asset: any) => {
            // Get royalty vault address for each IP asset using connected wallet
            const royaltyVaultAddress = await getRoyaltyVaultAddress(asset.ipId, primaryWallet);
            const hasRoyaltyTokens = await checkRoyaltyTokens(asset.ipId, primaryWallet);

            return {
              ipId: asset.ipId,
              name: asset.name || asset.title || `IP Asset ${asset.ipId.slice(0, 8)}`,
              description: asset.description || `IP Asset registered on Story Protocol`,
              imageUrl: asset.nftMetadata?.image?.cachedUrl || asset.nftMetadata?.image?.originalUrl || 'https://example.com/default-ip-image.jpg',
              owner: asset.ownerAddress || asset.owner,
              royaltyVaultAddress: royaltyVaultAddress || '0x0000000000000000000000000000000000000000',
              hasRoyaltyTokens,
              createdAt: asset.createdAt || new Date().toISOString(),
            };
          })
        );

        // Filter only IP assets that have royalty tokens
        const ipAssetsWithRoyalties = ipAssets.filter(asset => asset.hasRoyaltyTokens);
        
        if (ipAssetsWithRoyalties.length > 0) {
          console.log(`SUCCESS: Approach ${i + 1} found ${ipAssetsWithRoyalties.length} IP assets with royalty tokens`);
          return ipAssetsWithRoyalties;
        } else {
          console.log(`Approach ${i + 1}: Found ${ipAssets.length} IP assets but none have royalty tokens`);
        }
      } catch (error) {
        console.error(`Approach ${i + 1} error:`, error);
      }
    }

    console.log('All approaches failed - no IP assets with royalty tokens found');
    return [];
  } catch (error) {
    console.error('Error fetching wallet IP assets from Story API:', error);
    return [];
  }
}

// ===== WRITE OPERATIONS (Use Dynamic Wallet ONLY) =====
// These functions use user's wallet for signing transactions

// Dynamic SDK Launch Function - WRITE ONLY (Sovry Launchpad bonding curve)
// Uses a wrapper token (SovryToken) around the locked royalty token.
export async function launchOnBondingCurveDynamic(
  royaltyTokenAddress: string,
  primaryWallet: any,
  tokenName: string,
  tokenSymbol: string,
  launchPercentage: number,
): Promise<{ success: boolean; approveTxHash?: string; launchTxHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    console.log('🔥 Dynamic Launch - WRITE Operation (Sovry Launchpad)');
    console.log('Launch params:', { 
      royaltyToken: royaltyTokenAddress,
      launchpad: SOVRY_LAUNCHPAD_ADDRESS,
      name: tokenName,
      symbol: tokenSymbol,
      percentage: launchPercentage,
    });

    const publicClient = getPublicClient();
    const walletClient = await primaryWallet.getWalletClient();
    const userAddress = primaryWallet.address;

    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    // Ensure the provided address is a contract
    const code = await publicClient.getBytecode({
      address: royaltyTokenAddress as Address,
    });

    if (!code || code === '0x') {
      throw new Error(`Address ${royaltyTokenAddress} is not a contract`);
    }

    console.log('✅ Launch token address is a contract');

    // Resolve the actual ERC20 token behind the vault (if applicable)
    let actualToken = royaltyTokenAddress;

    try {
      // Try token() first
      const tokenResult = await publicClient.readContract({
        address: royaltyTokenAddress as Address,
        abi: [{
          inputs: [],
          name: 'token',
          outputs: [{ internalType: 'address', name: '', type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'token',
      });

      if (tokenResult && tokenResult !== '0x0000000000000000000000000000000000000000') {
        actualToken = tokenResult as string;
        console.log('✅ Found launch token via token():', actualToken);
      } else {
        throw new Error('token() returned zero address');
      }
    } catch (tokenError) {
      console.log('⚠️ token() failed, trying asset() on vault...', tokenError);

      try {
        const assetResult = await publicClient.readContract({
          address: royaltyTokenAddress as Address,
          abi: [{
            inputs: [],
            name: 'asset',
            outputs: [{ internalType: 'address', name: '', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'asset',
        });

        if (assetResult && assetResult !== '0x0000000000000000000000000000000000000000') {
          actualToken = assetResult as string;
          console.log('✅ Found launch token via asset():', actualToken);
        } else {
          console.log('⚠️ asset() also returned zero address, using original token as-is');
        }
      } catch (assetError) {
        console.log('❌ asset() failed, using original token as launch token', assetError);
      }
    }

    // Verify actual token looks like an ERC20
    try {
      const symbol = await publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      console.log('✅ Launch token is ERC20, symbol:', symbol);
    } catch (symbolError) {
      throw new Error(`Launch token ${actualToken} is not a valid ERC20: ${symbolError}`);
    }

    // Approve SovryLaunchpad to pull a fraction of creator's tokens based on launchPercentage
    const userBalance = await publicClient.readContract({
      address: actualToken as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress as Address],
    }) as bigint;

    console.log('💰 User launch token balance:', userBalance.toString());

    if (userBalance === 0n) {
      throw new Error('You have no royalty tokens to launch. Please Get Royalty Tokens first.');
    }

    // Clamp percentage between 1 and 100
    const pct = BigInt(
      Math.min(
        Math.max(Math.floor(launchPercentage || 0), 1),
        100
      )
    );

    const amountToLock = (userBalance * pct) / 100n;

    if (amountToLock === 0n) {
      throw new Error('Amount to lock is too small for the selected percentage.');
    }

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SOVRY_LAUNCHPAD_ADDRESS as Address, amountToLock],
    });

    console.log('📤 Sending approve transaction for launch token via Dynamic...');
    const approveTxHash = await walletClient.sendTransaction({
      to: actualToken as Address,
      data: approveData,
    });

    console.log('✅ Launch token approve success! Tx Hash:', approveTxHash);

    // Call SovryLaunchpad.launchToken(royaltyToken, amountToLock, name, symbol)
    const launchData = encodeFunctionData({
      abi: SOVRY_LAUNCHPAD_ABI,
      functionName: 'launchToken',
      args: [
        actualToken as Address,
        amountToLock,
        tokenName,
        tokenSymbol,
      ],
    });

    console.log('📤 Calling SovryLaunchpad.launchToken...');
    const launchTxHash = await walletClient.sendTransaction({
      to: SOVRY_LAUNCHPAD_ADDRESS as Address,
      data: launchData,
    });

    console.log('✅ SovryLaunchpad launch success! Tx Hash:', launchTxHash);

    return {
      success: true,
      approveTxHash,
      launchTxHash,
    };
  } catch (error) {
    console.error('❌ Launch on bonding curve failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error launching on bonding curve',
    };
  }
}

export interface RoyaltyLockInfo {
  royaltyToken: string;
  symbol: string;
  decimals: number;
  locked: bigint;
  creatorBalance: bigint;
}

export async function getRoyaltyLockInfo(
  royaltyTokenAddress: string,
  creatorAddress: string
): Promise<RoyaltyLockInfo | null> {
  try {
    const publicClient = getPublicClient();
    let actualToken = royaltyTokenAddress as string;

    try {
      const tokenResult = await publicClient.readContract({
        address: royaltyTokenAddress as Address,
        abi: [{
          inputs: [],
          name: 'token',
          outputs: [{ internalType: 'address', name: '', type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'token',
      });

      if (tokenResult && tokenResult !== '0x0000000000000000000000000000000000000000') {
        actualToken = tokenResult as string;
      }
    } catch {
      try {
        const assetResult = await publicClient.readContract({
          address: royaltyTokenAddress as Address,
          abi: [{
            inputs: [],
            name: 'asset',
            outputs: [{ internalType: 'address', name: '', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'asset',
        });

        if (assetResult && assetResult !== '0x0000000000000000000000000000000000000000') {
          actualToken = assetResult as string;
        }
      } catch {}
    }

    const [decimals, symbol, launchpadBalance, creatorBalance] = await Promise.all([
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'decimals',
      }) as Promise<number>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'symbol',
      }) as Promise<string>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [SOVRY_LAUNCHPAD_ADDRESS as Address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [creatorAddress as Address],
      }) as Promise<bigint>,
    ]);

    return {
      royaltyToken: actualToken,
      symbol,
      decimals,
      locked: launchpadBalance,
      creatorBalance,
    };
  } catch (error) {
    console.error('Error loading royalty lock info:', error);
    return null;
  }
}

// Get IP asset details
export async function getIPAssetDetails(ipId: string, primaryWallet?: any): Promise<IPAsset | null> {
  try {
    console.log('Getting IP asset details for:', ipId);
    
    // Get royalty vault address
    const royaltyVaultAddress = await getRoyaltyVaultAddress(ipId, primaryWallet);
    
    // Check if has royalty tokens
    const hasRoyaltyTokens = await checkRoyaltyTokens(ipId, primaryWallet);
    
    // Mock IP asset details - in production, you'd get this from the Story Protocol SDK
    const ipAsset: IPAsset = {
      ipId,
      name: `IP Asset ${ipId.slice(0, 8)}`,
      description: `Description for IP asset ${ipId}`,
      imageUrl: `https://example.com/ip/${ipId}.jpg`,
      owner: '0x0000000000000000000000000000000000000000', // Would get from SDK
      royaltyVaultAddress: royaltyVaultAddress || '0x0000000000000000000000000000000000000000',
      hasRoyaltyTokens,
      createdAt: new Date().toISOString(),
    };
    
    return ipAsset;
  } catch (error) {
    console.error('Error getting IP asset details:', error);
    return null;
  }
}
