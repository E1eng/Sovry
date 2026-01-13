import { logger } from "@/lib/logger";
import { fetchSubgraph } from "@/services/subgraph";

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

    const { ok, json } = await fetchSubgraph(query, {
      token: tokenAddress.toLowerCase(),
    })

    if (!ok) {
      return null
    }
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
    logger.error("Error fetching graduation info:", error)
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

    const { ok, json } = await fetchSubgraph(query, {
      id: tokenAddress.toLowerCase(),
    })

    if (!ok) {
      return null
    }
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
    logger.error("Error fetching wrapper token meta:", error)
    return null
  }
}

export interface PremineClaimInfo {
  creator: string
  amount: bigint
  timestamp: number
  txHash: string
}

export async function getLatestPremineClaim(
  tokenAddress: string,
): Promise<PremineClaimInfo | null> {
  try {
    const query = `
      query GetPremineClaims($wrapper: String!) {
        premineClaims(
          where: { wrapper: $wrapper }
          orderBy: timestamp
          orderDirection: desc
          first: 1
        ) {
          creator
          amount
          txHash
          timestamp
        }
      }
    `

    const { ok, json } = await fetchSubgraph(query, {
      wrapper: tokenAddress.toLowerCase(),
    })

    if (!ok) {
      return null
    }
    const claims = json?.data?.premineClaims || []

    if (claims.length === 0) {
      return null
    }

    const claim = claims[0]
    return {
      creator: claim.creator as string,
      amount: BigInt(claim.amount || "0"),
      timestamp: Number(claim.timestamp ?? 0),
      txHash: claim.txHash as string,
    }
  } catch (error) {
    logger.error("Error fetching latest premine claim:", error)
    return null
  }
}

export interface ThresholdUpdateInfo {
  newThreshold: bigint
  timestamp: number
  txHash: string
}

export async function getLatestGraduationThreshold(): Promise<ThresholdUpdateInfo | null> {
  try {
    const query = `
      query GetLatestGraduationThreshold {
        graduationThresholdUpdates(
          orderBy: timestamp
          orderDirection: desc
          first: 1
        ) {
          newThreshold
          txHash
          timestamp
        }
      }
    `

    const { ok, json } = await fetchSubgraph(query)

    if (!ok) {
      return null
    }
    const updates = json?.data?.graduationThresholdUpdates || []

    if (updates.length === 0) {
      return null
    }

    const upd = updates[0]
    return {
      newThreshold: BigInt(upd.newThreshold || "0"),
      timestamp: Number(upd.timestamp ?? 0),
      txHash: upd.txHash as string,
    }
  } catch (error) {
    logger.error("Error fetching latest graduation threshold:", error)
    return null
  }
}