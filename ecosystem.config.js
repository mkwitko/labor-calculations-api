module.exports = {
  apps: [
    {
      name: 'labor-calculations-api',

      script: 'dist/server.js',

      instances: 1,

      exec_mode: 'fork',

      max_memory_restart: '400M',

      env: {
        NODE_ENV: 'production',
      },

      node_args: '--max-old-space-size=384',

      merge_logs: true,

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      error_file: '/dev/stderr',

      out_file: '/dev/stdout',

      autorestart: true,

      watch: false,
    },
  ],
}