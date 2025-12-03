const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL

export interface HolderBalance {
  address: string;
  balanceRaw: bigint;
  balanceFormatted: string;
  percentage: number;
}

export interface HolderDistribution {
  holders: HolderBalance[];
  totalHolders: number;
  top10Percentage: number;
  top20Percentage: number;
}

export async function getHolderDistribution(
  tokenAddress: string,
  maxHolders: number = 100,
): Promise<HolderDistribution> {
  if (!tokenAddress) {
    throw new Error("Token address is required");
  }

  const query = `
    query TopHolders($wrapper: ID!) {
      wrapperToken(id: $wrapper) {
        holders {
          id
          balance
        }
      }
    }
  `;

  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        wrapper: tokenAddress.toLowerCase(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch holders from subgraph");
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    // Surface GraphQL errors to the caller for easier debugging
    console.error("Subgraph holder query returned errors", json.errors);
    throw new Error(json.errors[0]?.message || "Subgraph holder query failed");
  }
  const rawHolders = (json?.data?.wrapperToken?.holders || []) as any[];

  if (!rawHolders.length) {
    return {
      holders: [],
      totalHolders: 0,
      top10Percentage: 0,
      top20Percentage: 0,
    };
  }

  const holders: HolderBalance[] = [];
  for (const h of rawHolders) {
    const holderId: string = h?.id || "";
    if (!holderId) continue;

    // holder.id is constructed as `${wrapper}-${user}` in the subgraph
    const parts = holderId.split("-");
    const address = parts.length > 1 ? parts[1] : "";
    if (!address) continue;

    let balanceRaw: bigint;
    try {
      balanceRaw = BigInt(h.balance || "0");
    } catch {
      continue;
    }

    if (balanceRaw <= 0n) continue;

    const balanceFloat = Number(balanceRaw) / 1e6; // wrapper uses 6 decimals
    const balanceFormatted = balanceFloat.toFixed(4);

    holders.push({
      address,
      balanceRaw,
      balanceFormatted,
      percentage: 0,
    });
  }

  if (!holders.length) {
    return {
      holders: [],
      totalHolders: 0,
      top10Percentage: 0,
      top20Percentage: 0,
    };
  }

  // Sort by balance descending just in case
  holders.sort((a, b) => (a.balanceRaw > b.balanceRaw ? -1 : a.balanceRaw < b.balanceRaw ? 1 : 0));

  const trimmed = holders.slice(0, maxHolders);
  const totalBalance = trimmed.reduce((acc, h) => acc + h.balanceRaw, 0n);
  const totalFloat = Number(totalBalance) / 1e6 || 1; // avoid divide-by-zero

  trimmed.forEach((h) => {
    const value = Number(h.balanceRaw) / 1e6;
    h.percentage = (value / totalFloat) * 100;
  });

  const totalHolders = trimmed.length;
  const top10 = trimmed.slice(0, 10).reduce((acc, h) => acc + h.percentage, 0);
  const top20 = trimmed.slice(0, 20).reduce((acc, h) => acc + h.percentage, 0);

  return {
    holders: trimmed,
    totalHolders,
    top10Percentage: top10,
    top20Percentage: top20,
  };
}
