/**
 * pm2 process definitions for both apps. Not used in local dev (`pnpm dev`
 * covers that) — this is the production/server-deploy path, driven by
 * scripts/deploy.sh.
 *
 * apps/api runs via tsx rather than a tsc build: @ledgera/db ships its
 * package.json "exports" pointing straight at .ts source, so a plain
 * `node dist/server.js` would crash importing it. tsx (esbuild-based,
 * already the tool `pnpm dev` uses) handles that transparently.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const apiEnv = loadEnvFile(path.join(__dirname, 'apps/api/.env'));
const webEnv = loadEnvFile(path.join(__dirname, 'apps/web/.env.production.local'));

// INSTANCE_NAME/WEB_PORT are written by scripts/deploy.sh so that multiple
// LEDGERA instances (e.g. saas + dedicated) can run on one host without
// their pm2 process names or ports colliding. Falls back to the pre-instance
// defaults if this ecosystem file is ever run outside deploy.sh.
const suffix = apiEnv.INSTANCE_NAME ? `-${apiEnv.INSTANCE_NAME}` : '';
const webPort = webEnv.WEB_PORT || '3000';

module.exports = {
  apps: [
    {
      name: `ledgera-api${suffix}`,
      cwd: path.join(__dirname, 'apps/api'),
      script: 'node_modules/.bin/tsx',
      args: 'src/server.ts',
      env: apiEnv,
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
    {
      name: `ledgera-web${suffix}`,
      cwd: path.join(__dirname, 'apps/web'),
      script: 'node_modules/.bin/next',
      args: `start -p ${webPort}`,
      env: { NODE_ENV: 'production', PORT: webPort, ...webEnv },
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
  ],
};
