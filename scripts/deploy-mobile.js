#!/usr/bin/env node
// @group Configuration : Mobile app deploy script — build, install, and launch on device

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// @group Constants : Paths and platform detection
const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_DIR = path.join(ROOT_DIR, 'mobile-app');
const ANDROID_DIR = path.join(MOBILE_DIR, 'android');
const IOS_DIR = path.join(MOBILE_DIR, 'ios');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'mobile');

const IS_WINDOWS = os.platform() === 'win32';
const IS_MACOS = os.platform() === 'darwin';
const GRADLEW = IS_WINDOWS ? 'gradlew.bat' : './gradlew';

// @group Utilities > CLI : ANSI colour helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg) { console.log(msg); }
function info(msg) { console.log(`${c.cyan}ℹ${c.reset}  ${msg}`); }
function ok(msg) { console.log(`${c.green}✔${c.reset}  ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset}  ${msg}`); }
function err(msg) { console.error(`${c.red}✖${c.reset}  ${msg}`); }
function step(n, total, msg) {
  console.log(`\n${c.bold}${c.blue}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`);
}
function header(msg) {
  const line = '─'.repeat(msg.length + 4);
  log(`\n${c.bold}${c.magenta}┌${line}┐`);
  log(`│  ${msg}  │`);
  log(`└${line}┘${c.reset}\n`);
}

// @group Utilities > CLI : Argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    platform: null,      // android | ios | all
    mode: 'debug',       // debug | release
    install: false,      // install on connected device after build
    dev: false,          // start Expo dev server instead of building
    clean: false,        // clean Gradle cache before build
    output: null,        // custom output path for APK/AAB
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--android':   opts.platform = 'android'; break;
      case '--ios':       opts.platform = 'ios'; break;
      case '--all':       opts.platform = 'all'; break;
      case '--release':   opts.mode = 'release'; break;
      case '--debug':     opts.mode = 'debug'; break;
      case '--install':   opts.install = true; break;
      case '--dev':       opts.dev = true; break;
      case '--clean':     opts.clean = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--output':
        opts.output = args[++i];
        break;
      default:
        if (!arg.startsWith('--')) {
          // Positional: android | ios | dev
          if (['android', 'ios', 'all'].includes(arg)) opts.platform = arg;
          else if (arg === 'dev') opts.dev = true;
        } else {
          warn(`Unknown argument: ${arg}`);
        }
    }
  }

  // Default platform
  if (!opts.platform && !opts.dev) opts.platform = 'android';

  return opts;
}

// @group Utilities > Shell : Safe exec with output
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      stdio: opts.silent ? 'pipe' : 'inherit',
      cwd: opts.cwd ?? ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, ...opts.env },
    });
  } catch (e) {
    if (!opts.ignoreError) {
      err(`Command failed: ${cmd}`);
      if (e.stdout) log(e.stdout);
      if (e.stderr) log(e.stderr);
      process.exit(1);
    }
    return null;
  }
}

function runSilent(cmd, opts = {}) {
  return run(cmd, { ...opts, silent: true });
}

