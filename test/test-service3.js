// Service that logs both to stdout and stderr
let i = 0;
setInterval(() => {
  console.log(`Test service 3: ${i++}`);
  if (i % 10 === 0) console.error(`Error from service 3: ${i}`);
}, 2000);
