import config from './config/env';
import storyscanService from './services/storyscanService';
import { getPoolsFromGoldsky } from './services/pricingService';
import { pushFeesJob, harvestJob } from './services/royaltyHarvestService';
import { graduationJob } from './services/graduationService';
import { startRoyaltyStateListener, stopRoyaltyStateListener } from './services/royaltyStateSyncService';

class SovryWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private pushIntervalId: NodeJS.Timeout | null = null;
  private harvestIntervalId: NodeJS.Timeout | null = null;
  private graduationIntervalId: NodeJS.Timeout | null = null;
  private memoryCache: { price: string | null; timestamp: string | null } = { price: null, timestamp: null };

  async initializeCache() {
    console.log('⚡ Using in-memory cache for real-time updates');
    this.memoryCache = { price: null, timestamp: null };
    return true;
  }

  async updateIPPrice() {
    try {
      console.log('🔄 [BACKGROUND] Starting IP price update process...');
      const ipPrice = await storyscanService.getIPPriceWithFallback();
      if (ipPrice === null) {
        console.error('❌ [BACKGROUND] Failed to get IP price from StoryScan');
        return { success: false, error: 'Failed to fetch IP price from StoryScan' };
      }
      this.memoryCache.price = ipPrice.toString();
      this.memoryCache.timestamp = new Date().toISOString();
      console.log(`💾 [BACKGROUND] Cached in memory: price:IP:USD = ${ipPrice}`);
      return { success: true, price: ipPrice, timestamp: new Date().toISOString(), source: 'StoryScan API' };
    } catch (error: any) {
      console.error('❌ [BACKGROUND] Error in IP price update:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }

  async processPoolsRequest() {
    try {
      console.log('🌐 [USER REQUEST] Processing /api/pools request...');
      const poolsData = await getPoolsFromGoldsky();
      if (!poolsData || poolsData.length === 0) {
        console.warn('⚠️ [USER REQUEST] No pools data from Goldsky');
        return { success: false, error: 'No pools data available', pools: [] };
      }
      const cachedIPPrice = this.memoryCache.price;
      let ipPrice: number | null;
      if (!cachedIPPrice) {
        const freshPrice = await storyscanService.getIPPriceWithFallback();
        if (freshPrice === null) {
          ipPrice = null;
        } else {
          ipPrice = freshPrice;
          this.memoryCache.price = freshPrice.toString();
          this.memoryCache.timestamp = new Date().toISOString();
        }
      } else {
        const parsed = parseFloat(cachedIPPrice);
        ipPrice = Number.isFinite(parsed) ? parsed : null;
      }
      const processedPools = poolsData.map((pool: any) => ({ ...pool, address: pool.id, ipPrice, timestamp: new Date().toISOString() }));
      return { success: true, pools: processedPools, ipPrice, timestamp: new Date().toISOString(), source: 'Goldsky + Worker Memory Cache' };
    } catch (error: any) {
      console.error('❌ [USER REQUEST] Error processing pools request:', error);
      return { success: false, error: error?.message || 'Unknown error', pools: [] };
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Worker is already running');
      return;
    }
    console.log('🚀 Starting Sovry Backend Worker...');
    const cacheInitialized = await this.initializeCache();
    if (!cacheInitialized) {
      console.error('❌ Failed to start worker - Cache initialization failed');
      return;
    }
    this.isRunning = true;
    
    // Start royalty state sync listener
    startRoyaltyStateListener();
    
    await this.updateIPPrice();
    await pushFeesJob();
    await harvestJob();
    await graduationJob();

    this.intervalId = setInterval(async () => {
      if (this.isRunning) await this.updateIPPrice();
    }, config.scheduler.priceIntervalMs);

    this.pushIntervalId = setInterval(async () => {
      if (this.isRunning) await pushFeesJob();
    }, config.scheduler.pushIntervalMs);

    this.harvestIntervalId = setInterval(async () => {
      if (this.isRunning) await harvestJob();
    }, config.scheduler.harvestIntervalMs);

    this.graduationIntervalId = setInterval(async () => {
      if (this.isRunning) await graduationJob();
    }, config.scheduler.graduationIntervalMs);

    console.log('✅ Sovry Backend Worker started successfully');
  }

  async stop() {
    console.log('🛑 Stopping Sovry Backend Worker...');
    this.isRunning = false;
    
    // Stop royalty state sync listener
    stopRoyaltyStateListener();
    
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.pushIntervalId) clearInterval(this.pushIntervalId);
    if (this.harvestIntervalId) clearInterval(this.harvestIntervalId);
    if (this.graduationIntervalId) clearInterval(this.graduationIntervalId);
    this.intervalId = null;
    this.pushIntervalId = null;
    this.harvestIntervalId = null;
    this.graduationIntervalId = null;
    console.log('✅ Sovry Backend Worker stopped');
  }

  async getStatus() {
    const cachedPrice = this.memoryCache?.price || null;
    const lastUpdate = this.memoryCache?.timestamp || null;
    return {
      isRunning: this.isRunning,
      cache: 'memory',
      cachedPrice: cachedPrice || 'none',
      lastUpdate: lastUpdate || 'never',
      nextUpdate: this.isRunning ? `in ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s` : 'not scheduled',
    };
  }

  async forceUpdatePrice() {
    console.log('🔄 Manual price update triggered...');
    return this.updateIPPrice();
  }
}

const worker = new SovryWorker();
export default worker;
