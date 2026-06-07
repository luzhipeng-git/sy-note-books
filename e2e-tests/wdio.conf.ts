import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the Tauri debug binary built by `pnpm tauri build --debug --no-bundle`
// When CARGO_TARGET_DIR is set (Docker E2E), binary is in the named volume;
// otherwise it's in the standard src-tauri/target/ location.
const APP_BINARY = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR, 'debug', 'sy-note-books')
  : path.resolve(__dirname, '..', 'src-tauri', 'target', 'debug', 'sy-note-books');

// Output directories
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
const REPORT_DIR = path.resolve(__dirname, 'reports');

// Ensure output directories exist
for (const dir of [SCREENSHOT_DIR, REPORT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Track the tauri-driver process
let tauriDriver: ReturnType<typeof spawn> | undefined;
let exiting = false;

function closeTauriDriver() {
  if (exiting) return;
  exiting = true;
  tauriDriver?.kill();
}

// Clean up tauri-driver on signal
process.on('SIGINT', () => { closeTauriDriver(); process.exit(130); });
process.on('SIGTERM', () => { closeTauriDriver(); process.exit(143); });
process.on('SIGHUP', () => { closeTauriDriver(); process.exit(129); });
process.on('exit', () => { tauriDriver?.kill(); });

export const config: WebdriverIO.Config = {
  // tauri-driver exposes WebDriver protocol on localhost:4444
  hostname: '127.0.0.1',
  port: 4444,

  // Test files
  specs: ['./specs/**/*.spec.ts'],
  exclude: [],

  // Single instance — Tauri desktop app, one window
  maxInstances: 1,

  capabilities: [
    {
      'tauri:options': {
        application: APP_BINARY,
      },
    } as WebdriverIO.Capabilities,
  ],

  // Test framework
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  // Reporters: spec (console) + JSON (machine-readable)
  reporters: [
    'spec',
    ['json', {
      outputDir: REPORT_DIR,
      outputFileFormat: (opts: { cid: string }) => `wdio-report-${opts.cid}.json`,
    }],
  ],

  // Build the app before running tests (unless --no-build flag is passed)
  onPrepare: async () => {
    if (process.argv.includes('--no-build')) {
      console.log('[wdio] Skipping build (--no-build flag).');
      return;
    }
    console.log('[wdio] Building Tauri app in debug mode...');
    const result = spawnSync(
      'pnpm',
      ['tauri', 'build', '--debug', '--no-bundle'],
      {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
        shell: true,
      },
    );
    if (result.status !== 0) {
      throw new Error(`[wdio] Tauri build failed with status ${result.status}`);
    }
    console.log('[wdio] Build complete.');
  },

  // Start tauri-driver before each test session and wait for it to be ready
  beforeSession: async () => {
    console.log('[wdio] Starting tauri-driver...');
    tauriDriver = spawn('tauri-driver', [], {
      stdio: [null, process.stdout, process.stderr],
    });

    tauriDriver.on('error', (error) => {
      console.error('[wdio] tauri-driver error:', error);
      process.exit(1);
    });

    tauriDriver.on('exit', (code) => {
      if (!exiting) {
        console.error(`[wdio] tauri-driver exited unexpectedly with code: ${code}`);
        process.exit(1);
      }
    });

    // Wait for tauri-driver to start accepting connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('[wdio] tauri-driver ready.');
  },

  // Stop tauri-driver after session
  afterSession: () => {
    closeTauriDriver();
  },

  // ─── Per-test hooks: failure screenshots ──────────────────
  afterTest: async (test, context, result) => {
    // Only screenshot on failure
    if (result.error) {
      const safeName = test.fullTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 120);
      const screenshotPath = path.join(SCREENSHOT_DIR, `FAIL_${safeName}.png`);
      try {
        await browser.saveScreenshot(screenshotPath);
        console.log(`[wdio] Screenshot saved: ${screenshotPath}`);
      } catch (e) {
        console.error(`[wdio] Failed to take screenshot: ${(e as Error).message}`);
      }
    }
  },

  // Per-test timeouts and retries
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
};
