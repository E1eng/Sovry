const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn"

export interface GraduationInfo {
  timestamp: number
  poolAddress: string
  totalLiquidity: bigint
  txHash: string
}

/**
 * Fetch graduation information for a token from subgraph
 */
export async function getGraduationInfo(tokenAddress: string): Promise<GraduationInfo | null> {
  try {
    const query = `
      query GetGraduation($token: Bytes!) {
        graduations(
          where: { token: $token }
          orderBy: timestamp
          orderDirection: desc
          first: 1
        ) {
          id
          timestamp
          pool
          totalLiquidity
          txHash
        }
      }
    `

    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          token: tokenAddress.toLowerCase(),
        },
      }),
    })

    if (!response.ok) {
      return null
    }

    const json = await response.json()
    const graduations = json?.data?.graduations || []

    if (graduations.length === 0) {
      return null
    }

    const grad = graduations[0]
    return {
      timestamp: Number(grad.timestamp),
      poolAddress: grad.pool,
      totalLiquidity: BigInt(grad.totalLiquidity || "0"),
      txHash: grad.txHash,
    }
  } catch (error) {
    console.error("Error fetching graduation info:", error)
    return null
  }
}

export interface WrapperTokenMeta {
  rt: string
  creator: string
  launchTime: number
  totalLocked: string
  graduated: boolean
  dexReserve: string
  initialCurveSupply: string
  totalRoyaltiesHarvested: string
  poolAddress?: string | null
  createdAt: number
  updatedAt: number
  totalTokens?: number
  totalTrades?: number
  totalVolume?: string
}

/**
 * Fetch WrapperToken metadata for a given wrapper address from the subgraph
 */
export async function getWrapperTokenMeta(tokenAddress: string): Promise<WrapperTokenMeta | null> {
  try {
    const query = `
      query GetWrapperToken($id: ID!) {
        wrapperToken(id: $id) {
          rt
          creator
          launchTime
          totalLocked
          graduated
          dexReserve
          initialCurveSupply
          totalRoyaltiesHarvested
          poolAddress
          createdAt
          updatedAt
          launchpad {
            totalTokens
            totalTrades
            totalVolume
          }
        }
      }
    `

    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          id: tokenAddress.toLowerCase(),
        },
      }),
    })

    if (!response.ok) {
      return null
    }

    const json = await response.json()
    const wrapper = json?.data?.wrapperToken
    if (!wrapper) {
      return null
    }

    const launchpad = (wrapper.launchpad || null) as
      | { totalTokens?: number; totalTrades?: number; totalVolume?: string }
      | null
      | undefined

    return {
      rt: wrapper.rt as string,
      creator: wrapper.creator as string,
      launchTime: Number(wrapper.launchTime ?? 0),
      totalLocked:
        typeof wrapper.totalLocked === "string"
          ? wrapper.totalLocked
          : String(wrapper.totalLocked ?? "0"),
      graduated: Boolean(wrapper.graduated),
      dexReserve:
        typeof wrapper.dexReserve === "string"
          ? wrapper.dexReserve
          : String(wrapper.dexReserve ?? "0"),
      initialCurveSupply:
        typeof wrapper.initialCurveSupply === "string"
          ? wrapper.initialCurveSupply
          : String(wrapper.initialCurveSupply ?? "0"),
      totalRoyaltiesHarvested:
        typeof wrapper.totalRoyaltiesHarvested === "string"
          ? wrapper.totalRoyaltiesHarvested
          : String(wrapper.totalRoyaltiesHarvested ?? "0"),
      poolAddress: (wrapper.poolAddress as string | null) ?? null,
      createdAt: Number(wrapper.createdAt ?? 0),
      updatedAt: Number(wrapper.updatedAt ?? 0),
      totalTokens:
        launchpad && launchpad.totalTokens != null
          ? Number(launchpad.totalTokens)
          : undefined,
      totalTrades:
        launchpad && launchpad.totalTrades != null
          ? Number(launchpad.totalTrades)
          : undefined,
      totalVolume:
        launchpad && launchpad.totalVolume != null
          ? String(launchpad.totalVolume)
          : undefined,
    }
  } catch (error) {
    console.error("Error fetching wrapper token meta:", error)
    return null
  }
}



