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


