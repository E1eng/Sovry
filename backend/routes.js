const express = require('express');
const worker = require('./workerInstance');

const router = express.Router();

console.log('⚡ Routes using worker memory cache for real-time updates');

// GET /api/pools - Get pools with pricing from worker
router.get("/pools", async (req, res) => {
  try {
    console.log('🌐 [API] Received request: GET /api/pools');
    
    const result = await worker.processPoolsRequest();
    
    if (!result.success) {
      console.warn('⚠️ [API] Worker failed to process pools request');
      return res.json({
        success: false,
        error: result.error,
        data: []
      });
    }

    console.log(`✅ [API] Worker processed ${result.pools.length} pools with pricing`);
    
    res.json({
      success: true,
      data: result.pools,
      ipPrice: result.ipPrice,
      timestamp: result.timestamp,
      source: result.source
    });
  } catch (error) {
    console.error('❌ [API] Error processing pools request:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

// GET /api/ip-price - Get current IP price from worker cache
router.get("/ip-price", async (req, res) => {
  try {
    console.log('🌐 [API] Received request: GET /api/ip-price');
    
    const status = await worker.getStatus();
    
    if (status.cachedPrice && status.cachedPrice !== 'none') {
      console.log(`✅ [API] Retrieved cached IP price: $${status.cachedPrice}`);
      res.json({
        success: true,
        price: parseFloat(status.cachedPrice),
        source: 'Worker Memory Cache',
        timestamp: status.lastUpdate
      });
    } else {
      console.warn('⚠️ [API] No cached IP price found');
      res.status(404).json({
        success: false,
        error: 'IP price not available in cache. Background worker may not be running.',
        suggestion: 'Start the worker.js process to fetch and cache IP prices',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [API] Error in /api/ip-price:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/refresh-price - Force refresh IP price
router.post("/refresh-price", async (req, res) => {
  try {
    console.log('🌐 [API] Received request: POST /api/refresh-price');
    
    const result = await worker.forceUpdatePrice();
    
    if (result.success) {
      console.log(`💾 [API] Updated worker cache: price:IP:USD = ${result.price}`);
      res.json({
        success: true,
        price: result.price,
        source: 'StoryScan API',
        timestamp: result.timestamp
      });
    } else {
      console.warn('⚠️ [API] Failed to get fresh IP price from StoryScan');
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch IP price from StoryScan API',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [API] Error in /api/refresh-price:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/worker/status - Get worker status
router.get("/worker/status", async (req, res) => {
  try {
    const status = await worker.getStatus();
    
    res.json({
      success: true,
      worker: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
