/**
 * PM2 process configuration for local/sandbox development.
 * ----------------------------------------------------------------------------
 * Runs the Next.js production server (after `npm run build`) as a managed
 * daemon process so it survives independently of any single shell command.
 */
module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      args: 'next start --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