// @group Utilities > Checks : Pre-flight tool availability checks
function checkTool(name, testCmd) {
  try {
    execSync(testCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// @group Utilities > Android : Resolve adb path (PATH or well-known SDK locations)
function resolveAdb() {
  // 1. Try adb already on PATH
  if (checkTool('adb', 'adb version')) return 'adb';

  // 2. Try well-known Windows SDK locations
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [
    androidHome && path.join(androidHome, 'platform-tools', 'adb.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    'C:\\Android\\sdk\\platform-tools\\adb.exe',
    'C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return `"${candidate}"`;
  }

  return null;
}

function ensureNodeModules() {
  const nm = path.join(MOBILE_DIR, 'node_modules');
  if (!fs.existsSync(nm)) {
    info('node_modules not found — installing dependencies…');
    run('npm install', { cwd: MOBILE_DIR });
    ok('Dependencies installed');
  }
}

// @group Utilities > Android : APK/AAB output path helpers
function getApkPath(mode) {
  return path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', mode, `app-${mode}.apk`);
}

function getAabPath() {
  return path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
}

function getOutputDir(mode) {
  return path.join(DIST_DIR, 'android', mode);
}

// @group BusinessLogic > Android : Android build pipeline
function buildAndroid(mode, opts) {
  // Debug builds don't bundle JS — they load from Metro at localhost:8081.
  // For standalone device installs, always use release (JS bundled into APK).
  if (mode === 'debug' && opts.install) {
    warn('Debug APKs require a running Metro server on port 8081.');
    warn('Switching to release mode so JS is bundled into the APK.');
    mode = 'release';
  }
  const isRelease = mode === 'release';
  const totalSteps = (opts.clean ? 4 : 3) + (opts.install ? 1 : 0);
  let step_n = 0;

  header(`Building Android — ${mode.toUpperCase()}`);

  // Pre-flight checks
  if (!fs.existsSync(ANDROID_DIR)) {
    err('android/ folder not found. Run: cd mobile-app && npx expo run:android first.');
    process.exit(1);
  }

  // Release keystore check
  if (isRelease) {
    const gradleProps = path.join(ANDROID_DIR, 'gradle.properties');
    const content = fs.existsSync(gradleProps) ? fs.readFileSync(gradleProps, 'utf8') : '';
    if (!content.includes('MYAPP_UPLOAD_STORE_FILE') && !content.includes('KEYSTORE_FILE')) {
      warn('No release keystore found in gradle.properties.');
      warn('The build will use the DEBUG keystore — not suitable for Play Store.');
      warn('To set up a release keystore:');
      log(`  ${c.dim}1. Generate: keytool -genkey -v -keystore release.keystore -alias key0 -keyalg RSA -keysize 2048 -validity 10000`);
      log(`  2. Place release.keystore in mobile-app/android/app/`);
      log(`  3. Add to mobile-app/android/gradle.properties:`);
      log(`     MYAPP_UPLOAD_STORE_FILE=release.keystore`);
      log(`     MYAPP_UPLOAD_KEY_ALIAS=key0`);
      log(`     MYAPP_UPLOAD_STORE_PASSWORD=yourpassword`);
      log(`     MYAPP_UPLOAD_KEY_PASSWORD=yourpassword${c.reset}`);
      log('');
    }
  }

  // Step: Clean
  if (opts.clean) {
    step(++step_n, totalSteps, 'Cleaning Gradle build cache');
    run(`${GRADLEW} clean`, { cwd: ANDROID_DIR });
    ok('Clean complete');
  }

  // Step: Install JS deps
  step(++step_n, totalSteps, 'Checking JS dependencies');
  ensureNodeModules();
  ok('Dependencies ready');

  // Step: Gradle build
  const gradleTask = isRelease ? 'bundleRelease' : 'assembleDebug';
  step(++step_n, totalSteps, `Running Gradle ${gradleTask}`);
  info(`cwd: ${ANDROID_DIR}`);

  const buildStart = Date.now();
  run(`${GRADLEW} ${gradleTask} --no-daemon`, { cwd: ANDROID_DIR });
  const elapsed = ((Date.now() - buildStart) / 1000).toFixed(1);
  ok(`Build complete in ${elapsed}s`);

  // Step: Copy output
  step(++step_n, totalSteps, 'Copying output artifact');
  const outDir = opts.output ?? getOutputDir(mode);
  fs.mkdirSync(outDir, { recursive: true });

  if (isRelease) {
    // Copy APK for direct device install
    const apkSrc = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (fs.existsSync(apkSrc)) {
      const apkDest = path.join(outDir, `ezpm2gui-release.apk`);
      fs.copyFileSync(apkSrc, apkDest);
      ok(`APK → ${apkDest}`);
      const sizeMb = (fs.statSync(apkDest).size / 1024 / 1024).toFixed(2);
      info(`File size: ${sizeMb} MB`);

      // Also copy AAB if it exists (for Play Store)
      const aabSrc = getAabPath();
      if (fs.existsSync(aabSrc)) {
        const aabDest = path.join(outDir, `ezpm2gui-release.aab`);
        fs.copyFileSync(aabSrc, aabDest);
        ok(`AAB → ${aabDest} (Play Store)`);
      }

      if (opts.install) {
        step(++step_n, totalSteps, 'Installing APK on connected device');
        const adb = resolveAdb();
        if (!adb) {
          warn('adb not found. Add Android platform-tools to PATH or set ANDROID_HOME.');
        } else {
          const devices = runSilent(`${adb} devices`, {});
          const connected = devices?.split('\n').filter((l) => l.includes('\tdevice')).length ?? 0;
          if (connected === 0) {
            warn('No Android device/emulator connected. Skipping install.');
          } else {
            info(`Found ${connected} device(s). Installing…`);
            run(`${adb} install -r "${apkDest}"`);
            ok('APK installed');
            // Force-stop then relaunch for a clean start
            runSilent(`${adb} shell am force-stop com.ezpm2gui.mobile`, { ignoreError: true });
            runSilent(`${adb} shell am start -n com.ezpm2gui.mobile/.MainActivity`, { ignoreError: true });
            ok('App launched on device');
          }
        }
      }
    } else {
      warn('Release APK not found — check Gradle output above.');
    }
  } else {
    const apkSrc = getApkPath(mode);
    if (fs.existsSync(apkSrc)) {
      const apkDest = path.join(outDir, `ezpm2gui-${mode}.apk`);
      fs.copyFileSync(apkSrc, apkDest);
      ok(`APK → ${apkDest}`);

      const sizeMb = (fs.statSync(apkDest).size / 1024 / 1024).toFixed(2);
      info(`File size: ${sizeMb} MB`);

      // Step: Install on device
      if (opts.install) {
        step(++step_n, totalSteps, 'Installing APK on connected device');
        const adb = resolveAdb();
        if (!adb) {
          warn('adb not found. Install Android Platform Tools and add to PATH, or set ANDROID_HOME.');
        } else {
          const devices = runSilent(`${adb} devices`, {});
          const connected = devices?.split('\n').filter((l) => l.includes('\tdevice')).length ?? 0;
          if (connected === 0) {
            warn('No Android device/emulator connected. Skipping install.');
            info('Enable USB debugging on your device and reconnect, then run with --install again.');
          } else {
            info(`Found ${connected} device(s). Installing…`);
            run(`${adb} install -r "${apkDest}"`);
            ok('APK installed on device');

            // Launch the app
            const packageName = 'com.ezpm2gui.mobile';
            const launchResult = runSilent(
              `${adb} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
              { ignoreError: true }
            );
            if (launchResult !== null) {
              ok(`App launched: ${packageName}`);
            }
          }
        }
      }
    } else {
      warn('APK not found at expected path — check Gradle output above.');
    }
  }

  log('');
}

// @group BusinessLogic > iOS : iOS build pipeline
function buildIos(mode) {
  header(`Building iOS — ${mode.toUpperCase()}`);

  if (!IS_MACOS) {
    err('iOS builds require macOS with Xcode installed.');
    err('This machine is running: ' + os.platform());
    process.exit(1);
  }

  if (!fs.existsSync(IOS_DIR)) {
    err('ios/ folder not found. Run: cd mobile-app && npx expo run:ios --no-build-cache first.');
    process.exit(1);
  }

  if (!checkTool('xcodebuild', 'xcodebuild -version')) {
    err('Xcode not found. Install Xcode from the App Store.');
    process.exit(1);
  }

  info('Running Expo iOS build via expo run:ios…');
  const flag = mode === 'release' ? '--configuration Release' : '';
  run(`npx expo run:ios ${flag}`, { cwd: MOBILE_DIR });
  ok('iOS build complete');
}

// @group BusinessLogic > Dev : Start Expo development server
function startDev() {
  header('Starting Expo Dev Server');

  ensureNodeModules();

  info('Starting Metro bundler with metro-patch…');
  info(`Project: ${MOBILE_DIR}`);
  log('');
  log(`${c.dim}  Scan the QR code with Expo Go or press:${c.reset}`);
  log(`${c.dim}  a — open Android emulator/device${c.reset}`);
  log(`${c.dim}  i — open iOS simulator (macOS only)${c.reset}`);
  log(`${c.dim}  r — reload${c.reset}`);
  log('');

  // Use spawnSync so the process stays alive and stdio streams through
  const result = spawnSync(
    'npx',
    ['--require', './metro-patch.cjs', 'expo', 'start'],
    {
      cwd: MOBILE_DIR,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    }
  );

  if (result.status !== 0 && result.status !== null) {
    process.exit(result.status);
  }
}

// @group Utilities > Help : Print usage
function printHelp() {
  header('EZ PM2 GUI — Mobile Deploy Script');
  log(`${c.bold}Usage:${c.reset}`);
  log(`  node scripts/deploy-mobile.js [platform] [options]`);
  log(`  npm run mobile [-- platform] [-- options]`);
  log('');
  log(`${c.bold}Platforms:${c.reset}`);
  log(`  android          Build Android APK/AAB  (default)`);
  log(`  ios              Build iOS app (macOS + Xcode required)`);
  log(`  all              Build both platforms`);
  log(`  dev              Start Expo dev server`);
  log('');
  log(`${c.bold}Options:${c.reset}`);
  log(`  --debug          Build in debug mode (default)`);
  log(`  --release        Build in release mode (AAB for Play Store)`);
  log(`  --install        Install APK on connected device after build (Android only)`);
  log(`  --clean          Clean Gradle cache before building`);
  log(`  --output <dir>   Custom output directory for build artifacts`);
  log(`  --dev            Start Expo dev server`);
  log(`  --help, -h       Show this help`);
  log('');
  log(`${c.bold}Examples:${c.reset}`);
  log(`  node scripts/deploy-mobile.js android --debug --install`);
  log(`  node scripts/deploy-mobile.js android --release`);
  log(`  node scripts/deploy-mobile.js ios --release`);
  log(`  node scripts/deploy-mobile.js dev`);
  log(`  node scripts/deploy-mobile.js all --release`);
  log('');
  log(`${c.bold}Output locations:${c.reset}`);
  log(`  Debug APK :  dist/mobile/android/debug/ezpm2gui-debug.apk`);
  log(`  Release AAB: dist/mobile/android/release/ezpm2gui-release.aab`);
  log('');
  log(`${c.bold}Release signing:${c.reset}`);
  log(`  Set these in mobile-app/android/gradle.properties:`);
  log(`  ${c.dim}MYAPP_UPLOAD_STORE_FILE=release.keystore`);
  log(`  MYAPP_UPLOAD_KEY_ALIAS=key0`);
  log(`  MYAPP_UPLOAD_STORE_PASSWORD=<your-store-password>`);
  log(`  MYAPP_UPLOAD_KEY_PASSWORD=<your-key-password>${c.reset}`);
  log('');
}

// @group BusinessLogic > Main : Entry point
function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // Dev server mode — no platform build
  if (opts.dev) {
    startDev();
    return;
  }

  const platforms = opts.platform === 'all' ? ['android', 'ios'] : [opts.platform];

  for (const platform of platforms) {
    if (platform === 'android') {
      buildAndroid(opts.mode, opts);
    } else if (platform === 'ios') {
      buildIos(opts.mode);
    }
  }

  // Final summary
  log(`\n${c.bold}${c.green}════════════════════════════════════════${c.reset}`);
  ok(`${c.bold}Mobile build complete!${c.reset}`);
  if (!opts.install && platforms.includes('android') && opts.mode === 'debug') {
    info(`To install on a connected device, re-run with --install`);
    info(`Or: adb install dist/mobile/android/debug/ezpm2gui-debug.apk`);
  }
  log(`${c.bold}${c.green}════════════════════════════════════════${c.reset}\n`);
}

main();
