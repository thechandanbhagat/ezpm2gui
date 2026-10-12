// Record only the isolated synthetic fixture, using the real built application UI.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const work = path.join(root, 'demo/log-analysis');
const inspectOnly = process.argv.includes('--inspect-only');
const scenes = [
  { index: 1, start: 2.8, title: 'From logs to diagnosis', caption: 'Start with the service that failed: checkout-api, eight restarts.' },
  { index: 2, start: 9.3, title: 'Capture the evidence', caption: 'Raw output, stack traces, process status, and restart count.' },
  { index: 3, start: 18.9, title: 'Review before sending', caption: 'A numbered snapshot. Common secrets redacted. Review what the agent receives.' },
  { index: 4, start: 29.4, title: 'Use your installed agent', caption: 'Reuse CLI sign-in. Choose a downloaded Ollama model for local inference.' },
  { index: 5, start: 40.9, title: 'Choose what is sent', caption: 'Cloud analysis starts only after explicit consent.' },
  { index: 6, start: 47.0, title: 'Follow the evidence', caption: 'Cited log lines → possible causes → practical checks. You decide what changes.' },
];

(async () => {
  fs.mkdirSync(path.join(work, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(work, 'raw'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 },
      ...(inspectOnly ? {} : { recordVideo: { dir: path.join(work, 'raw'), size: { width: 1920, height: 1080 } } }),
    });
    const fixture = await (await context.request.get('http://127.0.0.1:3117/api/demo')).json();
    if (!fixture.synthetic || !fixture.simulatedAnalysis) throw new Error('Refusing to record a production backend.');
    await context.addInitScript(() => {
      localStorage.setItem('ezpm2_whats_new_seen_v1.11.1', '1');
      localStorage.setItem('ezpm2_whats_new_seen_v1.11.4', '1');
      localStorage.setItem('ezpm2gui-theme', 'dark');
    });
    const pageCreated = Date.now();
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    const failedApi = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/api/') && response.status() >= 400) failedApi.push({ url: response.url(), status: response.status() });
    });
    await page.goto('file://' + path.join(work, 'stage.html'));
    const app = page.frameLocator('#app');
    const row = app.getByRole('row').filter({ hasText: 'checkout-api' });
    await row.waitFor();
    await page.frames().find(frame => frame.url().startsWith('http://127.0.0.1:3117')).evaluate(() => {
      document.documentElement.style.zoom = '1.275';
    });
    await page.waitForTimeout(650);
    const started = Date.now();
    const startupWallSeconds = (started - pageCreated) / 1000;
    const timeline = [];
    const wait = ms => page.waitForTimeout(inspectOnly ? Math.min(ms, 120) : ms);
    const until = async seconds => {
      if (!inspectOnly) await page.waitForTimeout(Math.max(0, seconds * 1000 - (Date.now() - started)));
    };
    const point = async locator => {
      const box = await locator.boundingBox();
      if (!box) throw new Error('Demo pointer target is not visible.');
      await page.evaluate(({ x, y }) => {
        const cursor = document.querySelector('#cursor');
        cursor.style.opacity = '1'; cursor.style.left = `${x - 9}px`; cursor.style.top = `${y - 9}px`;
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await wait(380);
    };
    const click = async locator => {
      await point(locator);
      await locator.click();
      await page.evaluate(() => document.querySelector('#cursor').classList.add('click'));
      await wait(200);
      await page.evaluate(() => document.querySelector('#cursor').classList.remove('click'));
    };
    const screenshot = async name => {
      await page.screenshot({ path: path.join(work, `screenshots/${name}.png`) });
    };
    const scene = async number => {
      const definition = scenes[number - 1];
      await until(definition.start);
      await page.evaluate(value => window.setScene(value), definition);
      if (inspectOnly) await page.waitForTimeout(550);
      timeline.push({ ...definition, actualStart: (Date.now() - started) / 1000 });
      console.log(`Chapter ${number}: ${definition.title}`);
    };
    await screenshot('intro');
    await scene(1);
    await point(row.locator('td').nth(2));
    await until(7.2);
    await screenshot('01-dashboard');

    await scene(2);
    await click(row.getByTitle('Logs', { exact: true }));
    await app.getByPlaceholder('Filter logs...').waitFor();
    const logType = app.locator('select').filter({ has: app.locator('option[value="err"]') });
    await point(logType);
    await logType.selectOption('err');
    await app.getByText('2026-10-12T10:24:00.251Z ERROR connect ECONNREFUSED 127.0.0.1:5432', { exact: true }).waitFor();
    await until(15.3);
    await screenshot('02-error-logs');
    await until(16.8);
    await click(app.getByRole('button', { name: 'Analyze logs', exact: true }));
    const dialog = app.getByRole('dialog');
    await dialog.getByLabel('Review the redacted snapshot', { exact: true }).waitFor();
    await dialog.getByLabel('Review the redacted snapshot', { exact: true }).evaluate(element => { element.scrollTop = 0; });

    await scene(3);
    const preview = dialog.getByLabel('Review the redacted snapshot', { exact: true });
    await preview.scrollIntoViewIfNeeded();
    await point(preview);
    await screenshot('03-redacted-snapshot');
    await until(24.6);
    await preview.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }));
    await wait(1000);
    await screenshot('03-stack-trace');

    await scene(4);
    const provider = dialog.getByRole('combobox', { name: 'Provider', exact: true });
    await provider.scrollIntoViewIfNeeded();
    await point(provider);
    await wait(1400);
    await screenshot('04-providers');
    for (const [id, time] of [['claude', 31.5], ['codex', 33.0], ['cursor', 34.5], ['copilot', 36.0], ['ollama', 37.8]]) {
      await until(time);
      await provider.selectOption(id);
    }
    await dialog.getByRole('combobox', { name: 'Local model' }).waitFor();
    await point(dialog.getByRole('combobox', { name: 'Local model' }));
    await screenshot('04-local-ollama');

    await scene(5);
    await point(provider);
    await provider.selectOption('codex');
    const consent = dialog.getByRole('checkbox');
    await consent.waitFor();
    const analyze = dialog.getByRole('button', { name: 'Analyze logs', exact: true });
    if (!await analyze.isDisabled()) throw new Error('Cloud analysis should require consent.');
    await until(42.9);
    await screenshot('05-cloud-consent');
    await click(consent);
    if (await analyze.isDisabled()) throw new Error('Consented demo analysis should be enabled.');
    await until(45.0);
    await click(analyze);

    await scene(6);
    await dialog.getByText('Suspected issues', { exact: true }).waitFor();
    const details = dialog.locator('details');
    if (await details.getAttribute('open') !== null) await details.locator('summary').click();
    const report = dialog.locator('pre').last();
    await report.scrollIntoViewIfNeeded();
    await point(report);
    await wait(650);
    await page.evaluate(() => document.querySelector('#cursor').style.opacity = '0');
    await screenshot('06-evidence-report');
    await until(51.8);
    await dialog.locator('.MuiDialogContent-root').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }));
    await wait(700);
    await screenshot('06-manual-checks');
    await until(55.85);
    await page.evaluate(() => window.showOutro());
    await page.waitForTimeout(600);
    await screenshot('outro');
    await until(63.0);
    const activeDurationSeconds = (Date.now() - started) / 1000;
    const video = page.video();
    await context.close(); context = null;
    if (video) await video.saveAs(path.join(work, 'raw/walkthrough.webm'));
    // Chromium starts video a little after page creation. Measure its actual
    // lead rather than treating page-creation wall time as the first frame.
    let leadSeconds = startupWallSeconds;
    if (video) {
      const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=nw=1:nk=1', path.join(work, 'raw/walkthrough.webm')], { encoding: 'utf8' });
      const duration = Number(probe.stdout?.trim());
      if (probe.status !== 0 || !Number.isFinite(duration)) throw new Error('ffprobe could not measure the capture.');
      leadSeconds = Math.max(0, duration - activeDurationSeconds);
    }
    const reportData = { timeline, leadSeconds, startupWallSeconds, activeDurationSeconds, plannedDuration: 63, voiceDelaySeconds: 1,
      browserErrors: errors, failedApi, synthetic: true, simulatedProviders: true, simulatedAnalysis: true,
    };
    fs.writeFileSync(path.join(work, inspectOnly ? 'inspection.json' : 'timeline.json'), JSON.stringify(reportData, null, 2) + '\n');
    if (errors.length || failedApi.length) throw new Error('Recording errors: ' + JSON.stringify({ errors, failedApi }));
    console.log(inspectOnly ? 'Inspection screenshots ready.' : 'Real UI recording complete.');
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
