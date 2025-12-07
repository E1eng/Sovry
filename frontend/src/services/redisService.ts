// Use dynamic require so Redis is truly optional for this frontend bundle.
// This avoids hard dependency/type errors when @upstash/redis is not installed.
let Redis: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Redis = require('@upstash/redis').Redis
} catch {
  Redis = null
}

// Initialize Upstash Redis client with error handling and fallback
let redis: any | null = null;
let redisEnabled = true;

// Try to initialize Redis, but don't fail if configuration is wrong
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      retry: {
        retries: 2,
        backoff: (retryCount: number) => 1000 * retryCount,
      },
    });
  } else {
    console.warn('⚠️ Redis environment variables not found, caching disabled');
    redisEnabled = false;
  }
} catch (error) {
  console.warn('⚠️ Failed to initialize Redis, caching disabled:', error);
  redis = null;
  redisEnabled = false;
}

// Cache keys
const CACHE_KEYS = {
  POOLS: 'sovry:pools',
  POOL_DATA: (poolId: string) => `sovry:pool:${poolId}`,
  USER_POOLS: (address: string) => `sovry:user:${address}:pools`,
  SWAP_HISTORY: (address: string) => `sovry:user:${address}:swaps`,
  TOKEN_PRICES: 'sovry:token:prices',
  GOLDSKY_RESPONSE: 'sovry:goldsky:pools',
} as const

// Cache TTL (Time To Live) in seconds
const CACHE_TTL = {
  POOLS: 300, // 5 minutes
  POOL_DATA: 180, // 3 minutes
  USER_DATA: 600, // 10 minutes
  TOKEN_PRICES: 120, // 2 minutes
  GOLDSKY_RESPONSE: 240, // 4 minutes
} as const

export interface CachedPool {
  id: string
  token0: {
    id: string
    symbol: string
    name: string
  }
  token1: {
    id: string
    symbol: string
    name: string
  }
  reserve0: string
  reserve1: string
  totalSupply: string
  volumeUSD: string
  txCount: string
  createdAtTimestamp: string
  cached_at: number
}

export interface SwapTransaction {
  id: string
  pool: string
  token0Symbol: string
  token1Symbol: string
  amount0: string
  amount1: string
  timestamp: number
  txHash: string
}

// Validate Redis connection and environment variables
const validateRedisConfig = (): boolean => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token) {
    // Redis is optional - don't log errors in development
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Redis configuration missing: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
    }
    return false
  }
  
  if (!url.startsWith('https://')) {
    console.error('❌ Invalid Redis URL format. Must start with https://')
    return false
  }
  
  return true
}

export class RedisService {
  // --- CONNECTION VALIDATION ---
  static isConfigValid(): boolean {
    return validateRedisConfig() && redisEnabled && redis !== null
  }

