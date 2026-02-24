// PM2 Ecosystem Config for Sovry Backend (VPS only)
// Build first: cd backend && npx tsc
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'sovry-backend',
      cwd: './backend',
      script: './dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './backend/logs/backend-error.log',
      out_file: './backend/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      exec_interpreter: 'node',
    },
  ],
};
