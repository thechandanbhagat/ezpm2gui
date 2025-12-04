// Test script for Node.js cron job
console.log(`[${new Date().toISOString()}] Test cron job executed!`);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Working directory:', process.cwd());
console.log('Arguments:', process.argv.slice(2));
