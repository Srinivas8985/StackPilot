module.exports = {
  apps: [{
    name: 'stackpilot-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/stackpilot/backend-error.log',
    out_file: '/var/log/stackpilot/backend-out.log',
    log_file: '/var/log/stackpilot/backend-combined.log',
    time: true
  }]
};
