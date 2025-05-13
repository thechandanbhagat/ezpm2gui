// Simple service that logs a counter every second
let i = 0;
setInterval(() => {
  console.log(`Test service 2: ${i++}`);
}, 1000);
