module.exports = {
  apps: [{
    name: 'dem-bones',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 7080,
    },
    max_memory_restart: '200M',
    restart_delay: 2000,
  }],
};
