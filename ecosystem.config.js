module.exports = {
  apps: [
    {
      name: 'cdpi-pass-server',
      // This path is now correct because tsup will create it
      script: './frontend/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'cdpi-pass-email-worker',
      // This path is also correct now
      script: './frontend/dist/run-email-worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};