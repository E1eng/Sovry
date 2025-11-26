import { createPublicClient, http, Address, formatEther } from "viem";
import { erc20Abi } from "viem";

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io";

const publicClient = createPublicClient({
  chain: {
    id: 1315,
    name: "Story Aeneid Testnet",
    nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
    rpcUrls: {
      default: { http: [STORY_RPC_URL] },
    },
  },
  transport: http(STORY_RPC_URL),
});

export interface HolderInfo {
  address: string;
  balance: bigint;
  balanceFormatted: string;
  percentage: number;
}

export interface HolderDistribution {
  holders: HolderInfo[];
  totalHolders: number;
  totalSupply: bigint;
  top10Percentage: number;
  top20Percentage: number;
}

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn";

/**
 * Fetch holder distribution from ERC20 Transfer events
 * This is a simplified approach - in production, you'd want to use a subgraph
 * that tracks Transfer events and aggregates balances
 */
export async function getHolderDistribution(
  tokenAddress: string,
  limit: number = 50
): Promise<HolderDistribution | null> {
  try {
    // Get total supply
    const totalSupply = (await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "totalSupply",
    })) as bigint;

    if (totalSupply === 0n) {
      return {
        holders: [],
        totalHolders: 0,
        totalSupply: 0n,
        top10Percentage: 0,
        top20Percentage: 0,
      };
    }

    // Try to get holders from subgraph if available
    // For now, we'll use a simplified approach with Transfer events
    // In production, you should have a subgraph that tracks balances

    // Query Transfer events from subgraph
    const query = `
      query GetTransfers($token: Bytes!, $limit: Int!) {
        transfers(
          first: $limit
          where: { token: $token }
          orderBy: blockNumber
          orderDirection: desc
        ) {
          id
          from
          to
          value
          blockNumber
        }
      }
    `;

    let holders: HolderInfo[] = [];
    let uniqueAddresses = new Set<string>();

    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: {
            token: tokenAddress.toLowerCase(),
            limit: 1000, // Get more transfers to calculate balances
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const transfers = (json?.data?.transfers || []) as Array<{
          from: string;
          to: string;
          value: string;
        }>;

        // Calculate balances from transfers
        const balances = new Map<string, bigint>();

        transfers.forEach((transfer) => {
          const value = BigInt(transfer.value || "0");
          
          // Subtract from sender
          if (transfer.from && transfer.from !== "0x0000000000000000000000000000000000000000") {
            const current = balances.get(transfer.from.toLowerCase()) || 0n;
            balances.set(transfer.from.toLowerCase(), current - value);
          }

          // Add to receiver
          if (transfer.to && transfer.to !== "0x0000000000000000000000000000000000000000") {
            const current = balances.get(transfer.to.toLowerCase()) || 0n;
            balances.set(transfer.to.toLowerCase(), current + value);
          }
        });

        // Convert to holder info
        holders = Array.from(balances.entries())
          .filter(([_, balance]) => balance > 0n)
          .map(([address, balance]) => ({
            address,
            balance,
            balanceFormatted: formatEther(balance),
            percentage: totalSupply > 0n ? (Number(balance) / Number(totalSupply)) * 100 : 0,
          }))
          .sort((a, b) => (b.balance > a.balance ? 1 : -1))
          .slice(0, limit);

        uniqueAddresses = new Set(holders.map((h) => h.address));
      }
    } catch (subgraphError) {
      console.warn("Subgraph query failed, using fallback method:", subgraphError);
    }

    // Fallback: If subgraph doesn't have Transfer events, try to get balances
    // for known addresses (launchpad, creator, etc.)
    if (holders.length === 0) {
      // This is a simplified fallback - in production, you'd want proper indexing
      console.warn("No holder data from subgraph, using fallback");
    }

    // Calculate top 10 and top 20 percentages
    const top10 = holders.slice(0, 10);
    const top20 = holders.slice(0, 20);
    const top10Balance = top10.reduce((sum, h) => sum + h.balance, 0n);
    const top20Balance = top20.reduce((sum, h) => sum + h.balance, 0n);
    const top10Percentage = totalSupply > 0n ? (Number(top10Balance) / Number(totalSupply)) * 100 : 0;
    const top20Percentage = totalSupply > 0n ? (Number(top20Balance) / Number(totalSupply)) * 100 : 0;

    return {
      holders,
      totalHolders: uniqueAddresses.size || holders.length,
      totalSupply,
      top10Percentage,
      top20Percentage,
    };
  } catch (error) {
    console.error("Error fetching holder distribution:", error);
    return null;
  }
}

/**
 * Get balance for a specific address
 */
export async function getHolderBalance(
  tokenAddress: string,
  holderAddress: string
): Promise<bigint | null> {
  try {
    const balance = (await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [holderAddress as Address],
    })) as bigint;

    return balance;
  } catch (error) {
    console.error("Error fetching holder balance:", error);
    return null;
  }
}

