import { NextResponse } from "next/server"
import { createPublicClient, fallback, http, type Address, formatEther } from "viem"
import { getSubgraphUrl, STORY_RPC_URLS } from "@/lib/env"
import { exchangeReadAbi } from "@/constants/abis"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRADUATION_THRESHOLD_IP = 10_000
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const EXCHANGE_ADDRESS = process.env.NEXT_PUBLIC_EXCHANGE_ADDRESS as Address
if (!EXCHANGE_ADDRESS) {
  throw new Error("NEXT_PUBLIC_EXCHANGE_ADDRESS is required")
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

let _sb: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null
  if (!_sb) _sb = createClient(supabaseUrl, supabaseKey)
  return _sb
}

function getPublicClient() {
  return createPublicClient({
    chain: {
      id: 1514,
      name: "Story Mainnet",
      nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
      rpcUrls: { default: { http: STORY_RPC_URLS } },
      blockExplorers: { default: { name: "StoryScan", url: "https://storyscan.xyz" } },
    },
    transport: fallback(STORY_RPC_URLS.map((url) => http(url))),
  })
}

function normalizeAddress(value: string | null | undefined): string {
  const v = String(value || "").toLowerCase()
  if (!v) return ""
  const no0x = v.startsWith("0x") ? v.slice(2) : v
  if (/^[0-9a-f]{40}$/.test(no0x)) return `0x${no0x}`
  if (/^0x[0-9a-f]{40}$/.test(v)) return v
  return v
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(addr) && addr !== ZERO_ADDRESS
}

function toIpFloat(rawWei: string | null | undefined): number {
  try {
    return Number(formatEther(BigInt(rawWei || "0")))
  } catch {
    return 0
  }
}

interface TokenRow {
  token_address: string
  name: string | null
  symbol: string | null
  image_uri: string | null
  creator: string | null
  created_at: string | null
}

interface SubgraphTradeRow {
  wrapper?: { id?: string | null } | null
  timestamp?: string | null
  amount?: string | null
  value?: string | null
  fee?: string | null
}

interface EnrichedLaunch {
  id: string
  token: string
  creator: string
  createdAt: number
  name?: string
  symbol?: string
  imageUrl?: string
  marketCap?: string
  bondingProgress?: number
  currentPrice?: number
  volume24h?: string
  dailyChangePct?: number | null
  graduated?: boolean
}

async function fetchSubgraphDirect(query: string, variables?: Record<string, unknown>) {
  const url = getSubgraphUrl()
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  return { ok: res.ok, json }
}

