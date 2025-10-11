module.exports = {
  apps: [
    {
      name: 'cdpi-pass-server',
      script: './frontend/dist/server/index.js', // Correct path to your compiled server file
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
      script: './frontend/dist/server/run-email-worker.js', // Correct path to your compiled worker file
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};