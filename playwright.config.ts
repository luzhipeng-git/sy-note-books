import { defineConfig } from '@playwright/test';

/**
 * DEPRECATED: This project uses WebDriverIO + tauri-driver for E2E testing.
 * See e2e-tests/ directory for the current E2E test suite.
 *
 * This config is kept only for any future browser-based (non-Tauri) testing needs.
 * DO NOT add new E2E tests here — use e2e-tests/ instead.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
});
