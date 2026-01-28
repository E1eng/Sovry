import express, { Request, Response } from 'express';
import worker from './workerInstance';

const router = express.Router();

console.log('⚡ Routes using worker memory cache for real-time updates');

router.get('/pools', async (_req: Request, res: Response) => {
  try {
    console.log('🌐 [API] Received request: GET /api/pools');
    const result = await worker.processPoolsRequest();

    if (!result.success) {
      console.warn('⚠️ [API] Worker failed to process pools request');
      return res.json({ success: false, error: result.error, data: [] });
    }

    res.json({ success: true, data: result.pools, ipPrice: result.ipPrice, timestamp: result.timestamp, source: result.source });
  } catch (error: any) {
    console.error('❌ [API] Error processing pools request:', error);
    res.status(500).json({ success: false, error: error?.message || 'Unknown error', data: [] });
  }
});

router.get('/ip-price', async (_req: Request, res: Response) => {
  try {
    console.log('🌐 [API] Received request: GET /api/ip-price');
    const status = await worker.getStatus();

    if (status.cachedPrice && status.cachedPrice !== 'none') {
      res.json({ success: true, price: parseFloat(status.cachedPrice), source: 'Worker Memory Cache', timestamp: status.lastUpdate });
    } else {
      res.status(404).json({
        success: false,
        error: 'IP price not available in cache. Background worker may not be running.',
        suggestion: 'Start the worker.js process to fetch and cache IP prices',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error('❌ [API] Error in /api/ip-price:', error);
    res.status(500).json({ success: false, error: error?.message || 'Unknown error', timestamp: new Date().toISOString() });
  }
});

router.post('/refresh-price', async (_req: Request, res: Response) => {
  try {
    console.log('🌐 [API] Received request: POST /api/refresh-price');
    const result = await worker.forceUpdatePrice();

    if (result.success) {
      res.json({ success: true, price: result.price, source: 'StoryScan API', timestamp: result.timestamp });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Failed to fetch IP price from StoryScan API', timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    console.error('❌ [API] Error in /api/refresh-price:', error);
    res.status(500).json({ success: false, error: error?.message || 'Unknown error', timestamp: new Date().toISOString() });
  }
});

router.get('/worker/status', async (_req: Request, res: Response) => {
  try {
    const status = await worker.getStatus();
    res.json({ success: true, worker: status, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unknown error', timestamp: new Date().toISOString() });
  }
});

export default router;
