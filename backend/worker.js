// Sovry Backend Worker
// Implements the sequence diagram architecture

const config = require('./config/env');
const storyscanService = require('./services/storyscanService');
const pricingService = require('./services/pricingService');
const { pushFeesJob, harvestJob } = require('./services/royaltyHarvestService');

class SovryWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.pushIntervalId = null;
    this.harvestIntervalId = null;
    this.memoryCache = {
      price: null,
      timestamp: null
    };
  }

  /**
   * Initialize memory cache
   */
  async initializeCache() {
    console.log('⚡ Using in-memory cache for real-time updates');
    this.memoryCache = {
      price: null,
      timestamp: null
    };
    return true;
  }

  /**
   * Background Process: Fetch IP price from StoryScan and cache in memory
   * This runs on the configured interval for real-time updates
   */
  async updateIPPrice() {
    try {
      console.log('🔄 [BACKGROUND] Starting IP price update process...');
      console.log('📡 [BACKGROUND] Calling StoryScan API: GET /api/v2/stats');
      
      // Get IP price from StoryScan API with fallback
      const ipPrice = await storyscanService.getIPPriceWithFallback();
      
      if (ipPrice === null) {
        console.error('❌ [BACKGROUND] Failed to get IP price from StoryScan');
        return {
          success: false,
          error: 'Failed to fetch IP price from StoryScan'
        };
      }

      // Cache in memory for real-time updates
      this.memoryCache.price = ipPrice.toString();
      this.memoryCache.timestamp = new Date().toISOString();
      console.log(`💾 [BACKGROUND] Cached in memory: price:IP:USD = ${ipPrice}`);
      console.log(`✅ [BACKGROUND] IP price update completed: $${ipPrice}`);
        
      return {
        success: true,
        price: ipPrice,
        timestamp: new Date().toISOString(),
        source: 'StoryScan API'
      };
    } catch (error) {
      console.error('❌ [BACKGROUND] Error in IP price update:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * User Request Process: Handle /api/pools request
   * Gets reserves from Goldsky, price from memory cache, calculates final price
   */
  async processPoolsRequest() {
    try {
      console.log('🌐 [USER REQUEST] Processing /api/pools request...');
      
      // Step 1: Get pool reserves from Goldsky (Database)
      console.log('📊 [USER REQUEST] Fetching reserves from Goldsky DB...');
      const poolsData = await pricingService.getPoolsFromGoldsky();
      
      if (!poolsData || poolsData.length === 0) {
        console.warn('⚠️ [USER REQUEST] No pools data from Goldsky');
        return {
          success: false,
          error: 'No pools data available',
          pools: []
        };
      }

      console.log(`📋 [USER REQUEST] Retrieved ${poolsData.length} pools from Goldsky`);

      // Step 2: Get IP price from memory cache, fallback to StoryScan if needed
      console.log('💾 [USER REQUEST] Fetching price:IP:USD from memory cache...');
      const cachedIPPrice = this.memoryCache.price;
      let ipPrice;

      if (!cachedIPPrice) {
        console.warn('⚠️ [USER REQUEST] No cached IP price in memory, fetching directly from StoryScan...');
        const freshPrice = await storyscanService.getIPPriceWithFallback();

        if (freshPrice === null) {
          console.warn('⚠️ [USER REQUEST] IP price not available (cache empty and StoryScan fetch failed)');
          ipPrice = null;
        } else {
          ipPrice = freshPrice;
          // Update in-memory cache for subsequent requests
          this.memoryCache.price = freshPrice.toString();
          this.memoryCache.timestamp = new Date().toISOString();
          console.log(`💰 [USER REQUEST] Fetched fresh IP price from StoryScan: $${ipPrice}`);
        }
      } else {
        const parsed = parseFloat(cachedIPPrice);
        ipPrice = Number.isFinite(parsed) ? parsed : null;
        console.log(`💰 [USER REQUEST] Retrieved from memory: price:IP:USD = ${ipPrice}`);
      }

      // Step 3: Normalize subgraph wrapperTokens payload for API consumers
      const processedPools = [];

      for (const pool of poolsData) {
        processedPools.push({
          ...pool,
          address: pool.id,
          ipPrice: ipPrice,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`✅ [USER REQUEST] Processed ${processedPools.length} pools with pricing`);
      
      return {
        success: true,
        pools: processedPools,
        ipPrice: ipPrice,
        timestamp: new Date().toISOString(),
        source: 'Goldsky + Worker Memory Cache'
      };
    } catch (error) {
      console.error('❌ [USER REQUEST] Error processing pools request:', error);
      return {
        success: false,
        error: error.message,
        pools: []
      };
    }
  }

  /**
   * Start the background worker
   * Runs on the configured intervals for real-time updates
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Worker is already running');
      return;
    }

    console.log('🚀 Starting Sovry Backend Worker...');
    
    // Initialize memory cache
    const cacheInitialized = await this.initializeCache();
    if (!cacheInitialized) {
      console.error('❌ Failed to start worker - Cache initialization failed');
      return;
    }

    this.isRunning = true;
    
    // Run immediately on start
    console.log('⚡ Running initial IP price update...');
    await this.updateIPPrice();

    console.log('⚡ Running initial push fees cycle...');
    await pushFeesJob();

    console.log('⚡ Running initial harvest cycle...');
    await harvestJob();
    
    // Then run periodically for real-time updates
    console.log(`⏰ Scheduling background updates every ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s...`);
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.updateIPPrice();
      }
    }, config.scheduler.priceIntervalMs);

    // Schedule push fees (hourly)
    console.log(`⏰ Scheduling push fees cycles every ${Math.floor(config.scheduler.pushIntervalMs / 1000)}s...`);
    this.pushIntervalId = setInterval(async () => {
      if (this.isRunning) {
        await pushFeesJob();
      }
    }, config.scheduler.pushIntervalMs);

    // Schedule harvest cycles (every 4h)
    console.log(`⏰ Scheduling harvest cycles every ${Math.floor(config.scheduler.harvestIntervalMs / 1000)}s...`);
    this.harvestIntervalId = setInterval(async () => {
      if (this.isRunning) {
        await harvestJob();
      }
    }, config.scheduler.harvestIntervalMs);

    console.log('✅ Sovry Backend Worker started successfully');
    console.log('📋 Worker Status:');
    console.log(`   - Background Updates: Every ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s`);
    console.log(`   - Royalty Harvest: Every ${Math.floor(config.scheduler.harvestIntervalMs / 1000)}s`);
    console.log('   - Memory Cache: IP price + timestamp');
    console.log('   - User Endpoint: /api/pools');
    console.log('   - Real-time Features: Pools');
  }

  /**
   * Stop the background worker
   */
  async stop() {
    console.log('🛑 Stopping Sovry Backend Worker...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.pushIntervalId) {
      clearInterval(this.pushIntervalId);
      this.pushIntervalId = null;
    }
    if (this.harvestIntervalId) {
      clearInterval(this.harvestIntervalId);
      this.harvestIntervalId = null;
    }
    
    console.log('✅ Sovry Backend Worker stopped');
  }

  /**
   * Get worker status
   */
  async getStatus() {
    try {
      const cachedPrice = this.memoryCache ? this.memoryCache.price : null;
      const lastUpdate = this.memoryCache ? this.memoryCache.timestamp : null;
      
      return {
        isRunning: this.isRunning,
        cache: 'memory',
        cachedPrice: cachedPrice || 'none',
        lastUpdate: lastUpdate || 'never',
        nextUpdate: this.isRunning ? `in ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s` : 'not scheduled'
      };
    } catch (error) {
      return {
        isRunning: this.isRunning,
        cache: 'error',
        error: error.message
      };
    }
  }

  /**
   * Manual price update trigger
   */
  async forceUpdatePrice() {
    console.log('🔄 Manual price update triggered...');
    return await this.updateIPPrice();
  }
}

// Create and export shared worker instance (no side effects on import)
module.exports = new SovryWorker();
