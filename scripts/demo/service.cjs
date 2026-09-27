// Isolated sample workload for the product walkthrough; makes no network calls.
const label = process.env.DEMO_SERVICE || 'api-gateway';
let sequence = 0;
const startedAt = Date.now();
console.log(`${new Date().toISOString()} INFO ${label} ready | demo workload`);
setInterval(() => {
  sequence += 1;
  const activity = label === 'api-gateway' ? `GET /api/health 200 ${12 + sequence % 8}ms` : label === 'background-worker' ? `job report-${String(sequence).padStart(4, '0')} completed` : `heartbeat connected | events processed ${sequence * 12}`;
  console.log(`${new Date().toISOString()} INFO ${activity}`);
  // Brief, bounded work gives the live metrics a small real signal.
  const until = Date.now() + 12 + (sequence % 4) * 5;
  while (Date.now() < until) Math.sqrt(Math.random());
  if (Date.now() - startedAt > 60 * 60 * 1000) process.exit(0);
}, 1500);
