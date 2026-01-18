#!/usr/bin/env node

// Start worker for VPS deployment
const config = require('./config/env');
const worker = require('./worker');

console.log('🚀 Starting Sovry Worker on VPS...');
console.log('📋 Worker Configuration:');
console.log(`   - StoryScan Base: ${config.storyscanApi.baseUrl}`);
console.log(`   - Update Interval: Every ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s`);
console.log(`   - Harvest Interval: Every ${Math.floor(config.scheduler.harvestIntervalMs / 1000)}s`);
console.log('   - Cache: In-memory');

// Start the worker
worker.start().catch(error => {
  console.error('❌ Failed to start worker:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down worker gracefully...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down worker gracefully...');
  await worker.stop();
  process.exit(0);
});

console.log('✅ Worker started successfully on VPS');
