const { defineConfig, devices } = require('@playwright/test');

if (!/^\d+$/.test(process.env.CR_THEME_ID || '')) throw new Error('Set CR_THEME_ID to the exact reviewed non-live theme ID');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: { timeout: 12000, toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.001 } },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://www.cocorosette.com',
    locale: 'en-GB', timezoneId: 'Europe/London', reducedMotion: 'reduce',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet-chrome', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], channel: 'chrome', viewport: { width: 390, height: 844 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone SE'], viewport: { width: 375, height: 812 } } },
  ],
});
