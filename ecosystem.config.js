// PM2 Ecosystem Config for Sovry Backend (VPS only)
// Frontend runs on Vercel, this is backend worker only
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'sovry-backend',
      cwd: './backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
