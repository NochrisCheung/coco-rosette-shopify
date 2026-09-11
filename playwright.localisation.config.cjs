const { defineConfig } = require('@playwright/test');

// Offline interaction contracts. This is not authenticated Shopify preview or payment evidence.
module.exports = defineConfig({
  testDir: './tests/fixtures',
  timeout: 20000,
  expect: { timeout: 5000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  outputDir: '.quality/localisation-fixtures',
  use: { browserName: 'chromium', channel: 'chrome', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
