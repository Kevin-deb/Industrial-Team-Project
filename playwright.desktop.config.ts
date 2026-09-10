import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  outputDir: 'test-results/desktop',
  use: { trace: 'retain-on-failure' },
});
