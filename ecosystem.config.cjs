module.exports = {
  apps: [
    {
      name: 'cdpi-pass-server',
      script: './dist/index.js',  // not ./frontend/dist/
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
      script: './dist/run-email-worker.js',  // not ./frontend/dist/
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};