  static async testConnection(): Promise<boolean> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping connection test')
        return false
      }
      
      // Simple ping test
      const testKey = 'sovry:test:connection'
      const testValue = 'test-' + Date.now()
      
      await redis!.setex(testKey, 10, testValue)
      const retrieved = await redis!.get(testKey)
      await redis!.del(testKey)
      
      const success = retrieved === testValue
      console.log(success ? '✅ Redis connection test passed' : '❌ Redis connection test failed')
      return success
    } catch (error) {
      console.error('❌ Redis connection test failed:', error)
      return false
    }
  }

  // --- POOL CACHING ---
  static async cachePoolsData(pools: CachedPool[]): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      const poolsWithTimestamp = pools.map(pool => ({
        ...pool,
        cached_at: Date.now()
      }))
      
      await redis!.setex(
        CACHE_KEYS.POOLS,
        CACHE_TTL.POOLS,
        JSON.stringify(poolsWithTimestamp)
      )
      
      console.log(`✅ Cached ${pools.length} pools to Redis`)
    } catch (error) {
      console.error('❌ Failed to cache pools data:', error)
      // Don't rethrow - allow application to continue without cache
    }
  }

  static async getCachedPoolsData(): Promise<CachedPool[] | null> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured, skipping cache')
        return null
      }

      const cached = await redis!.get(CACHE_KEYS.POOLS)
      if (cached && typeof cached === 'string') {
        try {
          const pools = JSON.parse(cached) as CachedPool[]
          console.log(`✅ Retrieved ${pools.length} pools from Redis cache`)
          return pools
        } catch (parseError) {
          console.error('❌ Failed to parse cached pools JSON:', parseError)
          // Clear corrupted cache
          await redis!.del(CACHE_KEYS.POOLS)
          return null
        }
      }
      return null
    } catch (error) {
      console.error('❌ Failed to get cached pools:', error)
      return null
    }
  }

  static async cacheGoldskyResponse(response: any): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      const responseWithTimestamp = {
        ...response,
        cached_at: Date.now()
      }
      
      await redis!.setex(
        CACHE_KEYS.GOLDSKY_RESPONSE,
        CACHE_TTL.GOLDSKY_RESPONSE,
        JSON.stringify(responseWithTimestamp)
      )
      
      console.log('✅ Cached Goldsky response to Redis')
    } catch (error) {
      console.error('❌ Failed to cache Goldsky response:', error)
      // Don't rethrow - allow application to continue without cache
    }
  }

  static async getCachedGoldskyResponse(): Promise<any | null> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured, skipping cache')
        return null
      }

      const cached = await redis!.get(CACHE_KEYS.GOLDSKY_RESPONSE)
      if (cached && typeof cached === 'string') {
        try {
          const response = JSON.parse(cached)
          console.log('✅ Retrieved Goldsky response from cache')
          return response
        } catch (parseError) {
          console.error('❌ Failed to parse cached Goldsky response JSON:', parseError)
          // Clear corrupted cache
          await redis!.del(CACHE_KEYS.GOLDSKY_RESPONSE)
          return null
        }
      }
      return null
    } catch (error) {
      console.error('❌ Failed to get cached Goldsky response:', error)
      return null
    }
  }

  // --- USER DATA CACHING ---
  static async cacheUserPools(userAddress: string, pools: string[]): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      const userPoolsData = {
        pools,
        cached_at: Date.now()
      }
      
      await redis!.setex(
        CACHE_KEYS.USER_POOLS(userAddress.toLowerCase()),
        CACHE_TTL.USER_DATA,
        JSON.stringify(userPoolsData)
      )
      
      console.log(`✅ Cached user pools for ${userAddress}`)
    } catch (error) {
      console.error('❌ Failed to cache user pools:', error)
      // Don't rethrow - allow application to continue without cache
    }
  }

  static async getCachedUserPools(userAddress: string): Promise<string[] | null> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured, skipping cache')
        return null
      }

      const cached = await redis!.get(CACHE_KEYS.USER_POOLS(userAddress.toLowerCase()))
      if (cached) {
        const data = JSON.parse(cached as string)
        console.log(`✅ Retrieved user pools for ${userAddress} from cache`)
        return data.pools
      }
      return null
    } catch (error) {
      console.error('❌ Failed to get cached user pools:', error)
      return null
    }
  }

  // --- SWAP HISTORY ---
  static async addSwapToHistory(userAddress: string, swap: SwapTransaction): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      const key = CACHE_KEYS.SWAP_HISTORY(userAddress.toLowerCase())
      
      // Get existing history
      const existing = await redis!.get(key)
      let swapHistory: SwapTransaction[] = []
      
      if (existing) {
        const data = JSON.parse(existing as string)
        swapHistory = data.swaps || []
      }
      
      // Add new swap to beginning of array
      swapHistory.unshift(swap)
      
      // Keep only last 50 swaps
      if (swapHistory.length > 50) {
        swapHistory = swapHistory.slice(0, 50)
      }
      
      const historyData = {
        swaps: swapHistory,
        updated_at: Date.now()
      }
      
      await redis!.setex(
        key,
        CACHE_TTL.USER_DATA,
        JSON.stringify(historyData)
      )
      
      console.log(`✅ Added swap to history for ${userAddress}`)
    } catch (error) {
      console.error('❌ Failed to add swap to history:', error)
      // Don't rethrow - allow application to continue without cache
    }
  }

  static async getUserSwapHistory(userAddress: string): Promise<SwapTransaction[]> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured, skipping cache')
        return []
      }

      const cached = await redis!.get(CACHE_KEYS.SWAP_HISTORY(userAddress.toLowerCase()))
      if (cached) {
        const data = JSON.parse(cached as string)
        console.log(`✅ Retrieved swap history for ${userAddress}`)
        return data.swaps || []
      }
      return []
    } catch (error) {
      console.error('❌ Failed to get swap history:', error)
      return []
    }
  }

  // --- TOKEN PRICES ---
  static async cacheTokenPrices(prices: Record<string, number>): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      const pricesWithTimestamp = {
        prices,
        cached_at: Date.now()
      }
      
      await redis!.setex(
        CACHE_KEYS.TOKEN_PRICES,
        CACHE_TTL.TOKEN_PRICES,
        JSON.stringify(pricesWithTimestamp)
      )
      
      console.log('✅ Cached token prices to Redis')
    } catch (error) {
      console.error('❌ Failed to cache token prices:', error)
      // Don't rethrow - allow application to continue without cache
    }
  }

  static async getCachedTokenPrices(): Promise<Record<string, number> | null> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured, skipping cache')
        return null
      }

      const cached = await redis!.get(CACHE_KEYS.TOKEN_PRICES)
      if (cached) {
        const data = JSON.parse(cached as string)
        console.log('✅ Retrieved token prices from cache')
        return data.prices
      }
      return null
    } catch (error) {
      console.error('❌ Failed to get cached token prices:', error)
      return null
    }
  }

  // --- CACHE MANAGEMENT ---
  static async clearCache(pattern?: string): Promise<void> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping cache operation')
        return
      }

      if (pattern) {
        // Clear specific pattern (Note: Upstash Redis may not support SCAN)
        console.log(`🧹 Clearing cache pattern: ${pattern}`)
      } else {
        // Clear all Sovry cache keys
        const keys = Object.values(CACHE_KEYS).filter(key => typeof key === 'string')
        for (const key of keys) {
          await redis!.del(key as string)
        }
        console.log('🧹 Cleared all Sovry cache')
      }
    } catch (error) {
      console.error('❌ Failed to clear cache:', error)
    }
  }

  static async getCacheStats(): Promise<{
    pools: boolean
    goldsky: boolean
    uptime: string
  }> {
    try {
      if (!this.isConfigValid()) {
        return {
          pools: false,
          goldsky: false,
          uptime: 'Redis disabled'
        }
      }

      const poolsExist = await redis!.exists(CACHE_KEYS.POOLS)
      const goldskyExist = await redis!.exists(CACHE_KEYS.GOLDSKY_RESPONSE)
      
      return {
        pools: poolsExist === 1,
        goldsky: goldskyExist === 1,
        uptime: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error)
      return {
        pools: false,
        goldsky: false,
        uptime: 'Error'
      }
    }
  }

  // --- HEALTH CHECK ---
  static async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConfigValid()) {
        console.warn('⚠️ Redis not configured or disabled, skipping health check')
        return false
      }

      const testKey = 'sovry:health:test'
      const testValue = Date.now().toString()
      
      await redis!.set(testKey, testValue, { ex: 10 })
      const retrieved = await redis!.get(testKey)
      await redis!.del(testKey)
      
      return retrieved === testValue
    } catch (error) {
      console.error('❌ Redis health check failed:', error)
      return false
    }
  }
}

export default RedisService
