#!/usr/bin/env ts-node
import config from './config/env';
import worker from './worker';

console.log('🚀 Starting Sovry Worker on VPS...');
console.log('📋 Worker Configuration:');
console.log(`   - StoryScan Base: ${config.storyscanApi.baseUrl}`);
console.log(`   - Update Interval: Every ${Math.floor(config.scheduler.priceIntervalMs / 1000)}s`);
console.log(`   - Harvest Interval: Every ${Math.floor(config.scheduler.harvestIntervalMs / 1000)}s`);
console.log(`   - Graduation Interval: Every ${Math.floor(config.scheduler.graduationIntervalMs / 1000)}s`);
console.log('   - Cache: In-memory');

worker.start().catch((error: any) => {
  console.error('❌ Failed to start worker:', error);
  process.exit(1);
});

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
