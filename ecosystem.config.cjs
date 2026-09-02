// PM2 process definitions for the production box.
//
// Paths are relative to `cwd` (~/CDPI-Pass/frontend), matching how the running
// server is actually registered:
//   exec_path /home/ubuntu/CDPI-Pass/frontend/dist/index.js
//   cwd       /home/ubuntu/CDPI-Pass/frontend
//
// The previous './dist/...' paths with no cwd were left over from the Docker
// image, where the app lived at /app/dist. On this box they did not resolve,
// so `pm2 start ecosystem.config.cjs --only cdpi-pass-email-worker` failed
// with "Script not found" and the worker could not be brought back up.
//
// Start both:   pm2 start ecosystem.config.cjs
// Reload app:   pm2 restart cdpi-pass --update-env
//
// NOTE: the server process is registered as "cdpi-pass", not
// "cdpi-pass-server". It predates this file; renaming would need a
// delete + restart (downtime), so this matches what is running.
module.exports = {
  apps: [
    {
      name: 'cdpi-pass',
      cwd: '/home/ubuntu/CDPI-Pass/frontend',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      // 954MB box shared with nginx; 1G would never trigger before the OOM
      // killer took something else out.
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Drains four queues: failed transactional email, mass-send, event
      // reminders and communicates. Without it, a ticket email that fails to
      // send is written to email_queue and never retried, and reminders never
      // go out.
      name: 'cdpi-pass-email-worker',
      cwd: '/home/ubuntu/CDPI-Pass/frontend',
      script: './dist/run-email-worker.js',
      instances: 1,
      // fork, not cluster: this is a singleton queue consumer. Cluster mode
      // would let a second instance appear and double-send emails.
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // It died in May on transient Neon errors ("Control plane request
      // failed", XX000, consistent with autosuspend) and was never restarted.
      // Keep retrying rather than giving up.
      max_restarts: 50,
      restart_delay: 10000,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