async function fetchTokensFromDB(limit: number): Promise<TokenRow[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("tokens")
    .select("token_address, name, symbol, image_uri, creator, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error || !Array.isArray(data)) return []
  return data as TokenRow[]
}

async function resolveWrappers(addresses: string[]): Promise<Map<string, string>> {
  const mapped = new Map<string, string>()
  const valid = addresses.filter(isValidAddress)
  if (valid.length === 0) return mapped

  const [byIdRes, byRtRes] = await Promise.all([
    fetchSubgraphDirect(
      `query($ids:[String!]!){wrapperTokens(where:{id_in:$ids}){id rt}}`,
      { ids: valid }
    ),
    fetchSubgraphDirect(
      `query($rts:[String!]!){wrapperTokens(where:{rt_in:$rts}){id rt}}`,
      { rts: valid }
    ),
  ])

  const rowsById = (byIdRes.ok ? byIdRes.json?.data?.wrapperTokens || [] : []) as Array<{ id?: string; rt?: string }>
  const rowsByRt = (byRtRes.ok ? byRtRes.json?.data?.wrapperTokens || [] : []) as Array<{ id?: string; rt?: string }>

  for (const row of [...rowsById, ...rowsByRt]) {
    const wrapper = normalizeAddress(row.id)
    const rt = normalizeAddress(row.rt)
    if (isValidAddress(wrapper)) {
      mapped.set(wrapper, wrapper)
      if (isValidAddress(rt)) {
        mapped.set(rt, wrapper)
      }
    }
  }

  return mapped
}

async function fetchOnchainState(client: ReturnType<typeof getPublicClient>, wrapperAddr: Address) {
  try {
    const [tokenInfoRaw, curveRaw, marketCapRaw] = await Promise.all([
      client.readContract({
        address: EXCHANGE_ADDRESS,
        abi: exchangeReadAbi,
        functionName: "launchedTokens",
        args: [wrapperAddr],
      }),
      client.readContract({
        address: EXCHANGE_ADDRESS,
        abi: exchangeReadAbi,
        functionName: "bondingCurves",
        args: [wrapperAddr],
      }),
      client.readContract({
        address: EXCHANGE_ADDRESS,
        abi: exchangeReadAbi,
        functionName: "getMarketCap",
        args: [wrapperAddr],
      }),
    ])

    const tokenInfo = tokenInfoRaw as unknown as Record<string, unknown>
    const curve = curveRaw as unknown as Record<string, unknown>

    const wrapperAddress = (tokenInfo?.wrapperAddress ?? (tokenInfo as unknown as unknown[])?.[1]) as string | undefined
    if (!wrapperAddress || normalizeAddress(wrapperAddress) === ZERO_ADDRESS) return null

    const graduated = Boolean(tokenInfo?.graduated ?? (tokenInfo as unknown as unknown[])?.[6])

    const basePrice = BigInt((curve?.basePrice ?? (curve as unknown as unknown[])?.[0] ?? 0n) as bigint)
    const priceIncrement = BigInt((curve?.priceIncrement ?? (curve as unknown as unknown[])?.[1] ?? 0n) as bigint)
    const currentSupply = BigInt((curve?.currentSupply ?? (curve as unknown as unknown[])?.[2] ?? 0n) as bigint)
    const initialCurveSupply = BigInt((tokenInfo?.initialCurveSupply ?? (tokenInfo as unknown as unknown[])?.[10] ?? 0n) as bigint)

    const soldRaw = initialCurveSupply > currentSupply ? initialCurveSupply - currentSupply : 0n
    const soldUnits = soldRaw / (10n ** 18n)
    const currentPriceWei = basePrice + soldUnits * priceIncrement

    const marketCapWei = BigInt((marketCapRaw as bigint | undefined) ?? 0n)
    const marketCap = formatEther(marketCapWei)
    const marketCapNum = Number(marketCap)

    const bondingProgress = GRADUATION_THRESHOLD_IP > 0 && isFinite(marketCapNum)
      ? Math.max(0, Math.min(100, (marketCapNum / GRADUATION_THRESHOLD_IP) * 100))
      : 0

    const currentPrice = currentPriceWei > 0n ? Number(formatEther(currentPriceWei)) : 0

    return { marketCap, bondingProgress, currentPrice, graduated }
  } catch {
    return null
  }
}

function computePrice(trade: SubgraphTradeRow): number {
  const amount = toIpFloat(trade.amount)
  if (amount <= 0) return 0
  return (toIpFloat(trade.value) + toIpFloat(trade.fee)) / amount
}

async function fetchTradeStats(wrapperIds: string[], fromTimestamp: number) {
  const result = new Map<string, { volume24h: number; dailyChangePct: number | null; newestPrice: number }>()
  if (wrapperIds.length === 0) return result

  const ids = wrapperIds.filter(isValidAddress)
  if (ids.length === 0) return result

  // Try 24h trades first
  const { ok, json } = await fetchSubgraphDirect(
    `query($ids:[String!]!,$from:BigInt!){trades(where:{wrapper_in:$ids,timestamp_gte:$from},orderBy:timestamp,orderDirection:desc,first:1000){wrapper{id}timestamp amount value fee}}`,
    { ids, from: String(fromTimestamp) }
  )

  let trades: SubgraphTradeRow[] = []
  if (ok) {
    trades = ((json?.data as Record<string, unknown>)?.trades || []) as SubgraphTradeRow[]
  }

  // If no 24h trades, try all trades (no time filter)
  if (trades.length === 0) {
    const fallbackRes = await fetchSubgraphDirect(
      `query($ids:[String!]!){trades(where:{wrapper_in:$ids},orderBy:timestamp,orderDirection:desc,first:1000){wrapper{id}timestamp amount value fee}}`,
      { ids }
    )
    if (fallbackRes.ok) {
      trades = ((fallbackRes.json?.data as Record<string, unknown>)?.trades || []) as SubgraphTradeRow[]
    }
  }

  if (trades.length === 0) return result

  const lowPriceByWrapper = new Map<string, number>()

  for (const tr of trades) {
    const wrapperId = normalizeAddress(tr?.wrapper?.id)
    if (!wrapperId || !isValidAddress(wrapperId)) continue

    const totalIp = toIpFloat(tr.value) + toIpFloat(tr.fee)
    const price = computePrice(tr)

    const existing = result.get(wrapperId)
    if (!existing) {
      result.set(wrapperId, { volume24h: totalIp, dailyChangePct: null, newestPrice: price })
    } else {
      existing.volume24h += totalIp
    }

    if (price > 0) {
      const prevLow = lowPriceByWrapper.get(wrapperId) || 0
      if (prevLow === 0 || price < prevLow) {
        lowPriceByWrapper.set(wrapperId, price)
      }
    }
  }

  for (const [wrapperId, stats] of result.entries()) {
    const low = lowPriceByWrapper.get(wrapperId) || 0
    if (low > 0 && stats.newestPrice > 0) {
      stats.dailyChangePct = ((stats.newestPrice - low) / low) * 100
    }
  }

  return result
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get("limit") || "24"), 100)

    // 1. Fetch tokens from Supabase
    const rows = await fetchTokensFromDB(limit)
    if (rows.length === 0) {
      return NextResponse.json({ launches: [] })
    }

    const addresses = rows.map((r) => normalizeAddress(r.token_address))

    // 2. Resolve wrapper addresses via subgraph
    const wrapperMap = await resolveWrappers(addresses)

    const resolvedAddresses = addresses.map((addr) => wrapperMap.get(addr) || addr)
    const uniqueWrapperIds = Array.from(new Set(resolvedAddresses.filter(isValidAddress)))

    // 3. Fetch onchain state for each wrapper
    const client = getPublicClient()
    const onchainResults = await Promise.allSettled(
      uniqueWrapperIds.map((w) => fetchOnchainState(client, w as Address))
    )
    const stateMap = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchOnchainState>>>>()
    for (let i = 0; i < uniqueWrapperIds.length; i++) {
      const r = onchainResults[i]
      if (r.status === "fulfilled" && r.value) {
        stateMap.set(uniqueWrapperIds[i], r.value)
      }
    }

    // 4. Fetch trade stats
    const now = Math.floor(Date.now() / 1000)
    const from24h = now - 86400
    const tradeStatsMap = await fetchTradeStats(uniqueWrapperIds, from24h)

    // 5. Assemble enriched launches
    const launches: EnrichedLaunch[] = rows.map((row, i) => {
      const wrapperId = resolvedAddresses[i]
      const state = stateMap.get(wrapperId)
      const stats = tradeStatsMap.get(wrapperId)

      const volume24h = stats?.volume24h ?? 0
      const newestPrice = stats?.newestPrice ?? 0
      const dailyChangePct = stats?.dailyChangePct ?? null

      const currentPrice = state?.currentPrice && state.currentPrice > 0
        ? state.currentPrice
        : newestPrice > 0
          ? newestPrice
          : undefined

      const createdAt = row.created_at ? Math.floor(new Date(row.created_at).getTime() / 1000) : 0

      return {
        id: wrapperId,
        token: wrapperId,
        creator: (row.creator || "").toLowerCase(),
        createdAt,
        name: row.name || undefined,
        symbol: row.symbol || undefined,
        imageUrl: row.image_uri || undefined,
        marketCap: state?.marketCap,
        bondingProgress: state?.bondingProgress,
        currentPrice,
        volume24h: volume24h > 0 ? String(volume24h) : undefined,
        dailyChangePct,
        graduated: state?.graduated,
      }
    })

    return NextResponse.json({ launches })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[api/launches] Error:", message, err)
    return NextResponse.json({ launches: [], error: message }, { status: 500 })
  }
}
