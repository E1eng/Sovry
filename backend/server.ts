import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import config from './config/env';
import apiRoutes from './routes';
import worker from './workerInstance';

// Start worker automatically with server
worker.start().catch(err => console.error('Failed to start worker:', err));

console.log('Starting Sovry API Server...');
console.log('Express version:', require('express/package.json').version);

const app = express();
const port = config.port;

console.log('App created, port:', port);

app.use(
  cors({
    origin: config.frontendOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Sovry DEX API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /health',
      pools: 'GET /api/pools',
      ipPrice: 'GET /api/ip-price',
      refreshPrice: 'POST /api/refresh-price',
      workerStatus: 'GET /api/worker/status',
    },
  });
});

app.use('/api', apiRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      'GET /health',
      'GET /api/pools',
      'GET /api/ip-price',
      'POST /api/refresh-price',
      'GET /api/worker/status',
    ],
  });
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error handler:', err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Something went wrong';
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message,
  });
});

app.listen(port, () => {
  console.log(`🚀 Sovry DEX API Server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔗 API endpoints: http://localhost:${port}/api`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});
