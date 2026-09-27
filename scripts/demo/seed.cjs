const path = require('path');
if (!process.env.PM2_HOME || !process.env.PM2_HOME.includes('ezpm2gui-demo')) {
  throw new Error('Set an isolated PM2_HOME containing ezpm2gui-demo before seeding.');
}
const pm2 = require('pm2');
(async () => {
  await new Promise((resolve, reject) => pm2.connect(e => e ? reject(e) : resolve()));
  for (const name of ['api-gateway', 'background-worker', 'event-stream']) {
    await new Promise((resolve, reject) => pm2.start({
      script: path.join(__dirname, 'service.cjs'), name, namespace: 'demo',
      env: { DEMO_SERVICE: name }, autorestart: false,
    }, e => e ? reject(e) : resolve()));
  }
  pm2.disconnect();
  console.log('Three isolated demo processes started.');
})().catch(e => { pm2.disconnect(); console.error(e); process.exitCode = 1; });
