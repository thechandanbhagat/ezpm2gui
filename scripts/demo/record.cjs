// Requires Playwright, a Chromium executable, and the built app on 127.0.0.1:3101.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  let context;
  try {
    context = await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:path.join(root,'demo/raw'),size:{width:1920,height:1080}}});
    const initialProcesses = await (await context.request.get('http://127.0.0.1:3101/api/processes')).json();
    const expectedNames = ['api-gateway', 'background-worker', 'event-stream'];
    if (initialProcesses.length !== 3 || !expectedNames.every(name => initialProcesses.some(p =>
      p.name === name && p.pm2_env?.namespace === 'demo' &&
      p.pm2_env?.pm_exec_path === path.join(__dirname, 'service.cjs')
    ))) throw new Error('Recording requires the isolated PM2 environment with exactly the three sample workloads.');
    await context.addInitScript(() => {
      try {localStorage.setItem('ezpm2_whats_new_seen_v1.11.1','1');localStorage.setItem('ezpm2gui-theme','dark');} catch {}
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://' + path.join(root,'demo/stage.html'));
    const frame = page.frameLocator('#app');
    await frame.getByRole('row').filter({hasText:'api-gateway'}).waitFor();
    await page.frames().find(f=>f.url().startsWith('http://127.0.0.1:3101')).evaluate(()=>document.documentElement.style.zoom='1.18');
    const started = Date.now();
    const timeline=[];
    const pause = ms => page.waitForTimeout(ms);
    const pointer = async loc => {
      const box=await loc.boundingBox();
      if(!box) throw new Error('Missing target for demo pointer');
      await page.evaluate(({x,y})=>{const c=document.querySelector('#cursor');c.style.opacity='1';c.style.left=x-9+'px';c.style.top=y-9+'px'}, {x:box.x+box.width/2,y:box.y+box.height/2});
      await pause(380);
    };
    const click = async loc => {
      await pointer(loc); await loc.click();
      await page.evaluate(()=>document.querySelector('#cursor').classList.add('click'));
      await pause(220);await page.evaluate(()=>document.querySelector('#cursor').classList.remove('click'));
    };
    const type = async (loc,value) => {await click(loc);await loc.fill('');await loc.pressSequentially(value,{delay:55});};
    const scene = async (index,title,caption,seconds,action) => {
      await page.evaluate(v=>window.setScene(v),{index,title,caption});
      const start=Date.now();timeline.push({index,title,start:(start-started)/1000});
      console.log(`Recording ${index}: ${title}`);
      await action();
      await pause(Math.max(100,seconds*1000-(Date.now()-start)));
      await page.screenshot({path:path.join(root,`demo/screenshots/scene-${index}.png`)});
      await page.evaluate(()=>document.querySelector('#cursor').style.opacity='0');
    };
    await pause(4500);
    await scene(1,'Every process. One clear view.','Search your services and see status, CPU, memory, and uptime.',9,async()=>{
      await pause(1800);const search=frame.getByPlaceholder('Search processes by name or ID...');
      await type(search,'api');await pause(2000);await search.fill('');
    });
    await scene(2,'Take action with confidence.','Restart a sample service, confirm the action, and watch it return online.',8,async()=>{
      const row=frame.getByRole('row').filter({hasText:'api-gateway'});
      await click(row.getByTitle('Restart',{exact:true}));await pause(1800);
      await click(frame.getByRole('button',{name:'Confirm',exact:true}));
      await pause(2200);
      const processes = await (await context.request.get('http://127.0.0.1:3101/api/processes')).json();
      const app=processes.find(p=>p.name==='api-gateway');
      if(app?.pm2_env?.status!=='online'||app.pm2_env.restart_time<1)throw new Error('Demo restart did not succeed');
    });
    await scene(3,'Follow performance as it happens.','Live CPU and memory charts make changes easier to see.',11,async()=>{
      await click(frame.getByRole('link',{name:'Metrics',exact:true}));
      await pause(8000);
    });
    await scene(4,'Get straight to the logs.','Stream output and highlight the text you need.',9,async()=>{
      await click(frame.getByRole('button',{name:'api-gateway',exact:true}));
      await frame.getByPlaceholder('Filter logs...').waitFor();await pause(2000);
      await type(frame.getByPlaceholder('Filter logs...'),'health');await pause(1800);
    });
    await scene(5,'Configure your next service.','Set an entry point, runtime, and environment in the deployment form.',10,async()=>{
      await click(frame.getByRole('link',{name:'Deploy App',exact:true}));
      await type(frame.locator('input[name="name"]'),'demo-api');
      await type(frame.locator('input[name="script"]'),'dist/index.js');
      await type(frame.getByPlaceholder('KEY',{exact:true}),'NODE_ENV');
      await type(frame.getByPlaceholder('value',{exact:true}),'production');
      await click(frame.getByRole('button',{name:'add',exact:true}));
    });
    await scene(6,'Make the workspace yours.','Switch themes and tune the appearance to your workflow.',8,async()=>{
      await click(frame.getByTitle('Settings',{exact:true}));
      await click(frame.getByRole('button',{name:'Appearance'}));await pause(1000);
      await click(frame.getByTitle('Switch to light mode',{exact:true}));await pause(2200);
    });
    await page.evaluate(()=>{
      const c=document.querySelector('#cover');
      c.querySelector('.kicker').textContent='EZ PM2 GUI';
      c.querySelector('h2').innerHTML='Your services.<br>Within reach.';
      c.querySelector('p').textContent='Monitor, inspect, and manage — from one workspace.';
      c.querySelector('code').textContent='npm install -g ezpm2gui';
      c.querySelector('.stamp').textContent='OPEN SOURCE · github.com/thechandanbhagat/ezpm2gui';
      c.classList.remove('hidden');
    });
    await pause(5000);
    await page.screenshot({path:path.join(root,'demo/screenshots/outro.png')});
    const video = page.video();
    await context.close(); context=null;
    await video.saveAs(path.join(root,'demo/raw/walkthrough.webm'));
    fs.writeFileSync(path.join(root,'demo/timeline.json'),JSON.stringify({timeline,browserErrors:errors,duration:(Date.now()-started)/1000},null,2));
    if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
    console.log('Recorded walkthrough.webm with no browser errors.');
  } finally {if(context)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
