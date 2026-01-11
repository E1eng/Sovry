// Story Protocol service integration
// ARCHITECTURE: Separate READ (Backend API) and WRITE (Dynamic Wallet)

/*
// High-level helper: claim royalties for a backing IP using Story's royalty.claimAllRevenue
// so that WIP is credited to the IP Account (ipId), then move that WIP from the IP
// Account to the SovryLaunchpad contract via ipAccount.transferErc20 (no wallet hop),
// and finally call harvest(wrapperToken) to apply those royalties to the bonding
// curve / buyback.
async function _legacyClaimRevenueToWalletAndPump(
  ipId: string,
  wrapperToken: string,
  primaryWallet: any,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("Wallet not connected");
    }

    // Basic ipId sanity check; this must be the backing IP Account for the vault
    const hasValidIpId =
      typeof ipId === "string" && ipId.startsWith("0x") && ipId.length === 42;
    if (!hasValidIpId) {
      throw new Error("Invalid IP ID for royalty claim");
    }

    const client = await createStoryProtocolClient(primaryWallet);
    const walletClient = await primaryWallet.getWalletClient();
    if (!walletClient) {
      throw new Error("No wallet client available");
    }

    const publicClient = createPublicClientForStory();
    const launchpadAddress = _SOVRY_LAUNCHPAD_ADDRESS as Address;

    // 1) Claim revenue so that WIP is credited to the IP Account (ipId), not the wallet.
    await client.royalty.claimAllRevenue({
      ancestorIpId: ipId as Address,
      claimer: ipId as Address,
      currencyTokens: [WIP_TOKEN_ADDRESS as Address],
      childIpIds: [],
      royaltyPolicies: [],
      claimOptions: {
        autoTransferAllClaimedTokensFromIp: false,
        autoUnwrapIpTokens: false,
      },
    });

    // 2) Check how much WIP is now held by the IP Account.
    const wipOnIp = (await publicClient.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [ipId as Address],
    })) as bigint;

    if (wipOnIp === 0n) {
      throw new Error("No WIP balance on IP Account after claim; nothing to harvest");
    }

    const transferResponse = await client.ipAccount.transferErc20({
      ipId: ipId as Address,
      tokens: [
        {
          address: WIP_TOKEN_ADDRESS as Address,
          amount: wipOnIp,
          target: launchpadAddress,
        },
      ],
    });

    if (!transferResponse || !transferResponse.txHash) {
      throw new Error("Failed to transfer WIP from IP Account to launchpad");
    }

    await publicClient.waitForTransactionReceipt({ hash: transferResponse.txHash as `0x${string}` });

    // 3) With WIP now held directly by SovryLaunchpad, call harvest(wrapperToken)
    //    from the connected wallet to execute the buyback/pump on the bonding curve.
    const { newLaunchpadAbi } = await import("./launchpadService");

    const harvestData = encodeFunctionData({
      abi: newLaunchpadAbi as any,
      functionName: "harvest",
      args: [wrapperToken as Address],
    });

    const harvestTxHash = await walletClient.sendTransaction({
      to: launchpadAddress,
      data: harvestData,
    });

    await publicClient.waitForTransactionReceipt({ hash: harvestTxHash });

    return { success: true, txHash: harvestTxHash };
  } catch (error) {
    logger.error("Error in claimRevenueToWalletAndPump:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to claim and pump royalties",
    };
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
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Get royalty vault address for IP asset using Story Protocol SDK
async function _legacyGetRoyaltyVaultAddress(ipId: string, primaryWallet?: any): Promise<string | null> {
  try {
    // Validate IP ID format (should be a valid address)
    if (!ipId || ipId === '0x0000000000000000000000000000000000000000' || 
        !ipId.startsWith('0x') || ipId.length !== 42) {
      logger.warn('Invalid IP ID format:', ipId);
      return null;
    }

    // Use Story Protocol SDK with connected Dynamic wallet
    const client = await createStoryProtocolClient(primaryWallet);
    const royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as Address);
    
    return royaltyVaultAddress;
  } catch (error) {
    logger.error('Error getting royalty vault address from SDK:', error);
    
    // Fallback to direct contract call
    try {
      const client = createPublicClientForStory();
      const royaltyModuleAddress = '0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086'; // RoyaltyModule from docs
      
      const royaltyVaultAddress = await client.readContract({
        address: royaltyModuleAddress as Address,
        abi: ROYALTY_MODULE_ABI,
        functionName: 'getRoyaltyVaultAddress',
        args: [ipId as Address],
      });
      
      return royaltyVaultAddress;
    } catch (contractError) {
      logger.error('Contract call also failed:', contractError);
      logger.error('This IP might not exist or have no royalty vault:', ipId);
      
      // Return null instead of mock data - no mock data allowed
      return null;
    }
  }
}

// Check if IP asset has royalty tokens
async function _legacyCheckRoyaltyTokens(ipId: string, primaryWallet?: any): Promise<boolean> {
  try {
    const royaltyVaultAddress = await _legacyGetRoyaltyVaultAddress(ipId, primaryWallet);
    
    // If vault address exists and is not zero address, IP has royalty tokens
    return royaltyVaultAddress !== null && 
           royaltyVaultAddress !== undefined && 
           royaltyVaultAddress !== '0x0000000000000000000000000000000000000000';
  } catch (error) {
    logger.error('Error checking royalty tokens:', error);
    return false;
  }
}

async function _legacyGetClaimableRoyaltyForIp(
  ipId: string,
  primaryWallet?: any,
): Promise<number> {
  try {
    const royaltyVaultAddress = await _legacyGetRoyaltyVaultAddress(ipId, primaryWallet);
    if (
      !royaltyVaultAddress ||
      royaltyVaultAddress === '0x0000000000000000000000000000000000000000'
    ) {
      return 0;
    }

    const client = createPublicClientForStory();

    const balance = await client.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [royaltyVaultAddress as Address],
    }) as bigint;

    if (balance === 0n) {
      return 0;
    }

    const decimals = await client.readContract({
      address: WIP_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as number;

    const base = 10n ** BigInt(decimals);
    const integer = Number(balance / base);
    const fraction = Number(balance % base) / Number(base);
    return integer + fraction;
  } catch (error) {
    logger.error('Error getting claimable royalty for IP:', error);
    return 0;
  }
}

// Get token balance for user wallet
async function _legacyGetTokenBalance(userAddress: string, tokenAddress: string): Promise<_TokenBalance | null> {
  try {
    // If token address is zero address, there's no ERC20 to query
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      logger.warn('getTokenBalance called with zero token address, returning null');
      return null;
    }

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
    
    return {
      address: tokenAddress,
      balance: formattedBalance,
      decimals,
      symbol,
    };
  } catch (error) {
    logger.error('Error getting token balance:', error);
    return null;
  }
}

async function _legacyNeedsTokenUnlock(userAddress: string, tokenAddress: string): Promise<boolean> {
  try {
    const tokenBalance = await _legacyGetTokenBalance(userAddress, tokenAddress);

    if (!tokenBalance) {
      // Assume needs unlock if we can't get balance
      return true;
    }

    // Check if balance is 0 (or very close to 0 due to precision)
    const balance = Number(tokenBalance.balance);
    return balance <= 0.000001;
  } catch (error) {
    logger.error('Error checking token unlock need:', error);
    // On error, assume the user needs to unlock
    return true;
  }
}

// Simple in-memory cache for wallet IP assets within a session
const WALLET_IP_ASSETS_CACHE_TTL_MS = 60_000; // 60 seconds
const walletIpAssetsCache = new Map<string, { assets: _IPAsset[]; timestamp: number }>();

// Fetch IP assets for a wallet address using Story Protocol API
async function _legacyFetchWalletIPAssets(walletAddress: string, primaryWallet?: any): Promise<_IPAsset[]> {
  try {
    const cacheKey = walletAddress.toLowerCase();
    const cached = walletIpAssetsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WALLET_IP_ASSETS_CACHE_TTL_MS) {
      return cached.assets;
    }

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

    for (let i = 0; i < approaches.length; i++) {
      const approach = approaches[i];

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
          logger.log(`Approach ${i + 1} failed:`, response.status, response.statusText);
          continue;
        }

        const result = await response.json();

        if (!result.data || result.data.length === 0) {
          continue;
        }

        // If we got all assets (approach 4), filter by owner
        let assets = result.data;
        if (i === 3) { // Approach 4 (no filter)
          assets = result.data.filter((asset: any) => 
            asset.ownerAddress?.toLowerCase() === walletAddress.toLowerCase() ||
            asset.owner?.toLowerCase() === walletAddress.toLowerCase()
          );
        }

        if (assets.length === 0) {
          continue;
        }

        // Transform API response to IPAsset interface
        const ipAssets: _IPAsset[] = await Promise.all(
          assets.map(async (asset: any) => {
            // Get royalty vault address for each IP asset using connected wallet
            const royaltyVaultAddress = await _legacyGetRoyaltyVaultAddress(asset.ipId, primaryWallet);
            const hasRoyaltyTokens = await _legacyCheckRoyaltyTokens(asset.ipId, primaryWallet);

            return {
              ipId: asset.ipId,
              name:
                asset.name ||
                asset.title ||
                `IP Asset ${asset.ipId.slice(0, 8)}`,
              description:
                asset.description ||
                `IP Asset registered on Story Protocol`,
              imageUrl:
                asset.nftMetadata?.image?.cachedUrl ||
                asset.nftMetadata?.image?.originalUrl ||
                "https://example.com/default-ip-image.jpg",
              mediaType:
                asset.mediaType ||
                asset.nftMetadata?.type ||
                asset.type,
              owner: asset.ownerAddress || asset.owner,
              royaltyVaultAddress:
                royaltyVaultAddress ||
                "0x0000000000000000000000000000000000000000",
              hasRoyaltyTokens,
              metadataUri: asset.ipaMetadataUri || asset.uri || undefined,
              createdAt: asset.createdAt || new Date().toISOString(),
            };
          })
        );

        if (ipAssets.length > 0) {
          walletIpAssetsCache.set(cacheKey, {
            assets: ipAssets,
            timestamp: Date.now(),
          });
          return ipAssets;
        }
      } catch (error) {
        logger.error(`Approach ${i + 1} error:`, error);
      }
    }

    logger.log('All approaches failed - no IP assets with royalty tokens found');
    return [];
  } catch (error) {
    logger.error('Error fetching wallet IP assets from Story API:', error);
    return [];
  }
}

// ===== WRITE OPERATIONS (Use Dynamic Wallet ONLY) =====
// These functions use user's wallet for signing transactions

function mapLaunchError(error: unknown): string {
  const anyErr = error as any;
  const shortMessage =
    anyErr && typeof anyErr.shortMessage === "string" ? anyErr.shortMessage : "";
  const errorName =
    anyErr && anyErr.data && typeof anyErr.data.errorName === "string"
      ? anyErr.data.errorName
      : "";
  const message = anyErr && typeof anyErr.message === "string" ? anyErr.message : "";
  const combined = `${shortMessage} ${message} ${errorName}`;

  if (combined.includes("MinListingRequired") || errorName === "MinListingRequired") {
    return "Minimal launch 25 RT. Please increase the launch percentage or acquire more royalty tokens.";
  }

  if (message) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error launching on bonding curve";
}

// Dynamic SDK Launch Function - WRITE ONLY (Sovry Launchpad bonding curve)
// Uses a wrapper token (SovryToken) around the locked royalty token.
async function _legacyLaunchOnBondingCurveDynamic(
  royaltyTokenAddress: string,
  primaryWallet: any,
  tokenName: string,
  tokenSymbol: string,
  launchPercentage: number,
): Promise<{ success: boolean; approveTxHash?: string; launchTxHash?: string; wrapperAddress?: string; error?: string }> {
  try {
    if (!primaryWallet) {
      throw new Error("No wallet connected");
    }

    logger.log('🔥 Dynamic Launch - WRITE Operation (Sovry Launchpad)');
    logger.log('Launch params:', { 
      royaltyToken: royaltyTokenAddress,
      launchpad: _SOVRY_LAUNCHPAD_ADDRESS,
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

    logger.log('✅ Launch token address is a contract');

    // For Sovry we treat the provided royaltyTokenAddress as the actual ERC20
    // launch token. The address comes from Story's royalty vault and is already
    // an ERC20, so we don't need to probe token()/asset() on wrapper contracts.
    const actualToken = royaltyTokenAddress as string;

    // Verify actual token looks like an ERC20
    try {
      const symbol = await publicClient.readContract({
        address: actualToken as Address,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      logger.log('✅ Launch token is ERC20, symbol:', symbol);
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

    logger.log('💰 User launch token balance:', userBalance.toString());

    if (userBalance === 0n) {
      throw new Error('You have no royalty tokens to launch. Please Get Royalty Tokens first.');
    }

    // Clamp percentage between 25 and 100 to respect minimum launch size
    const pct = BigInt(
      Math.min(
        Math.max(Math.floor(launchPercentage || 0), 25),
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
      args: [_SOVRY_LAUNCHPAD_ADDRESS as Address, amountToLock],
    });

    logger.log('📤 Sending approve transaction for launch token via Dynamic...');
    const approveTxHash = await walletClient.sendTransaction({
      to: actualToken as Address,
      data: approveData,
    });

    logger.log('✅ Launch token approve success! Tx Hash:', approveTxHash);

    const basePrice = DEFAULT_BASE_PRICE_WEI;
    const priceIncrement = DEFAULT_PRICE_INCREMENT_WEI;

    // Call SovryLaunchpad.launchToken(royaltyToken, amountToLock, name, symbol)
    const launchData = encodeFunctionData({
      abi: SOVRY_LAUNCHPAD_ABI,
      functionName: 'launchToken',
      args: [
        actualToken as Address,
        amountToLock,
        tokenName,
        tokenSymbol,
        basePrice,
        priceIncrement,
      ],
    });

    logger.log('📤 Calling SovryLaunchpad.launchToken...');
    const launchTxHash = await walletClient.sendTransaction({
      to: _SOVRY_LAUNCHPAD_ADDRESS as Address,
      data: launchData,
    });

    // Wait for on-chain confirmation so UI reflects actual success/failure
    try {
      logger.log('⏳ Waiting for launch transaction confirmation...');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: launchTxHash,
      });

      if (receipt.status !== 'success') {
        logger.error('❌ Launch transaction reverted on-chain:', receipt);
        return {
          success: false,
          approveTxHash,
          launchTxHash,
          error: 'Launch transaction reverted on-chain',
        };
      }
    } catch (waitError) {
      logger.error('❌ Error waiting for launch transaction receipt:', waitError);
      return {
        success: false,
        approveTxHash,
        launchTxHash,
        error: mapLaunchError(waitError),
      };
    }

    logger.log('✅ SovryLaunchpad launch success! Tx Hash:', launchTxHash);

    let wrapperAddress: string | undefined;
    try {
      const mapped = await publicClient.readContract({
        address: _SOVRY_LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_VIEW_ABI,
        functionName: 'rtToWrapper',
        args: [actualToken as Address],
      }) as string;

      if (mapped && mapped !== '0x0000000000000000000000000000000000000000') {
        wrapperAddress = mapped;
      } else {
        logger.warn('rtToWrapper returned zero address for', actualToken);
      }
    } catch (mapError) {
      logger.error('Error reading rtToWrapper from launchpad:', mapError);
    }

    return {
      success: true,
      approveTxHash,
      launchTxHash,
      wrapperAddress,
    };
  } catch (error) {
    logger.error('❌ Launch on bonding curve failed:', error);
    return {
      success: false,
      error: mapLaunchError(error),
    };
  }
}

*/

export type { RoyaltyLockInfo } from "./domain/royalty.service";

export { getRoyaltyLockInfo } from "./domain/royalty.service";

export { SOVRY_LAUNCHPAD_ADDRESS, launchOnBondingCurveDynamic } from "./domain/bondingCurve.service";

export type { IPAsset } from "./domain/ipAsset.service";

export { fetchWalletIPAssets } from "./domain/ipAsset.service";

export type { TokenBalance } from "./domain/token.service";

export { getTokenBalance, needsTokenUnlock } from "./domain/token.service";

export {
  claimRevenueToWalletAndPump,
  getRoyaltyVaultAddress,
  checkRoyaltyTokens,
  getClaimableRoyaltyForIp,
} from "./domain/royalty.service";
